import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { TopicEdge, TopicNode } from '../../domain/types'
import { emptyGraphFocus, isGraphFocusActive, topicTier, type GraphFocusTiers } from '../../domain/graphFocus'
import { PRIMITIVE_AXES, primaryAxis } from '../../domain/firstPrinciples'
import { usePanZoomRotate } from '../../viz/usePanZoomRotate'

type Props = {
  /** primitive：按第一性原理元轴聚类；chapter：按教材章节 */
  layoutMode?: 'chapter' | 'primitive'
  chapters: string[]
  nodes: TopicNode[]
  edges: TopicEdge[]
  rotDeg?: number
  graphFocus?: GraphFocusTiers
  /** 真题覆盖：topicId -> count（用于小点标记） */
  paperCounts?: Record<string, number>
  onSelectEdge?: (edge: TopicEdge) => void
  onSelectNode?: (id: string) => void
}

function buildHierarchy(chapters: string[], nodes: TopicNode[]) {
  const root = {
    id: 'ROOT',
    name: '高等数学',
    kind: 'ROOT' as const,
    children: chapters.map((c) => ({
      id: `CH_${c}`,
      name: c,
      kind: 'CH' as const,
      children: [] as any[],
    })),
  }
  const byChapter = new Map<string, any>()
  for (const ch of root.children) byChapter.set(ch.name, ch)

  // Build parent-child within selected nodes (fallback to chapter)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const treeById = new Map<string, any>()
  for (const n of nodes) {
    treeById.set(n.id, { id: n.id, name: n.label, kind: 'TOPIC' as const, topic: n, children: [] })
  }
  for (const n of nodes) {
    const me = treeById.get(n.id)
    const pid = n.parentId
    if (pid && byId.has(pid) && treeById.has(pid)) treeById.get(pid).children.push(me)
    else byChapter.get(n.chapter)?.children.push(me)
  }
  return d3.hierarchy(root as any)
}

function buildHierarchyPrimitive(nodes: TopicNode[]) {
  const root = {
    id: 'ROOT',
    name: '元轴 → 底层考点',
    kind: 'ROOT' as const,
    children: PRIMITIVE_AXES.map((a) => ({
      id: `AX_${a}`,
      name: a,
      kind: 'CH' as const,
      children: [] as any[],
    })),
  }
  const byAx = new Map(root.children.map((ch) => [ch.name, ch]))
  for (const n of nodes) {
    if (n.tags.includes('章根')) continue
    if (n.id.endsWith('_ROOT')) continue
    const ax = primaryAxis(n)
    const me = { id: n.id, name: n.label, kind: 'TOPIC' as const, topic: n, children: [] }
    byAx.get(ax)?.children.push(me)
  }
  for (const ch of root.children) {
    ch.children.sort((a: any, b: any) => a.name.localeCompare(b.name, 'zh-CN'))
  }
  return d3.hierarchy(root as any)
}

export function RadialLinksView({
  layoutMode = 'primitive',
  chapters,
  nodes,
  edges,
  rotDeg = 0,
  graphFocus = emptyGraphFocus(),
  paperCounts = {},
  onSelectEdge,
  onSelectNode,
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

  /** 几何与 d3 cluster 与 pzr 解耦：平移缩放只更新外层 transform，避免每帧全量重算 */
  const graphBody = useMemo(() => {
    const w = size.w
    const h = size.h
    if (w < 10 || h < 10) return null

    const pad = 56
    const radius = Math.min(w, h) / 2 - pad

    const root = layoutMode === 'primitive' ? buildHierarchyPrimitive(nodes) : buildHierarchy(chapters, nodes)
    const cluster = d3.cluster<any>().size([2 * Math.PI, radius])
    cluster(root)

    // Map id -> polar position
    const pos = new Map<string, { a: number; r: number; x: number; y: number }>()
    const descById = new Map<string, any>()
    root.each((d: any) => {
      const a = d.x
      const r = d.y
      const x = Math.cos(a - Math.PI / 2) * r
      const y = Math.sin(a - Math.PI / 2) * r
      pos.set(d.data.id, { a, r, x, y })
      descById.set(d.data.id, d)
    })

    const links = root.links()

    // Build connection curves between topics (only if both endpoints exist in layout)
    const gActive = isGraphFocusActive(graphFocus)
    const examCov = Object.keys(paperCounts).length > 0
    const conn = edges
      .map((ed) => {
        const s = pos.get(ed.source)
        const t = pos.get(ed.target)
        if (!s || !t) return null
        const w2 = ed.type === 'PREREQ' ? 1.0 : ed.type === 'CO_OCCUR' ? 0.75 : 0.55
        const ta = gActive ? topicTier(ed.source, graphFocus) : 1
        const tb = gActive ? topicTier(ed.target, graphFocus) : 1
        return { s, t, ed, w: w2, ta, tb }
      })
      .filter(Boolean) as Array<any>

    const cx = w / 2
    const cy = h / 2

    return {
      w,
      h,
      cx,
      cy,
      body: (
        <>
          {/* hierarchy edges */}
          <g>
            {links.map((l, i) => {
              const s = l.source as any
              const t = l.target as any
              const sp = pos.get(s.data.id)!
              const tp = pos.get(t.data.id)!
              const path = d3.path()
              path.moveTo(sp.x, sp.y)
              path.quadraticCurveTo(0, 0, tp.x, tp.y)
              return (
                <path
                  key={i}
                  d={path.toString()}
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.14)"
                  strokeWidth={1}
                  opacity={gActive ? 0.45 : 0.88}
                />
              )
            })}
          </g>

          {/* relation edges (multi-links) */}
          <g>
            {conn.map((c, i) => {
              const path = d3.path()
              const mid = { x: 0, y: 0 }
              path.moveTo(c.s.x, c.s.y)
              path.bezierCurveTo(
                (c.s.x + mid.x) / 2,
                (c.s.y + mid.y) / 2,
                (c.t.x + mid.x) / 2,
                (c.t.y + mid.y) / 2,
                c.t.x,
                c.t.y,
              )
              const stroke =
                c.ed.type === 'PREREQ'
                  ? 'rgba(124,92,255,0.55)'
                  : c.ed.type === 'CO_OCCUR'
                    ? 'rgba(34,211,238,0.45)'
                    : c.ed.type === 'DERIVES'
                      ? 'rgba(52,211,153,0.42)'
                      : 'rgba(251,113,133,0.38)'
              const o = !gActive
                ? 0.85
                : c.ta > 0 && c.tb > 0
                  ? 0.92
                  : c.ta > 0 || c.tb > 0
                    ? 0.58
                    : 0.1
              return (
                <path
                  key={i}
                  d={path.toString()}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={Math.max(0.8, Math.min(2.4, c.ed.weight * 2)) * c.w}
                  opacity={o}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectEdge?.(c.ed)}
                />
              )
            })}
          </g>

          {/* nodes */}
          <g>
            {Array.from(pos.entries()).map(([id, p]) => {
              const node = descById.get(id) as any
              if (!node) return null
              const kind = node.data.kind
              const isTopic = kind === 'TOPIC'
              const r = isTopic ? 3.2 : kind === 'CH' ? 4.2 : 5.2
              const ti = isTopic ? topicTier(id, graphFocus) : 0
              const gAct = gActive
              const exam = isTopic ? (paperCounts[id] ?? 0) : 0
              const fill = (() => {
                if (kind === 'ROOT') return '#cbd5e1'
                if (kind === 'CH') return gAct ? '#e2e8f0' : '#f1f5f9'
                if (gAct) {
                  if (ti === 2) return '#d4a556'
                  if (ti === 1) return 'rgba(45, 212, 191, 0.85)'
                  return '#e2e8f0'
                }
                return '#ffffff'
              })()
              const hit = isTopic ? (paperCounts[id] ?? 0) : 0
              const label = hit > 0 ? `${node.data.name} ×${hit}` : node.data.name
              const a = p.a
              const flip = a > Math.PI ? 180 : 0
              const textAnchor = a > Math.PI ? 'end' : 'start'
              const tx = Math.cos(a - Math.PI / 2) * (p.r + 10)
              const ty = Math.sin(a - Math.PI / 2) * (p.r + 10)
              const rot = (a * 180) / Math.PI - 90 + flip
              const baseOp = gAct && isTopic && ti === 0 ? 0.4 : 0.92
              const tOp =
                baseOp * (examCov && isTopic && (paperCounts[id] ?? 0) === 0 ? 0.48 : 1)
              return (
                <g key={id}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + (isTopic ? 1 : 0) + (gAct && isTopic && ti > 0 ? 1.2 : 0)}
                    fill={fill}
                    stroke="rgba(15, 23, 42, 0.12)"
                    strokeWidth={kind === 'TOPIC' ? 0.9 : 1.1}
                    opacity={tOp}
                    style={{ cursor: isTopic ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (isTopic) onSelectNode?.(id)
                    }}
                  />
                  {exam > 0 && (
                    <circle
                      cx={p.x + 6}
                      cy={p.y - 6}
                      r={2.4}
                      fill="rgba(34,211,238,0.95)"
                      stroke="rgba(0,0,0,0.25)"
                      strokeWidth={1}
                      style={{ cursor: 'pointer' }}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onSelectNode?.(id)
                      }}
                    >
                      <title>{`真题命中 ×${exam}（点击查看题目）`}</title>
                    </circle>
                  )}
                  <text
                    x={tx}
                    y={ty}
                    textAnchor={textAnchor}
                    transform={`rotate(${rot},${tx},${ty})`}
                    style={{
                      fill:
                        examCov && isTopic && (paperCounts[id] ?? 0) === 0
                          ? 'rgba(15, 23, 42, 0.4)'
                          : isTopic
                            ? '#0f172a'
                            : '#1e293b',
                      fontSize: isTopic ? 12 : 13,
                      fontWeight: isTopic ? 500 : 600,
                    }}
                  >
                    {label}
                  </text>
                </g>
              )
            })}
          </g>
        </>
      ),
    }
  }, [chapters, edges, graphFocus, layoutMode, nodes, onSelectEdge, onSelectNode, paperCounts, size.h, size.w])

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          color: 'var(--text)',
          fontSize: 13,
          lineHeight: 1.45,
          maxWidth: 'min(520px, 94%)',
          textShadow: '0 0 12px rgba(255,255,255,0.85)',
        }}
      >
        {layoutMode === 'primitive'
          ? '融合视图：按第一性原理元轴分簇 + 底层考点之间的语义连线。'
          : '融合视图：按章节分簇 + 底层考点之间的语义连线。'}
      </div>
      {graphBody && (
        <svg
          width={graphBody.w}
          height={graphBody.h}
          style={{ display: 'block', touchAction: 'none', cursor: 'grab' }}
          onWheel={pzr.onWheel}
          onPointerDown={pzr.onPointerDown}
          onPointerMove={pzr.onPointerMove}
          onPointerUp={pzr.onPointerUp}
        >
          <g
            transform={`translate(${graphBody.cx + pzr.t.x},${graphBody.cy + pzr.t.y}) scale(${pzr.t.k}) rotate(${pzr.t.rotDeg})`}
          >
            {graphBody.body}
          </g>
        </svg>
      )}
    </div>
  )
}

