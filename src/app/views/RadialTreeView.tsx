import { useEffect } from 'react'
import { useECharts } from '../../viz/useECharts'
import type { TopicQuestionIndex } from '../../domain/paperAnalysis'

type Props = {
  tree: any
  paperCounts?: Record<string, number>
  topicQuestions?: TopicQuestionIndex
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function RadialTreeView({ tree, paperCounts = {}, topicQuestions = {} }: Props) {
  const { elRef, chart } = useECharts()

  useEffect(() => {
    if (!chart.current) return

    chart.current.setOption(
      {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(255,255,255,0.97)',
          borderColor: 'rgba(15,23,42,0.1)',
          textStyle: { color: '#0f172a' },
          formatter: (p: any) => {
            const d = p.data ?? {}
            if (d.id === 'ROOT' || String(d.id).startsWith('CH_')) return `<div style="color:#0f172a">${esc(String(p.name))}</div>`
            const tags = (d.tags ?? []).slice(0, 6).join(' · ')
            const cog = (d.cognitive ?? []).join(' / ')
            const hid = String(d.id)
            const hit = paperCounts[hid] ?? 0
            const refs = topicQuestions[hid] ?? []
            const cov = Object.keys(paperCounts).length > 0
            const hitBlock =
              hit > 0 && refs.length
                ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(15,23,42,0.1);font-size:11px;color:#334155">真题命中 <strong>${hit}</strong>` +
                  refs
                    .slice(0, 2)
                    .map(
                      (r) =>
                        `<div style="margin-top:4px">· ${esc(r.paper)} ${esc(r.qid)}：${esc(r.snippet)}</div>`,
                    )
                    .join('') +
                  `</div>`
                : hit > 0
                  ? `<div style="margin-top:6px;font-size:11px;color:#0f172a">真题命中 <strong>${hit}</strong> 次</div>`
                  : cov
                    ? `<div style="margin-top:6px;font-size:11px;color:#64748b">所选真题中未匹配到本题干片段。</div>`
                    : ''
            return [
              `<div style="font-weight:650;margin-bottom:4px;color:#0f172a">${esc(String(p.name))}</div>`,
              `<div style="color:#334155;font-size:12px">章节：${esc(String(d.chapter ?? ''))}</div>`,
              `<div style="color:#334155;font-size:12px">难度：${d.difficulty ?? ''}　重要性：${d.value ?? ''}</div>`,
              `<div style="color:#334155;font-size:12px">认知：${esc(cog)}</div>`,
              tags ? `<div style="color:#334155;font-size:12px">标签：${esc(tags)}</div>` : '',
              hitBlock,
            ].join('')
          },
        },
        series: [
          {
            type: 'tree',
            data: [tree],
            top: '2%',
            left: '2%',
            bottom: '2%',
            right: '2%',
            layout: 'radial',
            // 拉开“内圈/外圈”距离，避免挤在中心
            radius: ['10%', '78%'],
            symbol: 'circle',
            symbolSize: 9,
            initialTreeDepth: 5,
            nodeGap: 10,
            roam: true,
            expandAndCollapse: true,
            animationDuration: 280,
            animationDurationUpdate: 0,
            emphasis: {
              focus: 'descendant',
            },
            lineStyle: {
              color: 'rgba(15, 23, 42, 0.32)',
              width: 1.25,
              curveness: 0.22,
            },
            label: {
              color: '#0f172a',
              fontSize: 13,
              fontWeight: 500,
              overflow: 'truncate',
              width: 200,
              backgroundColor: 'transparent',
              distance: 8,
              formatter: (p: any) => {
                const d = p?.data ?? {}
                const id = String(d.id ?? '')
                if (!id || id === 'ROOT' || id.startsWith('CH_')) return p.name
                const c = paperCounts[id] ?? 0
                return c > 0 ? `${p.name} ×${c}` : p.name
              },
            },
            leaves: {
              label: {
                color: '#1e293b',
                fontSize: 12,
                fontWeight: 500,
                distance: 10,
                formatter: (p: any) => {
                  const d = p?.data ?? {}
                  const id = String(d.id ?? '')
                  if (!id || id === 'ROOT' || id.startsWith('CH_')) return p.name
                  const c = paperCounts[id] ?? 0
                  return c > 0 ? `${p.name} ×${c}` : p.name
                },
              },
            },
          },
        ],
      },
      { notMerge: true },
    )
  }, [chart, paperCounts, topicQuestions, tree])

  // 注意：不要用 CSS transform 旋转 ECharts 容器，会导致鼠标坐标映射失真（悬浮/点击失效）
  return <div ref={elRef} className="chart-mount" style={{ width: '100%', height: '100%', minHeight: 0 }} />
}

