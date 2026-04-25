/**
 * 为 ECharts `tree` 数据叠加「真题命中」描边，并在有真题筛选时弱化未命中叶子。
 * 与 decorateEChartsTreeData（搜索种子）可先后套用在深拷贝后的树上。
 */
export function decorateTreePaperHits(
  root: any,
  paperCounts: Record<string, number>,
  opts?: { dimUnmatched?: boolean },
): any {
  const out = JSON.parse(JSON.stringify(root)) as any
  const active = Boolean(opts?.dimUnmatched) && Object.keys(paperCounts).length > 0

  function walk(n: any) {
    if (!n || typeof n !== 'object') return
    const id = n.id as string | undefined
    const isTopic = id && id !== 'ROOT' && !String(id).startsWith('CH_')
    if (isTopic) {
      const c = paperCounts[id!] ?? 0
      if (c > 0) {
        const base = n.itemStyle && typeof n.itemStyle === 'object' ? n.itemStyle : {}
        n.itemStyle = {
          ...base,
          borderColor: 'rgba(6, 182, 212, 0.98)',
          borderWidth: Math.min(3.2, 1.2 + Math.min(c, 5) * 0.35),
          shadowBlur: 12,
          shadowColor: 'rgba(34, 211, 238, 0.38)',
        }
        const lab = typeof n.label === 'object' && n.label ? n.label : {}
        n.label = { color: '#0f172a', fontWeight: 650, fontSize: 11, ...lab }
      } else if (active) {
        const base = n.itemStyle && typeof n.itemStyle === 'object' ? n.itemStyle : {}
        n.itemStyle = { ...base, opacity: 0.42 }
        const lab = typeof n.label === 'object' && n.label ? n.label : {}
        n.label = { color: 'rgba(15, 23, 42, 0.42)', fontSize: 11, ...lab }
      }
    }
    for (const ch of n.children ?? []) walk(ch)
  }
  walk(out)
  return out
}
