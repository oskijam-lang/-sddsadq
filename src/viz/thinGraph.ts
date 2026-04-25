import type { TopicEdge } from '../domain/types'

type Opts = {
  /** 每个端点最多保留多少条边（按权重排序） */
  maxEdgesPerNode?: number
  /** 全局最多保留多少条边（按权重排序） */
  maxTotalEdges?: number
}

function keyOf(e: TopicEdge): string {
  return `${e.source}\u0000${e.target}\u0000${e.type}`
}

/**
 * 大图性能优化：对边做抽稀（不改节点），优先保留高权重边。
 * 规则：对每个节点分别取 TopK（source/target 两侧都算一次），合并去重后再做全局截断。
 */
export function thinEdges(edges: TopicEdge[], opts?: Opts): TopicEdge[] {
  const maxEdgesPerNode = Math.max(2, Math.min(24, Math.floor(opts?.maxEdgesPerNode ?? 8)))
  const maxTotalEdges = Math.max(80, Math.min(5000, Math.floor(opts?.maxTotalEdges ?? 1400)))
  if (edges.length <= maxTotalEdges) return edges

  const byNode = new Map<string, TopicEdge[]>()
  for (const e of edges) {
    ;(byNode.get(e.source) ?? byNode.set(e.source, []).get(e.source)!).push(e)
    ;(byNode.get(e.target) ?? byNode.set(e.target, []).get(e.target)!).push(e)
  }

  const keep = new Map<string, TopicEdge>()
  for (const arr of byNode.values()) {
    const top = [...arr].sort((a, b) => b.weight - a.weight).slice(0, maxEdgesPerNode)
    for (const e of top) keep.set(keyOf(e), e)
  }

  const merged = Array.from(keep.values()).sort((a, b) => b.weight - a.weight)
  if (merged.length <= maxTotalEdges) return merged
  return merged.slice(0, maxTotalEdges)
}

