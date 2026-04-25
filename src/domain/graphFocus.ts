import { primaryAxis } from './firstPrinciples'
import type { TopicNode } from './types'

/** 多概念/搜索在子图上的高亮：种子 + 桥接枢纽（空表示不弱化、全亮） */
export type GraphFocusTiers = { seedIds: string[]; bridgeIds: string[] }

export const emptyGraphFocus = (): GraphFocusTiers => ({ seedIds: [], bridgeIds: [] })

export const isGraphFocusActive = (f: GraphFocusTiers): boolean =>
  f.seedIds.length + f.bridgeIds.length > 0

/** 2=种子, 1=桥, 0=普通子图内考点 */
export const topicTier = (id: string, f: GraphFocusTiers): 0 | 1 | 2 => {
  if (f.seedIds.includes(id)) return 2
  if (f.bridgeIds.includes(id)) return 1
  return 0
}

export function buildHighlightAxes(
  f: GraphFocusTiers,
  byId: Map<string, TopicNode>,
): Set<string> {
  const s = new Set<string>()
  for (const id of f.seedIds) {
    const n = byId.get(id)
    if (n) s.add(primaryAxis(n))
  }
  for (const id of f.bridgeIds) {
    const n = byId.get(id)
    if (n) s.add(primaryAxis(n))
  }
  return s
}

export function buildHighlightChapters(
  f: GraphFocusTiers,
  byId: Map<string, TopicNode>,
): Set<string> {
  const s = new Set<string>()
  for (const id of f.seedIds) {
    const n = byId.get(id)
    if (n) s.add(n.chapter)
  }
  for (const id of f.bridgeIds) {
    const n = byId.get(id)
    if (n) s.add(n.chapter)
  }
  return s
}

export function buildFocusTopicLabels(
  f: GraphFocusTiers,
  byId: Map<string, TopicNode>,
): Set<string> {
  const s = new Set<string>()
  for (const id of f.seedIds) {
    const n = byId.get(id)
    if (n) s.add(n.label)
  }
  for (const id of f.bridgeIds) {
    const n = byId.get(id)
    if (n) s.add(n.label)
  }
  return s
}
