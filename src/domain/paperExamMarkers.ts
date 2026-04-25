import type { CatalogIndex } from './types'
import { primaryAxis } from './firstPrinciples'

/** 从真题映射的考点 id → 桑基/力导向用的考点「标题」集合 */
export function buildExamTopicLabels(index: CatalogIndex, paperCounts: Record<string, number>): Set<string> {
  const s = new Set<string>()
  for (const id of Object.keys(paperCounts)) {
    const n = index.byId.get(id)
    if (n) s.add(n.label)
  }
  return s
}

/** 弦图元轴：任一命中考点落在该元轴则高亮 */
export function buildExamAxes(index: CatalogIndex, paperCounts: Record<string, number>): Set<string> {
  const s = new Set<string>()
  for (const id of Object.keys(paperCounts)) {
    const n = index.byId.get(id)
    if (n) s.add(primaryAxis(n))
  }
  return s
}

/** 出题热力图：命中考点所属章节 */
export function buildExamChapters(index: CatalogIndex, paperCounts: Record<string, number>): Set<string> {
  const s = new Set<string>()
  for (const id of Object.keys(paperCounts)) {
    const n = index.byId.get(id)
    if (n) s.add(n.chapter)
  }
  return s
}
