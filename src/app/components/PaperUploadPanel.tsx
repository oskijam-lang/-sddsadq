import { useEffect, useMemo, useState } from 'react'
import type { CatalogIndex } from '../../domain/types'
import {
  analyzePaperText,
  buildTopicQuestionIndex,
  extractTextFromDocx,
  extractTextFromPdf,
  type TopicQuestionIndex,
} from '../../domain/paperAnalysis'
import type { PaperListItem } from '../state/paperLibrary'

type Props = {
  index: CatalogIndex
  onApplyCounts: (counts: Record<string, number>) => void
  onApplyTopicQuestions: (tq: TopicQuestionIndex) => void
  lib: {
    items: PaperListItem[]
    selectedIds: string[]
    selected: Set<string>
    refresh: () => Promise<void>
    upload: (file: File, displayName: string) => Promise<string>
    saveAnalysis: (paperId: string, payload: { topicCounts: any; topicQuestions: any; questionCount: number }) => Promise<void>
    loadAnalysis: (paperId: string) => Promise<any>
    rename: (paperId: string, displayName: string) => Promise<void>
    remove: (paperId: string) => Promise<void>
    toggleSelect: (paperId: string) => void
  }
}

export function PaperUploadPanel({ index, onApplyCounts, onApplyTopicQuestions, lib }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [paperFilter, setPaperFilter] = useState('')
  const [openPaperId, setOpenPaperId] = useState<string>('')
  const [openPaper, setOpenPaper] = useState<{ id: string; analysis: any } | null>(null)
  const [mergedCounts, setMergedCounts] = useState<Record<string, number>>({})

  const topTopics = useMemo(() => {
    return Object.entries(mergedCounts)
      .map(([id, c]) => ({ id, c, label: index.byId.get(id)?.label ?? id }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 18)
  }, [index.byId, mergedCounts])

  const filteredItems = useMemo(() => {
    const q = paperFilter.trim().toLowerCase()
    if (!q) return lib.items
    return lib.items.filter((it) => {
      const name = (it.meta?.displayName ?? it.id).toLowerCase()
      const ori = (it.meta?.originalName ?? '').toLowerCase()
      return name.includes(q) || ori.includes(q) || it.id.toLowerCase().includes(q)
    })
  }, [lib.items, paperFilter])

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!openPaperId) {
        setOpenPaper(null)
        return
      }
      try {
        const a = await lib.loadAnalysis(openPaperId)
        if (!alive) return
        setOpenPaper({ id: openPaperId, analysis: a })
      } catch {
        if (!alive) return
        setOpenPaper({ id: openPaperId, analysis: null })
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [lib, openPaperId])

  const openQuestions = useMemo(() => {
    const a = openPaper?.analysis
    if (!a || !a.topicQuestions) return []
    const byQ = new Map<string, { qid: string; paper: string; text: string }>()
    for (const arr of Object.values<any>(a.topicQuestions)) {
      if (!Array.isArray(arr)) continue
      for (const r of arr) {
        const k = `${r.paper}\u0000${r.qid}`
        if (!byQ.has(k)) byQ.set(k, { qid: r.qid, paper: r.paper, text: r.fullText ?? r.snippet ?? '' })
      }
    }
    return Array.from(byQ.values())
      .filter((x) => x.text && x.text.length > 0)
      .sort((x, y) => x.qid.localeCompare(y.qid))
  }, [openPaper])

  // 选中的“本地文件夹”决定哪些真题标记叠加到图上
  useEffect(() => {
    let alive = true
    const run = async () => {
      const ids = lib.selectedIds
      if (ids.length === 0) {
        onApplyCounts({})
        onApplyTopicQuestions({})
        return
      }
      const mergedCounts: Record<string, number> = {}
      const mergedTQ: TopicQuestionIndex = {}
      for (const id of ids) {
        try {
          const a = await lib.loadAnalysis(id)
          for (const [tid, c] of Object.entries(a.topicCounts ?? {})) {
            mergedCounts[tid] = (mergedCounts[tid] ?? 0) + Number(c ?? 0)
          }
          for (const [tid, arr] of Object.entries(a.topicQuestions ?? {})) {
            const cur = (mergedTQ[tid] ??= [])
            if (Array.isArray(arr)) cur.push(...arr)
          }
        } catch {
          // ignore missing analysis
        }
      }
      if (!alive) return
      setMergedCounts(mergedCounts)
      onApplyCounts(mergedCounts)
      onApplyTopicQuestions(mergedTQ)
    }
    run()
    return () => {
      alive = false
    }
  }, [lib, lib.selectedIds, onApplyCounts, onApplyTopicQuestions])

  const processFileList = async (files: File[]) => {
    if (files.length === 0) return
    setErr(null)
    setBusy(true)
    try {
      for (const f of files) {
        const lower = f.name.toLowerCase()
        if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
          setErr((prev) => [prev, `已跳过非 PDF/DOCX：${f.name}`].filter(Boolean).join('\n'))
          continue
        }
        const baseName = (displayName.trim() || f.name).replace(/\.[^.]+$/, '')
        const paperId = await lib.upload(f, baseName)

        const ext = (f.name.split('.').pop() ?? '').toLowerCase()
        const raw = ext === 'pdf' ? await extractTextFromPdf(f) : await extractTextFromDocx(f)
        if (raw.length < 80) {
          setErr((prev) =>
            [
              prev,
              `文件「${f.name}」文本过少：可能是扫描版 PDF（未接 OCR），已跳过。`,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          continue
        }
        const a = analyzePaperText(index, raw)
        const tq = buildTopicQuestionIndex(a, baseName)
        await lib.saveAnalysis(paperId, {
          topicCounts: a.topicCounts,
          topicQuestions: tq,
          questionCount: a.questions.length,
        })
      }
      setDisplayName('')
      await lib.refresh()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="paper-panel">
      <div className="paper-title">本地真题文件夹（永久存储）</div>
      <div className="paper-sub">
        上传的文件将保存到项目目录 <strong>papers/</strong>（仅你本机使用）。可自定义命名；下方列表就是你的“文件夹”。
      </div>

      <div className="control" style={{ marginTop: 8 }}>
        <label>自定义命名（可空，默认用文件名）</label>
        <input
          value={displayName}
          placeholder="例如：2025 真题（数一）"
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <div
        className={`paper-drop-zone${dragOver ? ' paper-drop-active' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const fs = Array.from(e.dataTransfer.files ?? [])
          void processFileList(fs)
        }}
      >
        将 PDF / Word 真题拖到此区域，或点击下方按钮选择文件（可多选）。需先运行{' '}
        <code style={{ fontSize: '0.72rem' }}>npm run dev</code> 以启动本地 papers API。
      </div>

      <input
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        disabled={busy}
        style={{ marginTop: 10 }}
        onChange={async (ev) => {
          const fs = Array.from(ev.target.files ?? [])
          ev.target.value = ''
          await processFileList(fs)
        }}
      />

      {busy && <div className="paper-hint">正在解析与映射…</div>}
      {err && <div className="paper-err">{err}</div>}

      <div className="paper-list-title">文件夹内容</div>
      <div className="paper-folder">
        {lib.items.length === 0 ? (
          <div className="paper-hint">还没有导入文件。</div>
        ) : (
          <>
            <div className="control" style={{ marginBottom: 10 }}>
              <label>搜索文件夹</label>
              <input
                value={paperFilter}
                placeholder="按名称 / 原文件名 / id 搜索"
                onChange={(e) => setPaperFilter(e.target.value)}
              />
            </div>
          <ul className="paper-files">
            {filteredItems.map((it) => (
              <li key={it.id} className="paper-file-row">
                <label className="paper-file-left">
                  <input
                    type="checkbox"
                    checked={lib.selected.has(it.id)}
                    onChange={() => {
                      lib.toggleSelect(it.id)
                    }}
                  />
                  <span className="paper-file-name">{it.meta?.displayName ?? it.id}</span>
                </label>
                <span className="paper-topic-meta">
                  {it.analysisSummary ? `题目 ${it.analysisSummary.questions} / 覆盖 ${it.analysisSummary.topics}` : '未分析'}
                </span>
                <button
                  type="button"
                  className="touch-btn touch-btn-tiny"
                  onClick={() => setOpenPaperId((cur) => (cur === it.id ? '' : it.id))}
                >
                  {openPaperId === it.id ? '收起题目' : '查看题目'}
                </button>
                <button
                  type="button"
                  className="touch-btn touch-btn-tiny"
                  onClick={() => {
                    const next = prompt('重命名', it.meta?.displayName ?? '')
                    if (next) lib.rename(it.id, next)
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="touch-btn touch-btn-tiny touch-btn-danger"
                  onClick={() => lib.remove(it.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>

      {openPaperId && (
        <div style={{ marginTop: 10 }}>
          <div className="paper-list-title">题目清单（{openQuestions.length || openPaper?.analysis?.questionCount || 0}）</div>
          {!openPaper?.analysis ? (
            <div className="paper-hint">该文件尚未解析或缺少分析结果（可重新上传同名文件覆盖）。</div>
          ) : openQuestions.length === 0 ? (
            <div className="paper-hint">暂无可展示题干（可能是扫描版 PDF 或切题失败）。</div>
          ) : (
            <ol className="paper-topics">
              {openQuestions.slice(0, 25).map((q) => (
                <li key={`${q.paper}-${q.qid}`}>
                  <span className="paper-topic-label">{q.qid}</span>
                  <span className="paper-topic-meta">（{q.paper}）</span>
                  <div className="paper-topic-meta" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                    {q.text.slice(0, 260)}
                    {q.text.length > 260 ? '…' : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {openQuestions.length > 25 && <div className="paper-hint">仅展示前 25 题（避免侧栏过长）。</div>}
        </div>
      )}

      {Object.keys(mergedCounts).length > 0 && (
        <>
          <div className="paper-kpi">
            <div className="paper-chip">已选文件：{lib.selectedIds.length}</div>
            <div className="paper-chip">覆盖考点：{Object.keys(mergedCounts).length}</div>
          </div>

          <div className="paper-list-title">高频考点（Top）</div>
          <ol className="paper-topics">
            {topTopics.map((t) => (
              <li key={t.id}>
                <span className="paper-topic-label">{t.label}</span>
                <span className="paper-topic-meta">
                  ×{t.c} <span className="paper-topic-id">{t.id}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

