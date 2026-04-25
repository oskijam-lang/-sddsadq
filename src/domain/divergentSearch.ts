import type { TopicEdge, TopicNode } from './types'
import {
  buildSearchHaystack,
  expandByEdgeHops,
  matchAllTokens,
  tokenHitsNode,
  tokenizeSearchQuery,
} from './searchUtils'

/** 不对应具体考点的“学习话语”，从检索式中剥掉，避免 AND 全灭、利于多概念拆句 */
export const QUERY_STOPWORDS = new Set([
  '深度',
  '耦合',
  '关系',
  '如何',
  '为什么',
  '怎样',
  '怎么',
  '什么',
  '是否',
  '可以',
  '需要',
  '还是',
  '或者',
  '这些',
  '这种',
  '一个',
  '我们',
  '就是',
  '如果',
  '因为',
  '所以',
  '这样',
  '那么',
  '对',
  '不',
  '有',
  '是',
  '了',
  '在',
  '为',
  '到',
  '要',
  '以及',
  '还有',
  '涌现',
  '嵌合',
  '发散',
  '举一反三',
  '联想',
  '综合',
  '系统',
  '网络',
  '图',
  '底',
  '理解',
  '掌握',
  '学习',
  '比较',
  '相关',
  '不同',
  '异同',
  '区别',
  '哪些',
  '几类',
  '主要',
  '核心',
  '重点',
])

/** 单概念：按多 token 取平均命中（如「变」「上限」拆开的弱命中） */
function scoreForConcept(n: TopicNode, concept: string, tokens: string[]): number {
  const hay = buildSearchHaystack(n)
  const tks = tokens.length > 0 ? tokens : [concept]
  let s = 0
  for (const t of tks) {
    if (tokenHitsNode(t, hay, n)) s += 1
  }
  if (tokenHitsNode(concept, hay, n)) s += 0.5
  return s / tks.length
}

export function topKForConcept(base: TopicNode[], concept: string, k: number): TopicNode[] {
  const subTok = tokenizeSearchQuery(concept)
  const scored = base
    .map((n) => ({ n, s: scoreForConcept(n, concept, subTok) }))
    .filter((x) => x.s > 0.25)
    .sort((a, b) => b.s - a.s)
  return scored.slice(0, k).map((x) => x.n)
}

function filterMeaningfulTokensInSegment(raw: string): string[] {
  return tokenizeSearchQuery(raw).filter(
    (x) => x.length > 0 && !QUERY_STOPWORDS.has(x) && !/^\d+$/.test(x),
  )
}

/** 对整段查询做分词+去噪，供多概念判据用 */
export function filterMeaningfulTokensFromQuery(raw: string): string[] {
  return filterMeaningfulTokensInSegment(raw)
}

type Adj = Map<string, Set<string>>
function buildAdj(edges: TopicEdge[], allowed: Set<string>): Adj {
  const m = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    if (!allowed.has(a) || !allowed.has(b)) return
    if (!m.has(a)) m.set(a, new Set())
    m.get(a)!.add(b)
  }
  for (const e of edges) {
    add(e.source, e.target)
    add(e.target, e.source)
  }
  return m
}

/** 从种子出发 k 步可达（限制在 allowed 内） */
function reachableWithin(adj: Adj, seeds: string[], k: number): Set<string> {
  const out = new Set<string>(seeds)
  let f = new Set<string>(seeds)
  for (let i = 0; i < k; i++) {
    const n = new Set<string>()
    for (const s of f) {
      for (const t of adj.get(s) ?? []) n.add(t)
    }
    for (const s of n) out.add(s)
    f = n
  }
  return out
}

function shortestPath(adj: Adj, s: string, t: string, maxDepth: number): string[] | null {
  if (s === t) return [s]
  const q: { id: string; p: string[] }[] = [{ id: s, p: [s] }]
  const vis = new Set<string>([s])
  let qi = 0
  while (qi < q.length) {
    const { id, p } = q[qi++]!
    if (p.length > maxDepth) continue
    for (const n2 of adj.get(id) ?? []) {
      if (vis.has(n2)) continue
      vis.add(n2)
      const p2 = [...p, n2]
      if (n2 === t) return p2
      q.push({ id: n2, p: p2 })
    }
  }
  return null
}

export type ConceptPick = { phrase: string; topIds: string[]; topLabels: string[] }

export type DivergentSearchInsight = {
  kind: 'divergent'
  /** 从查询里读出的多概念子句 */
  conceptPicks: ConceptPick[]
  /** 多概念 2 跳前缘的交：常见“桥”考点 */
  bridgeIds: string[]
  /** 概念代表点之间的短路径（便于举一反三） */
  pathSummaries: { path: string[]; labelPath: string }[]
  /** 多源 BFS 展开 */
  expandHops: number
  seedCount: number
  expandedNodeCount: number
}

/**
 * 是否走「多概念联合发散」：两个以上有效词，且**不存在**一个考点同时满足所有词（AND 为空）
 * 或用户显式写了「A与B / A、B / A和B」等
 */
export function shouldUseDivergentSearch(raw: string, base: TopicNode[], tokensFiltered: string[]): boolean {
  if (tokensFiltered.length < 2) return false
  const andHit = base.filter((n) => matchAllTokens(n, tokensFiltered))
  if (andHit.length > 0) {
    /** 如「A与B」等显式多轴，即使用 AND 有命中，也并轨发散，便于看整图关联 */
    const explicitMulti = /(\S+(\s*与\s*|\s*和\s*|\s*及\s*|\s*、\s*)\S+)|\S+以及\S+|\S+对比\S+/.test(
      raw,
    )
    if (explicitMulti) return true
  }
  return andHit.length === 0
}

/** 把长句按「与/和/及/、/以及/对比」切成概念短语，否则用去噪后各分词作独立概念 */
function splitIntoConceptualPhrases(raw: string, tokensFiltered: string[]): string[] {
  if (/[与和及、]|以及|对比/.test(raw)) {
    const segs = raw.split(/(?:[与和及、]|以及|对比)/g)
    const cleaned: string[] = []
    for (const seg0 of segs) {
      const parts = filterMeaningfulTokensInSegment(seg0)
      if (parts.length === 0) continue
      cleaned.push(parts.join(' ').trim())
    }
    if (cleaned.length >= 2) return cleaned
  }
  if (tokensFiltered.length >= 2) return tokensFiltered.map((t) => t)
  if (tokensFiltered.length === 1) return [tokensFiltered[0]!]
  return []
}

export function runDivergentSearch(
  base: TopicNode[],
  raw: string,
  tokensFiltered: string[],
  allEdges: TopicEdge[],
  baseIdSet: Set<string>,
  opts: { kPerConcept: number; expandHops: number } = { kPerConcept: 10, expandHops: 4 },
): {
  seedIds: Set<string>
  expanded: Set<string>
  insight: DivergentSearchInsight
} {
  let concepts = splitIntoConceptualPhrases(raw, tokensFiltered)
  if (concepts.length === 0 && tokensFiltered.length > 0) concepts = [...tokensFiltered]
  const conceptPicks: ConceptPick[] = []
  const seedIds = new Set<string>()

  for (const c of concepts) {
    const tok = c.includes(' ') || c.includes('　') ? c.split(/[\s　]+/) : [c]
    const tClean = tok.map((t) => t.trim()).filter((t) => t.length > 0 && !QUERY_STOPWORDS.has(t))
    const phrase = tClean.length > 0 ? tClean.join(' ') : c
    const top = topKForConcept(base, phrase, opts.kPerConcept)
    for (const n of top) seedIds.add(n.id)
    conceptPicks.push({
      phrase,
      topIds: top.map((n) => n.id),
      topLabels: top.map((n) => n.label).slice(0, 4),
    })
  }

  if (seedIds.size === 0) {
    return {
      seedIds,
      expanded: new Set(),
      insight: {
        kind: 'divergent',
        conceptPicks: [],
        bridgeIds: [],
        pathSummaries: [],
        expandHops: opts.expandHops,
        seedCount: 0,
        expandedNodeCount: 0,
      },
    }
  }

  const expanded = expandByEdgeHops(seedIds, allEdges, baseIdSet, opts.expandHops)
  const allowed = new Set([...baseIdSet].filter((id) => expanded.has(id)))
  const adj = buildAdj(
    allEdges.filter((e) => allowed.has(e.source) && allowed.has(e.target)),
    allowed,
  )

  const bridgeIds: string[] = []
  if (conceptPicks.length >= 2) {
    const a0 = new Set<string>(conceptPicks[0]!.topIds)
    const a1 = new Set<string>(conceptPicks[1]!.topIds)
    if (a0.size && a1.size) {
      const r0 = reachableWithin(adj, [...a0], 2)
      const r1 = reachableWithin(adj, [...a1], 2)
      for (const id of r0) {
        if (r1.has(id) && !a0.has(id) && !a1.has(id)) bridgeIds.push(id)
      }
    }
  }
  const bridgePick = new Set(bridgeIds.slice(0, 24))
  for (const id of bridgePick) expanded.add(id)

  const byId = new Map(base.map((n) => [n.id, n] as const))
  const pathSummaries: { path: string[]; labelPath: string }[] = []
  if (conceptPicks.length >= 2) {
    const a = conceptPicks[0]!.topIds[0]
    const b = conceptPicks[1]!.topIds[0]
    if (a && b && a !== b) {
      const p = shortestPath(adj, a, b, 9)
      if (p) {
        pathSummaries.push({
          path: p,
          labelPath: p.map((id) => byId.get(id)?.label ?? id).join(' → '),
        })
      }
    }
  }

  return {
    seedIds,
    expanded,
    insight: {
      kind: 'divergent',
      conceptPicks,
      bridgeIds: [...bridgePick],
      pathSummaries,
      expandHops: opts.expandHops,
      seedCount: seedIds.size,
      expandedNodeCount: expanded.size,
    },
  }
}
