import { useEffect } from 'react'
import { useECharts } from '../../viz/useECharts'

type Props = {
  data: { nodes: Array<{ name: string }>; links: Array<{ source: string; target: string; value: number }> }
  reverse?: boolean
  graphFocusActive?: boolean
  highlightAxes?: Set<string>
  focusTopicLabels?: Set<string>
  /** 真题覆盖：用于青色描边，与搜索金色分开 */
  examAxes?: Set<string>
  examTopicLabels?: Set<string>
  /** 已选真题且存在命中时：弱化未出现在真题中的节点 */
  paperHighlightMode?: boolean
}

function nodeDimmed(name: string, active: boolean, ax: Set<string>, labels: Set<string>): boolean {
  if (!active) return false
  if (ax.size === 0 && labels.size === 0) return false
  if (name.startsWith('元轴｜')) return !ax.has(name.slice(3))
  return !labels.has(name)
}

export function SankeyView({
  data,
  reverse = false,
  graphFocusActive = false,
  highlightAxes,
  focusTopicLabels,
  examAxes,
  examTopicLabels,
  paperHighlightMode = false,
}: Props) {
  const { elRef, chart } = useECharts()

  useEffect(() => {
    if (!chart.current) return
    const ax = highlightAxes ?? new Set<string>()
    const lb = focusTopicLabels ?? new Set<string>()
    const exAx = examAxes ?? new Set<string>()
    const exLb = examTopicLabels ?? new Set<string>()
    const paperOn = paperHighlightMode && (exAx.size > 0 || exLb.size > 0)
    const active = graphFocusActive
    const nodes2 = data.nodes.map((n) => {
      const dimSearch = nodeDimmed(n.name, active, ax, lb)
      const exam =
        (n.name.startsWith('元轴｜') && exAx.has(n.name.slice(3))) ||
        (!n.name.startsWith('元轴｜') && exLb.has(n.name))
      const dimPaper =
        paperOn &&
        ((n.name.startsWith('元轴｜') && !exAx.has(n.name.slice(3))) ||
          (!n.name.startsWith('元轴｜') && !exLb.has(n.name)))
      const dim = dimSearch || dimPaper
      return {
        ...n,
        itemStyle: {
          opacity: dim ? 0.22 : 1,
          borderColor: exam ? 'rgba(34,211,238,0.9)' : undefined,
          borderWidth: exam ? 1.6 : 0,
        },
        label: { color: dim ? 'rgba(15, 23, 42, 0.35)' : '#0f172a', fontWeight: dim ? 400 : 500 },
      }
    })
    const links2 = data.links.map((l) => {
      if (!active || (ax.size === 0 && lb.size === 0)) {
        return { ...l, lineStyle: { opacity: 0.55 } }
      }
      const sDim = nodeDimmed(l.source, true, ax, lb)
      const tDim = nodeDimmed(l.target, true, ax, lb)
      const em = !sDim && !tDim ? 0.7 : sDim && tDim ? 0.06 : 0.28
      return { ...l, lineStyle: { opacity: em, curveness: 0.5 } as any }
    })

    chart.current.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => {
            if (p.dataType === 'edge') {
              return `<div style="font-weight:650">${p.data.source} → ${p.data.target}</div><div style="opacity:.85">权重：${p.data.value}</div>`
            }
            return `<div style="font-weight:650">${p.name}</div>`
          },
        },
        series: [
          {
            type: 'sankey',
            top: 18,
            left: 12,
            right: 12,
            bottom: 12,
            data: nodes2,
            links: links2,
            emphasis: { focus: 'adjacency' },
            orient: 'horizontal',
            nodeAlign: reverse ? 'right' : 'left',
            // 部分版本支持 roam；不支持时也不影响渲染
            roam: true as any,
            nodeWidth: 12,
            nodeGap: 11,
            draggable: true,
            lineStyle: {
              color: 'gradient',
              curveness: 0.5,
              opacity: 0.55,
            },
            label: {
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 500,
              overflow: 'truncate',
              width: 200,
            },
          },
        ],
      },
      { notMerge: true },
    )
  }, [chart, data, examAxes, examTopicLabels, focusTopicLabels, graphFocusActive, highlightAxes, paperHighlightMode, reverse])

  return <div ref={elRef} className="chart-mount" style={{ width: '100%', height: '100%', minHeight: 0 }} />
}

