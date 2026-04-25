import type { CatalogIndex, TopicEdge, TopicNode } from '../domain/types'
import { isLeafLikeTopic, primaryAxis } from '../domain/firstPrinciples'

export function subgraph(index: CatalogIndex, filteredNodes: TopicNode[]) {
  const nodeIds = new Set(filteredNodes.map((n) => n.id))
  const edges = index.edges.filter((ed) => nodeIds.has(ed.source) && nodeIds.has(ed.target))
  return { nodes: filteredNodes, edges }
}

export function buildRadialTree(index: CatalogIndex, nodes: TopicNode[]) {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const chapterRoots = new Map<string, any>()

  const root = {
    name: '高等数学',
    id: 'ROOT',
    children: [] as any[],
  }

  for (const ch of index.chapters) {
    const chNode = {
      name: ch,
      id: `CH_${ch}`,
      children: [] as any[],
    }
    chapterRoots.set(ch, chNode)
    root.children.push(chNode)
  }

  // include only nodes in set; build by parentId within chapter.
  const byId = new Map<string, TopicNode>()
  for (const n of nodes) byId.set(n.id, n)

  const treeById = new Map<string, any>()
  for (const n of nodes) {
    treeById.set(n.id, {
      name: n.label,
      id: n.id,
      value: n.importance,
      difficulty: n.difficulty,
      chapter: n.chapter,
      cognitive: n.cognitive,
      tags: n.tags,
      children: [] as any[],
    })
  }

  for (const n of nodes) {
    const t = treeById.get(n.id)
    const pid = n.parentId
    if (pid && nodeIds.has(pid) && treeById.has(pid)) {
      treeById.get(pid).children.push(t)
    } else {
      chapterRoots.get(n.chapter)?.children.push(t)
    }
  }

  for (const [, t] of treeById) {
    t.children.sort((a: any, b: any) => a.name.localeCompare(b.name, 'zh-CN'))
  }
  for (const [, chNode] of chapterRoots) {
    chNode.children.sort((a: any, b: any) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  return root
}

export function toEChartsGraph(nodes: TopicNode[], edges: TopicEdge[]) {
  const degree = new Map<string, number>()
  for (const ed of edges) {
    degree.set(ed.source, (degree.get(ed.source) ?? 0) + ed.weight)
    degree.set(ed.target, (degree.get(ed.target) ?? 0) + ed.weight)
  }

  return {
    nodes: nodes.map((n) => {
      const d = degree.get(n.id) ?? 0
      return {
        id: n.id,
        name: n.label,
        value: d,
        symbolSize: Math.max(14, Math.min(48, 12 + d * 6 + n.importance * 1.25)),
        category: primaryAxis(n),
        difficulty: n.difficulty,
        importance: n.importance,
        cognitive: n.cognitive.join(' / '),
        tags: n.tags,
      }
    }),
    links: edges.map((ed) => ({
      source: ed.source,
      target: ed.target,
      value: ed.weight,
      lineStyle: {
        opacity: 0.55,
        width: Math.max(1, Math.min(5, ed.weight * 3)),
        curveness: 0.18,
      },
      edgeType: ed.type,
    })),
  }
}

export function toSankey(nodes: TopicNode[], edges: TopicEdge[]) {
  // Sankey：章 -> 认知过程 -> 考点
  const sankeyNodes = new Map<string, { name: string }>()
  const sankeyLinks: Array<{ source: string; target: string; value: number }> = []

  function ensure(name: string) {
    if (!sankeyNodes.has(name)) sankeyNodes.set(name, { name })
  }

  for (const n of nodes) {
    const ch = `章｜${n.chapter}`
    ensure(ch)
    for (const cog of n.cognitive) {
      const c = `认知｜${cog}`
      ensure(c)
      ensure(n.label)
      sankeyLinks.push({ source: ch, target: c, value: n.importance })
      sankeyLinks.push({ source: c, target: n.label, value: Math.max(1, n.importance - 1) })
    }
  }

  // 关系边：把“强依赖/共现”作为额外流，强化结构（不影响可读性则保留）
  for (const ed of edges) {
    if (ed.type === 'PREREQ' || ed.type === 'CO_OCCUR') {
      const s = nodes.find((x) => x.id === ed.source)?.label
      const t = nodes.find((x) => x.id === ed.target)?.label
      if (s && t) {
        ensure(s)
        ensure(t)
        sankeyLinks.push({ source: s, target: t, value: Math.max(1, Math.round(ed.weight * 3)) })
      }
    }
  }

  return {
    nodes: Array.from(sankeyNodes.values()),
    links: sankeyLinks,
  }
}

/** 桑基：元轴 → 叶子考点，并叠加叶子间的 PREREQ / DERIVES 细流 */
export function toSankeyFirstPrinciples(nodes: TopicNode[], edges: TopicEdge[]) {
  const sankeyNodes = new Map<string, { name: string }>()
  const sankeyLinks: Array<{ source: string; target: string; value: number }> = []

  function ensure(name: string) {
    if (!sankeyNodes.has(name)) sankeyNodes.set(name, { name })
  }

  for (const n of nodes) {
    if (!isLeafLikeTopic(n)) continue
    const ax = primaryAxis(n)
    const left = `元轴｜${ax}`
    ensure(left)
    ensure(n.label)
    sankeyLinks.push({ source: left, target: n.label, value: Math.max(1, n.importance) })
  }

  for (const ed of edges) {
    if (ed.type !== 'PREREQ' && ed.type !== 'DERIVES') continue
    const u = nodes.find((x) => x.id === ed.source)
    const v = nodes.find((x) => x.id === ed.target)
    if (!u || !v) continue
    if (!isLeafLikeTopic(u) || !isLeafLikeTopic(v)) continue
    ensure(u.label)
    ensure(v.label)
    sankeyLinks.push({
      source: u.label,
      target: v.label,
      value: Math.max(1, Math.round(ed.weight * 2)),
    })
  }

  return {
    nodes: Array.from(sankeyNodes.values()),
    links: sankeyLinks,
  }
}

