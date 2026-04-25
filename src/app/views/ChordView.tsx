import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { usePanZoomRotate } from '../../viz/usePanZoomRotate'

type Props = {
  /** 弦图每一段标签（第一性原理元轴，不是章节） */
  segmentLabels: string[]
  /** segmentLabels.length 阶方阵 */
  matrix: number[][]
  rotDeg?: number
  /** 有搜索/多概念时弱化非关联网轴 */
  graphFocusActive?: boolean
  /** 当前种子/桥所属元轴，用于高亮整段与弦 */
  highlightAxes?: Set<string>
  /** 真题覆盖涉及的元轴（与搜索金色分开：使用青色描边） */
  examAxes?: Set<string>
  /** 已选真题且存在命中时：弱化未出现在真题中的元轴段 */
  paperCoverageActive?: boolean
}

export function ChordView({
  segmentLabels,
  matrix,
  rotDeg = 0,
  graphFocusActive = false,
  highlightAxes,
  examAxes,
  paperCoverageActive = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const pzr = usePanZoomRotate()

  useEffect(() => {
    if (!hostRef.current) return
    const ro = new ResizeObserver(() => {
      const r = hostRef.current!.getBoundingClientRect()
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) })
    })
    ro.observe(hostRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    pzr.setRot(rotDeg)
  }, [pzr, rotDeg])

  /** 弦几何与 pzr 解耦，避免拖拽/缩放时重复 d3.chord 与全路径重算 */
  const chordPack = useMemo(() => {
    const ha = highlightAxes ?? new Set<string>()
    const ea = examAxes ?? new Set<string>()
    const paperDim = paperCoverageActive && ea.size > 0
    const w = size.w
    const h = size.h
    if (w < 10 || h < 10) return null
    if (!matrix.length || matrix.length !== segmentLabels.length) return null

    const pad = 92
    const outer = Math.min(w, h) * 0.42
    const inner = outer - 18
    const color = d3
      .scaleOrdinal<string, string>()
      .domain(segmentLabels)
      .range([
        '#7c5cff',
        '#22d3ee',
        '#34d399',
        '#fbbf24',
        '#fb7185',
        '#60a5fa',
        '#a78bfa',
        '#f472b6',
        '#f97316',
        '#4ade80',
        '#38bdf8',
        '#c4b5fd',
        '#fcd34d',
      ])

    const chord = d3
      .chord()
      .padAngle(0.028)
      .sortSubgroups(d3.descending)(matrix as any)

    const arc = d3.arc<any>().innerRadius(inner).outerRadius(outer)
    const ribbon = d3.ribbon<any>().radius(inner)

    const cx = w / 2
    const cy = h / 2

    const body = (
      <>
        <g>
          {chord.groups.map((gr, i) => {
            const seg = segmentLabels[gr.index] ?? ''
            const searchOk = !graphFocusActive || ha.size === 0 || ha.has(seg)
            const paperOk = !paperDim || ea.has(seg)
            const h = searchOk && paperOk
            const exam = ea.has(seg)
            return (
            <g key={i}>
              <path
                d={arc(gr) ?? undefined}
                fill={color(segmentLabels[gr.index])}
                fillOpacity={h ? 0.88 : paperDim ? 0.14 : 0.2}
                stroke={exam ? 'rgba(13, 148, 136, 0.95)' : 'rgba(15, 23, 42, 0.18)'}
                strokeWidth={exam ? 2 : 1}
              />
              <text
                dy=".35em"
                transform={(() => {
                  const a = (gr.startAngle + gr.endAngle) / 2
                  const r = outer + 20
                  const x = Math.cos(a - Math.PI / 2) * r
                  const y = Math.sin(a - Math.PI / 2) * r
                  const rotate = (a * 180) / Math.PI - 90
                  const flip = a > Math.PI ? 180 : 0
                  return `translate(${x},${y}) rotate(${rotate + flip})`
                })()}
                textAnchor={(gr.startAngle + gr.endAngle) / 2 > Math.PI ? 'end' : 'start'}
                style={{
                  fill: '#0f172a',
                  fontSize: 12,
                  fontWeight: 500,
                  paintOrder: 'stroke fill',
                  stroke: 'rgba(248, 250, 252, 0.92)',
                  strokeWidth: 3.2,
                  strokeLinejoin: 'round',
                }}
              >
                {segmentLabels[gr.index]}
              </text>
            </g>
            )
          })}
        </g>
        <g>
          {chord.map((c, i) => {
            const a = segmentLabels[c.source.index] ?? ''
            const b = segmentLabels[c.target.index] ?? ''
            const ah = ha.has(a)
            const bh = ha.has(b)
            const baseOp = !graphFocusActive || ha.size === 0
              ? 0.55
              : ah && bh
                ? 0.7
                : ah || bh
                  ? 0.38
                  : 0.05
            const paperRibbon =
              paperDim && !ea.has(a) && !ea.has(b) ? 0.12 : 1
            const op = baseOp * paperRibbon
            return (
            <path
              key={i}
              d={ribbon(c) ?? undefined}
              fill={color(segmentLabels[c.source.index])}
              stroke="rgba(15, 23, 42, 0.08)"
              strokeWidth={0.8}
              fillOpacity={op}
            />
            )
          })}
        </g>
      </>
    )

    return { w, h, pad, cx, cy, body }
  }, [examAxes, graphFocusActive, highlightAxes, matrix, paperCoverageActive, segmentLabels, size.h, size.w])

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 12, bottom: 12, color: 'var(--muted)', fontSize: 12, maxWidth: 'min(520px, 92%)' }}>
        弦图按「第一性原理元轴」聚合：底层考点之间的边在元轴张量上累加，不是章节关系。
        {paperCoverageActive && (examAxes ?? new Set()).size > 0
          ? ' 已选真题：青色描边元轴为卷面命中过的思想轴，其余段已弱化。'
          : ''}
      </div>
      {chordPack && (
        <svg
          width={chordPack.w}
          height={chordPack.h}
          viewBox={`${-chordPack.pad} ${-chordPack.pad} ${chordPack.w + chordPack.pad * 2} ${chordPack.h + chordPack.pad * 2}`}
          style={{ display: 'block', touchAction: 'none', cursor: 'grab' }}
          onWheel={pzr.onWheel}
          onPointerDown={pzr.onPointerDown}
          onPointerMove={pzr.onPointerMove}
          onPointerUp={pzr.onPointerUp}
        >
          <rect
            x={-chordPack.pad}
            y={-chordPack.pad}
            width={chordPack.w + chordPack.pad * 2}
            height={chordPack.h + chordPack.pad * 2}
            fill="transparent"
            stroke="transparent"
          />
          <g
            transform={`translate(${chordPack.cx + pzr.t.x},${chordPack.cy + pzr.t.y}) scale(${pzr.t.k}) rotate(${pzr.t.rotDeg})`}
          >
            {chordPack.body}
          </g>
        </svg>
      )}
    </div>
  )
}
