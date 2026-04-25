import type { CatalogIndex, TopicEdge } from '../../domain/types'
import type { TopicQuestionIndex } from '../../domain/paperAnalysis'

type Hover =
  | { type: 'node'; id: string }
  | { type: 'edge'; edge: TopicEdge }
  | null

type Props = {
  hover: Hover
  pos: { x: number; y: number } | null
  index: CatalogIndex
  paperCounts?: Record<string, number>
  topicQuestions?: TopicQuestionIndex
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export function GraphHoverTooltip({
  hover,
  pos,
  index,
  paperCounts = {},
  topicQuestions = {},
  onMouseEnter,
  onMouseLeave,
}: Props) {
  if (!hover || !pos) return null

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(window.innerWidth - 420, Math.max(12, pos.x + 14)),
    top: Math.min(window.innerHeight - 320, Math.max(12, pos.y + 14)),
    zIndex: 50,
    width: 380,
    maxWidth: 'min(380px, calc(100vw - 24px))',
    pointerEvents: 'auto',
  }

  if (hover.type === 'edge') {
    const ed = hover.edge
    const s = index.byId.get(ed.source)?.label ?? ed.source
    const t = index.byId.get(ed.target)?.label ?? ed.target
    return (
      <div className="hover-panel" style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <div className="hover-title">关系边</div>
        <div className="hover-sub">
          {s} → {t}
        </div>
        <div className="hover-meta">
          {ed.type} · 权重 {ed.weight}
        </div>
      </div>
    )
  }

  const node = index.byId.get(hover.id)
  if (!node) return null
  const hit = paperCounts[node.id] ?? 0
  const refs = topicQuestions[node.id] ?? []

  return (
    <div className="hover-panel" style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="hover-title">{node.label}</div>
      <div className="hover-sub">{node.id}</div>
      <div className="hover-meta">
        章节 {node.chapter} · 难度 {node.difficulty} · 重要性 {node.importance}
      </div>
      {hit > 0 && (
        <div className="hover-kpi">
          真题命中 <strong>{hit}</strong> 次 {refs.length ? <span className="hover-kpi-sub">· 题号 {refs.length} 个</span> : null}
        </div>
      )}
      {refs.length > 0 && (
        <div className="hover-refs" role="region" aria-label="题目片段">
          {refs.slice(0, 6).map((r, i) => (
            <div key={`${r.paper}-${r.qid}-${i}`} className="hover-ref">
              <div className="hover-ref-head">
                <span className="hover-ref-paper">{r.paper}</span>
                <span className="hover-ref-qid">{r.qid}</span>
              </div>
              <div className="hover-ref-snippet">{r.snippet}</div>
            </div>
          ))}
          {refs.length > 6 && <div className="hover-more">仅展示前 6 题（共 {refs.length}）。</div>}
        </div>
      )}
      {Object.keys(paperCounts).length > 0 && hit === 0 && (
        <div className="hover-empty">当前所选真题卷中未匹配到该考点。</div>
      )}
    </div>
  )
}

