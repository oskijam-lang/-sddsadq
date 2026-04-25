import { useEffect } from 'react'
import { useECharts } from '../../viz/useECharts'
import type { TopicEdge } from '../../domain/types'
import type { TopicQuestionIndex } from '../../domain/paperAnalysis'

type Props = {
  graph: { nodes: any[]; links: any[] }
  focusIds?: string[]
  /** 已选真题：考点 id → 命中题数 */
  paperCounts?: Record<string, number>
  topicQuestions?: TopicQuestionIndex
  /** 有真题数据时弱化未命中节点 */
  paperCoverageActive?: boolean
  /** 性能/稳定模式：减少动态与布局漂移 */
  stableMode?: boolean
  onSelectEdge?: (edge: TopicEdge) => void
  onSelectNode?: (id: string) => void
}

const palette = [
  '#7c5cff',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#f97316',
]

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function ForceGraphView({
  graph,
  focusIds = [],
  paperCounts = {},
  topicQuestions = {},
  paperCoverageActive = true,
  stableMode = false,
  onSelectEdge,
  onSelectNode,
}: Props) {
  const { elRef, chart } = useECharts()

  useEffect(() => {
    if (!chart.current) return
    const categories = Array.from(new Set(graph.nodes.map((n) => n.category))).map((c, i) => ({
      name: c,
      itemStyle: { color: palette[i % palette.length] },
    }))

    const focus = new Set(focusIds)
    const cov = Boolean(paperCoverageActive) && Object.keys(paperCounts).length > 0
    const nodes2 = graph.nodes.map((n) => {
      const focused = focus.size === 0 || focus.has(n.id)
      const hit = paperCounts[n.id] ?? 0
      const dimUnhit = cov && hit === 0 && focused
      const itemStyle: Record<string, unknown> = {}
      if (!focused) itemStyle.opacity = 0.18
      else if (dimUnhit) itemStyle.opacity = 0.4
      if (hit > 0) {
        itemStyle.borderColor = 'rgba(6, 182, 212, 0.98)'
        itemStyle.borderWidth = Math.min(3, 1.4 + Math.min(hit, 5) * 0.25)
        itemStyle.shadowBlur = 12
        itemStyle.shadowColor = 'rgba(34, 211, 238, 0.35)'
      }
      return {
        ...n,
        itemStyle: Object.keys(itemStyle).length ? itemStyle : focused ? undefined : { opacity: 0.18 },
        label: {
          ...(n.label ?? {}),
          opacity: focused ? (dimUnhit ? 0.55 : 1) : 0.28,
        },
      }
    })
    const links2 = graph.links.map((l: any) => {
      const focused = focus.size === 0 || focus.has(l.source) || focus.has(l.target)
      return {
        ...l,
        lineStyle: {
          ...(l.lineStyle ?? {}),
          opacity: focused ? 0.75 : 0.12,
        },
      }
    })

    chart.current.setOption(
      {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(255,255,255,0.97)',
          borderColor: 'rgba(15,23,42,0.1)',
          textStyle: { color: '#0f172a', fontSize: 12 },
          formatter: (p: any) => {
            if (p.dataType === 'edge') {
              return `<div style="font-weight:650">${p.data.edgeType}</div><div style="opacity:.85">${p.data.source} → ${p.data.target}</div>`
            }
            const d = p.data ?? {}
            const hid = d.id as string
            const hit = paperCounts[hid] ?? 0
            const refs = topicQuestions[hid] ?? []
            const refHtml =
              hit > 0 && refs.length
                ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(15,23,42,0.1);font-size:11px;color:#334155">真题命中 <strong>${hit}</strong> 次` +
                  refs
                    .slice(0, 3)
                    .map(
                      (r) =>
                        `<div style="margin-top:4px;line-height:1.35">· <span style="color:#0f172a">${esc(r.paper)}</span> ${esc(r.qid)}：${esc(r.snippet)}</div>`,
                    )
                    .join('') +
                  `</div>`
                : hit > 0
                  ? `<div style="margin-top:6px;font-size:11px;color:#0f172a">真题命中 <strong>${hit}</strong> 次（详情见左侧考点编辑）</div>`
                  : cov
                    ? `<div style="margin-top:6px;font-size:11px;color:#64748b">当前所选真题卷中未匹配到该考点题干片段。</div>`
                    : ''
            return [
              `<div style="font-weight:650;margin-bottom:4px;color:#0f172a">${esc(String(p.name))}</div>`,
              `<div style="color:#334155;font-size:12px">章节：${esc(String(d.category ?? ''))}</div>`,
              `<div style="color:#334155;font-size:12px">难度：${d.difficulty ?? ''}　重要性：${d.importance ?? ''}</div>`,
              `<div style="color:#334155;font-size:12px">认知：${esc(String(d.cognitive ?? ''))}</div>`,
              `<div style="color:#334155;font-size:12px">标签：${esc((d.tags ?? []).slice(0, 7).join(' · '))}</div>`,
              refHtml,
            ].join('')
          },
        },
        legend: [
          {
            data: categories.map((c) => c.name),
            top: 12,
            left: 12,
            orient: 'vertical',
            textStyle: { color: '#334155', fontSize: 12 },
            itemGap: 8,
            itemWidth: 10,
            itemHeight: 10,
            selectedMode: true,
          },
        ],
        series: [
          {
            type: 'graph',
            layout: 'force',
            roam: true,
            draggable: true,
            focusNodeAdjacency: true,
            progressive: 260,
            progressiveThreshold: 700,
            data: nodes2,
            links: links2,
            categories,
            force: {
              initLayout: 'circular',
              repulsion: stableMode ? 130 : 180,
              edgeLength: [40, 160],
              gravity: stableMode ? 0.11 : 0.06,
              friction: stableMode ? 0.88 : 0.78,
              layoutAnimation: false,
            },
            label: {
              show: true,
              color: '#111827',
              fontSize: 12,
              fontWeight: 500,
              formatter: (p: any) => {
                const d = p.data ?? {}
                const hit = paperCounts[d.id] ?? 0
                if (hit > 0) return `${p.name} ×${hit}`
                return p.data.symbolSize >= 16 ? p.name : ''
              },
            },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: 8,
            lineStyle: {
              color: 'rgba(15, 23, 42, 0.2)',
              width: 1.2,
            },
            emphasis: {
              lineStyle: { width: 2.4, opacity: 0.85 },
              itemStyle: { borderColor: '#0f172a', borderWidth: 1.2 },
            },
          },
        ],
      },
      { notMerge: true },
    )
  }, [chart, focusIds, graph, paperCounts, paperCoverageActive, topicQuestions])

  useEffect(() => {
    if (!chart.current) return
    const inst = chart.current
    const handler = (p: any) => {
      if (p.dataType === 'node') {
        onSelectNode?.(p.data.id)
        return
      }
      if (p.dataType !== 'edge') return
      const ed: TopicEdge = {
        source: p.data.source,
        target: p.data.target,
        type: p.data.edgeType,
        weight: p.data.value ?? 1,
      }
      onSelectEdge?.(ed)
    }
    inst.on('click', handler)
    return () => {
      inst.off('click', handler)
    }
  }, [chart, onSelectEdge, onSelectNode])

  return <div ref={elRef} className="chart-mount" style={{ width: '100%', height: '100%', minHeight: 0 }} />
}

