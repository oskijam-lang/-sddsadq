import type { GraphFocusTiers } from '../domain/graphFocus'
import { isGraphFocusActive, topicTier } from '../domain/graphFocus'

/** 为 ECharts `tree` 的 data 打种子/桥/弱化（深拷贝，避免污染同一份 buildRadialTree 结果） */
export function decorateEChartsTreeData(root: any, f: GraphFocusTiers) {
  const out = JSON.parse(JSON.stringify(root)) as any
  const active = isGraphFocusActive(f)

  function walk(n: any) {
    if (!n || typeof n !== 'object') return
    const id = n.id
    if (id && id !== 'ROOT' && !String(id).startsWith('CH_')) {
      if (!active) {
        return
      }
      const t = topicTier(String(id), f)
      if (t === 2) {
        n.itemStyle = { color: '#d4a556', borderColor: '#fbbf24', borderWidth: 2, shadowBlur: 8 }
        n.label = { color: '#111827', fontWeight: 700, fontSize: 12 }
      } else if (t === 1) {
        n.itemStyle = { color: 'rgba(20, 184, 166, 0.95)', borderColor: '#22d3ee', borderWidth: 1.5 }
        n.label = { color: '#0f172a', fontSize: 12 }
      } else {
        n.itemStyle = { color: 'rgba(120, 120, 130, 0.35)' }
        n.label = { color: 'rgba(15, 23, 42, 0.35)', fontSize: 11 }
      }
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(out)
  return out
}
