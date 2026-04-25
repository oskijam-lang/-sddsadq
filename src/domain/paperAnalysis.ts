import mammoth from 'mammoth'
import type { CatalogIndex, TopicNode } from './types'
import { QUERY_STOPWORDS } from './divergentSearch'
import { scoreTopicMatch, tokenizeSearchQuery } from './searchUtils'

export type QuestionItem = {
  qid: string
  text: string
}

export function buildTopicQuestionIndex(analysis: PaperAnalysis, paperName: string): TopicQuestionIndex {
  const byQ = new Map<string, QuestionItem>()
  for (const q of analysis.questions) byQ.set(q.qid, q)

  const out: Record<string, TopicQuestionRef[]> = {}

  // 只用 topicCounts 里出现的 topicId（避免把“弱匹配”全部灌进去）
  const keepTopics = new Set(Object.keys(analysis.topicCounts))

  // 对每题取该题的 top2（按 score）且 topic 在 keepTopics
  const byQMatches = new Map<string, QuestionTopicMatch[]>()
  for (const m of analysis.matches) {
    if (!keepTopics.has(m.topicId)) continue
    const arr = byQMatches.get(m.qid) ?? []
    arr.push(m)
    byQMatches.set(m.qid, arr)
  }

  for (const [qid, ms] of byQMatches) {
    const q = byQ.get(qid)
    if (!q) continue
    const top = [...ms].sort((a, b) => b.score - a.score).slice(0, 2)
    const snippet = q.text.replace(/\s+/g, ' ').slice(0, 120)
    for (const m of top) {
      const arr = (out[m.topicId] ??= [])
      arr.push({
        paper: paperName,
        qid,
        snippet: snippet + (q.text.length > 120 ? '…' : ''),
        fullText: q.text,
      })
    }
  }

  // 去重 qid
  for (const [tid, arr] of Object.entries(out)) {
    const seen = new Set<string>()
    out[tid] = arr.filter((x) => (seen.has(x.qid) ? false : (seen.add(x.qid), true)))
  }
  return out
}

export type QuestionTopicMatch = {
  qid: string
  topicId: string
  score: number
}

export type PaperAnalysis = {
  rawText: string
  questions: QuestionItem[]
  matches: QuestionTopicMatch[]
  topicCounts: Record<string, number>
}

export type TopicQuestionRef = {
  paper: string
  qid: string
  snippet: string
  fullText: string
}

export type TopicQuestionIndex = Record<string, TopicQuestionRef[]>

export async function extractTextFromDocx(file: File): Promise<string> {
  const ab = await file.arrayBuffer()
  const res = await mammoth.extractRawText({ arrayBuffer: ab })
  const txt = String(res.value ?? '')
  return normalizeText(txt)
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const ab = await file.arrayBuffer()
  // pdfjs-dist 2.x：legacy build 兼容性更好
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
  // 在 Vite 中用 URL 绑定 worker
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  ;(pdfjs as any).GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.js',
    import.meta.url,
  ).toString()

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const loadingTask = (pdfjs as any).getDocument({ data: ab })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const doc = await loadingTask.promise

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const items = tc.items as any[]
    const txt = items.map((it) => String(it.str ?? '')).join(' ')
    pages.push(txt)
  }
  return normalizeText(pages.join('\n\n'))
}

function normalizeText(s: string): string {
  return s
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** 朴素切题：先跑通闭环，后续再用版式/关键词/LLM 纠错增强 */
export function splitQuestionsFromText(rawText: string): QuestionItem[] {
  const text0 = normalizeText(rawText)
  if (!text0) return []

  // 先做一轮“去页眉页脚”降噪：统计重复行（出现次数多且短）
  const lines0 = text0.split('\n').map((s) => s.trim()).filter(Boolean)
  const freq = new Map<string, number>()
  for (const l of lines0) {
    if (l.length > 40) continue
    freq.set(l, (freq.get(l) ?? 0) + 1)
  }
  const noisy = new Set<string>()
  for (const [l, c] of freq) {
    if (c >= 4 && !/^(?:\d+|第?\d+页|共\d+页)$/i.test(l)) noisy.add(l)
  }
  const text = normalizeText(
    lines0
      .filter((l) => !noisy.has(l))
      .join('\n'),
  )

  // 基于全文定位题号起点（比“逐行”更不漏）
  // 支持：一、 二． 1. 2) （1） 第1题 / 专升本常见「1、」/ Question 1 / 【例1】
  const headRe =
    /(^|\n)\s*(?:第\s*\d+\s*题|【\s*例\s*\d+\s*】|Question\s*\d+|[一二三四五六七八九十百]{1,3}\s*[、.．]|(?:\d{1,3})\s*[、.．)]|（\d{1,3}）)\s*/gi

  const hits: Array<{ i: number; m: string }> = []
  for (let m = headRe.exec(text); m; m = headRe.exec(text)) {
    hits.push({ i: m.index + (m[1] ? m[1].length : 0), m: m[0] })
    if (hits.length > 800) break
  }

  const slices: Array<{ start: number; end: number }> = []
  if (hits.length >= 2) {
    for (let k = 0; k < hits.length; k++) {
      const s = hits[k]!.i
      const e = k + 1 < hits.length ? hits[k + 1]!.i : text.length
      if (e - s > 10) slices.push({ start: s, end: e })
    }
  } else {
    // 兜底：按空行分段
    const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0)
    let acc = 0
    for (const p of paras) {
      const s = text.indexOf(p, acc)
      if (s >= 0) {
        slices.push({ start: s, end: s + p.length })
        acc = s + p.length
      }
    }
  }

  const out: QuestionItem[] = []
  let qi = 0
  for (const sl of slices) {
    const t = text.slice(sl.start, sl.end).trim()
    // 把明显不是题目的段落过滤掉，但阈值尽量低以“保证全提取”
    if (t.length < 18) continue
    // 跳过“参考答案/评分标准”等非题干
    if (/^(?:参考答案|答案|解析|评分标准|参考解答)/.test(t)) continue
    qi += 1
    out.push({ qid: `Q${String(qi).padStart(2, '0')}`, text: t })
  }

  // 再兜底：如果切出来过少，按行头题号切分回退
  if (out.length <= 2) {
    const lines = text.split('\n')
    const chunks: string[] = []
    let buf: string[] = []
    const isHeadLine = (l: string) =>
      /^\s*(?:第\s*\d+\s*题|【\s*例\s*\d+\s*】|Question\s*\d+|[一二三四五六七八九十百]{1,3}\s*[、.．]|\d{1,3}\s*[、.．)]|（\d{1,3}）)\s*/i.test(
        l.trim(),
      )
    for (const line0 of lines) {
      const line = line0.trimEnd()
      if (!line.trim()) continue
      if (isHeadLine(line)) {
        if (buf.length) chunks.push(buf.join('\n'))
        buf = [line.trim()]
      } else {
        buf.push(line.trim())
      }
    }
    if (buf.length) chunks.push(buf.join('\n'))
    const out2: QuestionItem[] = []
    for (let i = 0; i < chunks.length; i++) {
      const t = chunks[i]!.trim()
      if (t.length < 18) continue
      out2.push({ qid: `Q${String(i + 1).padStart(2, '0')}`, text: t })
    }
    if (out2.length > out.length) return out2
  }

  return out
}

function meaningfulTokensFromFreeText(text: string): string[] {
  const tokens = tokenizeSearchQuery(text)
  return tokens.filter((t) => t.length > 0 && !QUERY_STOPWORDS.has(t))
}

export function rankTopicsForQuestion(base: TopicNode[], qText: string, topK: number): { id: string; score: number }[] {
  const toks = meaningfulTokensFromFreeText(qText)
  if (toks.length === 0) return []
  const scored = base
    .map((n) => ({ id: n.id, s: scoreTopicMatch(n, toks) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
  return scored.map((x) => ({ id: x.id, score: x.s }))
}

export function analyzePaperText(index: CatalogIndex, rawText: string): PaperAnalysis {
  const questions = splitQuestionsFromText(rawText)
  const matches: QuestionTopicMatch[] = []
  const counts: Record<string, number> = {}

  for (const q of questions) {
    const top = rankTopicsForQuestion(index.nodes, q.text, 5)
    for (const t of top) {
      const m: QuestionTopicMatch = { qid: q.qid, topicId: t.id, score: t.score }
      matches.push(m)
    }
    // 计数：每题仅计一次（取 top1 或 score>=阈值）
    const keep = top.filter((x) => x.score >= Math.max(1, top[0]?.score ?? 1))
    for (const x of keep.slice(0, 2)) {
      counts[x.id] = (counts[x.id] ?? 0) + 1
    }
  }

  return {
    rawText: normalizeText(rawText),
    questions,
    matches,
    topicCounts: counts,
  }
}

