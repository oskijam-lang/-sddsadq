import { useEffect, useMemo } from 'react'
import type { CatalogIndex } from '../../domain/types'
import { blueprintsForCell, examHeatmapMatrix, EXAM_ARCHETYPES, EXAM_HEATMAP_CHAPTERS } from '../../domain/examBlueprint'
import { useECharts } from '../../viz/useECharts'
import type { PaperHeatmap } from '../../domain/paperHeatmap'

type Props = {
  index: CatalogIndex
  graphFocusActive?: boolean
  highlightChapters?: Set<string>
  /** 真题覆盖的章节：青色描边，与搜索金色描边分开 */
  examChapters?: Set<string>
  /** 若提供，则使用真题统计热力图替代默认蓝图矩阵 */
  paperHeatmap?: PaperHeatmap | null
}

export function ExamHeatmapView({
  index,
  graphFocusActive = false,
  highlightChapters,
  examChapters,
  paperHeatmap = null,
}: Props) {
  const { elRef, chart } = useECharts()
  const { chapters, archetypes, data: rawData } = useMemo(() => {
    if (paperHeatmap) return paperHeatmap
    return examHeatmapMatrix()
  }, [paperHeatmap])

  const dataWithFrame = useMemo(() => {
    const hc = highlightChapters ?? new Set<string>()
    const on = graphFocusActive && hc.size > 0
    const ec = examChapters ?? new Set<string>()
    return rawData.map((cell) => {
      const [xi, yi, v] = cell
      const ch = EXAM_HEATMAP_CHAPTERS[yi] ?? ''
      if (on && hc.has(ch)) {
        return {
          value: [xi, yi, v] as [number, number, number],
          itemStyle: {
            borderColor: 'rgba(251, 191, 36, 0.9)',
            borderWidth: 1.5,
            shadowBlur: 6,
            shadowColor: 'rgba(251, 191, 36, 0.25)',
          },
        }
      }
      if (ec.has(ch)) {
        return {
          value: [xi, yi, v] as [number, number, number],
          itemStyle: {
            borderColor: 'rgba(34, 211, 238, 0.85)',
            borderWidth: 1.2,
          },
        }
      }
      return { value: [xi, yi, v] as [number, number, number] }
    })
  }, [examChapters, graphFocusActive, highlightChapters, rawData])

  useEffect(() => {
    if (!chart.current) return

    const labelOf = (id: string) => index.byId.get(id)?.label ?? id
    const cellRefs = paperHeatmap?.cellRefs ?? {}

    chart.current.setOption({
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        position: 'top',
        enterable: true,
        confine: true,
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        borderColor: 'rgba(15, 23, 42, 0.12)',
        borderWidth: 1,
        textStyle: { color: '#0f172a', fontSize: 12 },
        extraCssText: 'max-width:420px;white-space:normal;text-align:left;box-shadow:0 8px 24px rgba(15,23,42,0.12);',
        formatter: (p: any) => {
          const d = (p?.data?.value ?? p?.data) as [number, number, number] | undefined
          if (!d) return ''
          const [xi, yi] = d
          const ch = chapters[yi] ?? EXAM_HEATMAP_CHAPTERS[yi] ?? ''
          const arch = archetypes[xi] ?? EXAM_ARCHETYPES[xi] ?? ''

          // 真题热力：展示该格子来自哪些题目
          if (paperHeatmap) {
            const k = `${ch}\u0000${arch}`
            const refs = cellRefs[k] ?? []
            const top = refs.slice(0, 10)
            const list = top
              .map(
                (r) =>
                  `<div style="margin-top:4px;line-height:1.35">· <span style="color:#0f172a">${r.paper}</span> ${r.qid}：${r.snippet}</div>`,
              )
              .join('')
            return [
              `<div style="font-weight:650;margin-bottom:6px;color:#0f172a">${ch} × ${arch}</div>`,
              `<div style="color:#334155;font-size:12px;margin-bottom:6px">本格子统计来自已选真题（去重到 paper+题号）。</div>`,
              `<div style="color:#0f172a;font-size:12px">题目数：<strong>${refs.length}</strong></div>`,
              refs.length ? `<div style="margin-top:8px;font-size:11px;color:#334155">${list}</div>` : '',
            ].join('')
          }

          const bps = blueprintsForCell(ch, arch)
          const bp = bps[0]
          if (!bp) return ''

          const bullets = bp.bullets.map((b) => `• ${b}`).join('<br/>')
          const rel = bp.relatedTopicIds
            .slice(0, 12)
            .map((id) => `· ${labelOf(id)}`)
            .join('<br/>')

          return [
            `<div style="font-weight:650;margin-bottom:6px;color:#0f172a">${bp.title}</div>`,
            `<div style="color:#334155;font-size:12px;margin-bottom:8px">题型维度「${arch}」× 内容维度「${ch}」下的常见命题骨架（非穷举，用于总览）</div>`,
            `<div style="color:#1e293b;font-size:12px;line-height:1.45;margin-bottom:8px">${bullets}</div>`,
            `<div style="color:#64748b;font-size:11px;margin-bottom:4px">关联考点（可回左侧搜索 id）：</div>`,
            `<div style="color:#334155;font-size:11px;line-height:1.4">${rel || '—'}</div>`,
          ].join('')
        },
      },
      grid: { left: 8, right: 36, top: 56, bottom: 16, containLabel: true },
      xAxis: {
        type: 'category',
        data: [...archetypes],
        splitArea: {
          show: true,
          areaStyle: { color: ['rgba(248, 250, 252, 0.95)', 'rgba(241, 245, 249, 0.9)'] },
        },
        axisLine: { lineStyle: { color: 'rgba(15, 23, 42, 0.12)' } },
        axisTick: { lineStyle: { color: 'rgba(15, 23, 42, 0.1)' } },
        axisLabel: { color: '#0f172a', fontSize: 12, fontWeight: 500, interval: 0, rotate: 22 },
      },
      yAxis: {
        type: 'category',
        data: chapters,
        splitArea: {
          show: true,
          areaStyle: { color: ['rgba(248, 250, 252, 0.95)', 'rgba(241, 245, 249, 0.9)'] },
        },
        axisLine: { lineStyle: { color: 'rgba(15, 23, 42, 0.12)' } },
        axisTick: { lineStyle: { color: 'rgba(15, 23, 42, 0.1)' } },
        axisLabel: { color: '#0f172a', fontSize: 12, fontWeight: 500, width: 132, overflow: 'truncate' },
      },
      visualMap: {
        min: 0,
        max: 10,
        calculable: false,
        orient: 'vertical',
        right: 2,
        top: 'middle',
        inRange: { color: ['#e0e7ff', '#a5b4fc', '#6366f1', '#4338ca'] },
        textStyle: { color: '#334155', fontSize: 11, fontWeight: 500 },
      },
      series: [
        {
          name: paperHeatmap ? '真题命中题数' : '命题可能性',
          type: 'heatmap',
          data: dataWithFrame,
          label: { show: false },
          emphasis: {
            itemStyle: { shadowBlur: 12, shadowColor: 'rgba(124,92,255,.45)' },
          },
        },
      ],
    })
  }, [archetypes, chapters, chart, dataWithFrame, index, paperHeatmap])

  return (
    <div className="exam-heatmap-wrap">
      <div className="exam-heatmap-caption">
        章节 × 题型维度：格子颜色表示「该组合在卷面上常见程度」的示意强度；鼠标悬停查看命题要点与关联考点。
      </div>
      <div ref={elRef} className="exam-heatmap-chart" />
    </div>
  )
}
