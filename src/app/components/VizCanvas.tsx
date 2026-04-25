import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CatalogIndex,
  EdgeType,
  TopicEdge,
  TopicNode,
  ViewMode,
} from '../../domain/types'
import {
  buildFocusTopicLabels,
  buildHighlightAxes,
  buildHighlightChapters,
  emptyGraphFocus,
  isGraphFocusActive,
  type GraphFocusTiers,
} from '../../domain/graphFocus'
import { buildExamAxes, buildExamChapters, buildExamTopicLabels } from '../../domain/paperExamMarkers'
import type { TopicQuestionIndex } from '../../domain/paperAnalysis'
import { buildPrimitiveChordMatrix, PRIMITIVE_AXES } from '../../domain/firstPrinciples'
import {
  buildRadialTree,
  subgraph,
  toEChartsGraph,
  toSankeyFirstPrinciples,
} from '../../viz/graphTransforms'
import { decorateTreePaperHits } from '../../viz/decorateTreePaperHits'
import { thinEdges } from '../../viz/thinGraph'
import { ChordView } from '../views/ChordView'
import { ExamHeatmapView } from '../views/ExamHeatmapView'
import { ForceGraphView } from '../views/ForceGraphView'
import { RadialTreeView } from '../views/RadialTreeView'
import { RadialLinksView } from '../views/RadialLinksView'
import { SankeyView } from '../views/SankeyView'
import type { CatalogMutations } from '../state/catalogStore'
import { buildPaperHeatmap } from '../../domain/paperHeatmap'

type Props = {
  mode: ViewMode
  index: CatalogIndex
  filteredNodes: TopicNode[]
  focusIds: string[]
  store: CatalogMutations & { catalog: unknown }
  graphFocus?: GraphFocusTiers
  paperCounts?: Record<string, number>
  topicQuestions?: TopicQuestionIndex
}

function CreateNodeForm({
  chapters,
  onCreate,
}: {
  chapters: string[]
  onCreate: (node: Omit<TopicNode, 'id'>) => void
}) {
  const [label, setLabel] = useState('新考点')
  const [chapter, setChapter] = useState(chapters[0] ?? '函数与极限')
  const [parentId, setParentId] = useState<string>('')
  const [tags, setTags] = useState('自建')
  const [difficulty, setDifficulty] = useState(3)
  const [importance, setImportance] = useState(3)
  return (
    <>
      <div className="control">
        <label>标题</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="control">
        <label>章节</label>
        <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
          {chapters.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="control">
        <label>父节点 id（可空）</label>
        <input value={parentId} onChange={(e) => setParentId(e.target.value)} placeholder="例如：INT1_ROOT" />
      </div>
      <div className="control">
        <label>标签（空格分隔）</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div className="control">
        <label>难度 / 重要性</label>
        <div className="row">
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                难度 {d}
              </option>
            ))}
          </select>
          <select value={importance} onChange={(e) => setImportance(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                重要性 {d}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <button
            className="btn"
            type="button"
            onClick={() =>
              onCreate({
                label,
                chapter: chapter as any,
                parentId: parentId.trim() || undefined,
                difficulty: Math.max(1, Math.min(5, Math.round(difficulty))) as any,
                importance: Math.max(1, Math.min(5, Math.round(importance))) as any,
                cognitive: ['理解', '应用'],
                tags: tags.trim().split(/\s+/).filter(Boolean),
              })
            }
          >
            创建
          </button>
        </div>
      </div>
    </>
  )
}

function AddEdgeForm({
  node,
  nodes,
  edgeTypes,
  onAdd,
}: {
  node: TopicNode
  nodes: TopicNode[]
  edgeTypes: EdgeType[]
  onAdd: (edge: TopicEdge) => void
}) {
  const [target, setTarget] = useState<string>(nodes.find((n) => n.id !== node.id)?.id ?? '')
  const [type, setType] = useState<EdgeType>('CO_OCCUR')
  const [weight, setWeight] = useState<number>(0.6)
  return (
    <>
      <div className="control">
        <label>目标节点</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {nodes
            .filter((n) => n.id !== node.id)
            .slice(0, 800)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}（{n.id}）
              </option>
            ))}
        </select>
      </div>
      <div className="control">
        <label>类型 / 权重</label>
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value as EdgeType)}>
            {edgeTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={String(weight)} onChange={(e) => setWeight(Number(e.target.value))}>
            {[0.2, 0.4, 0.6, 0.8, 1].map((w) => (
              <option key={w} value={w}>
                w={w}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <button
            className="btn"
            type="button"
            onClick={() => onAdd({ source: node.id, target, type, weight })}
          >
            添加边
          </button>
        </div>
      </div>
    </>
  )
}

export function VizCanvas({
  mode,
  index,
  filteredNodes,
  focusIds,
  store,
  graphFocus = emptyGraphFocus(),
  paperCounts = {},
  topicQuestions = {},
}: Props) {
  const { nodes, edges } = useMemo(() => subgraph(index, filteredNodes), [index, filteredNodes])
  /** 搜索命中 id 与显式 graphFocus 合并，弦图/热力图与力导向高亮一致 */
  const mergedGraphFocus = useMemo(
    (): GraphFocusTiers => ({
      seedIds: [...new Set([...graphFocus.seedIds, ...focusIds])],
      bridgeIds: graphFocus.bridgeIds,
    }),
    [focusIds, graphFocus.bridgeIds, graphFocus.seedIds],
  )

  const paperHighlightMode = useMemo(() => Object.keys(paperCounts).length > 0, [paperCounts])
  const examAxesSet = useMemo(() => buildExamAxes(index, paperCounts), [index, paperCounts])
  const examTopicLabelsSet = useMemo(() => buildExamTopicLabels(index, paperCounts), [index, paperCounts])
  const examChaptersSet = useMemo(() => buildExamChapters(index, paperCounts), [index, paperCounts])
  const paperHeatmap = useMemo(() => {
    if (!paperHighlightMode) return null
    if (!topicQuestions || Object.keys(topicQuestions).length === 0) return null
    return buildPaperHeatmap(index, topicQuestions)
  }, [index, paperHighlightMode, topicQuestions])

  const radialTreeData = useMemo(() => {
    const t = buildRadialTree(index, nodes)
    return decorateTreePaperHits(t, paperCounts, { dimUnmatched: paperHighlightMode })
  }, [index, nodes, paperCounts, paperHighlightMode])

  const [resetKey, setResetKey] = useState(0)
  const [rotDeg, setRotDeg] = useState(0)
  const [reverse, setReverse] = useState(false)
  const [perfMode, setPerfMode] = useState(true)
  const [selectedEdge, setSelectedEdge] = useState<TopicEdge | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showCreateNode, setShowCreateNode] = useState(false)
  const chartAreaRef = useRef<HTMLDivElement | null>(null)

  /** 仅拦截 Ctrl+滚轮的“网页缩放”，不影响视图缩放/平移 */
  useEffect(() => {
    const el = chartAreaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Chrome/Edge 默认：Ctrl+滚轮会缩放网页；这里只在图表区内禁掉它
      if (e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    // 切换模式时重置交互状态，避免旧高亮残留
    setResetKey((k) => k + 1)
    setRotDeg(0)
    setReverse(false)
    setPerfMode(true)
    setSelectedEdge(null)
    setSelectedNodeId(null)
    setShowCreateNode(false)
  }, [mode])

  const edgesThin = useMemo(() => {
    if (!perfMode) return edges
    // 只有边很多时才抽稀
    if (edges.length < 900) return edges
    return thinEdges(edges, { maxEdgesPerNode: 8, maxTotalEdges: 1400 })
  }, [edges, perfMode])

  const edgeEditor = useMemo(() => {
    if (!selectedEdge) return null
    const src = index.byId.get(selectedEdge.source)
    const tgt = index.byId.get(selectedEdge.target)
    const title = `${src?.label ?? selectedEdge.source} → ${tgt?.label ?? selectedEdge.target}`
    return (
      <div
        style={{
          position: 'absolute',
          right: 12,
          top: 60,
          zIndex: 8,
          width: 380,
          maxWidth: 'calc(100% - 24px)',
        }}
        className="panel"
      >
        <div className="panel-inner">
          <div className="row">
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ fontSize: 14 }}>
                关系边（可增删改查）
              </div>
              <div className="subtitle" style={{ wordBreak: 'break-word' }}>
                {title}（{selectedEdge.type}，权重 {selectedEdge.weight}）
              </div>
            </div>
            <div className="spacer" />
            <button className="btn" type="button" onClick={() => setSelectedEdge(null)}>
              关闭
            </button>
          </div>

          <div className="hr" />

          <div className="control">
            <label>由此“联系”产生的新考点（输入标题后生成）</label>
            <EdgeDerivedCreator
              defaultLabel={`${src?.label ?? 'A'} 与 ${tgt?.label ?? 'B'}：联系衍生考点`}
              onCreate={(label) => {
                const newId = store.addNode({
                  label,
                  chapter: (src?.chapter ?? tgt?.chapter ?? '函数与极限') as any,
                  parentId: tgt?.id ?? src?.id,
                  difficulty: 3,
                  importance: 3,
                  cognitive: ['理解', '应用'],
                  tags: ['关系衍生'],
                } as any)
                store.addEdge({ source: selectedEdge.source, target: newId, type: 'DERIVES', weight: 0.7 })
                store.addEdge({ source: selectedEdge.target, target: newId, type: 'DERIVES', weight: 0.7 })
                setSelectedNodeId(newId)
              }}
            />
          </div>

          <div className="hr" />

          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() => {
                store.deleteEdge(selectedEdge)
                setSelectedEdge(null)
              }}
            >
              删除这条边
            </button>
            <div className="spacer" />
            <span className="hint">提示：点击图中的边即可打开此面板</span>
          </div>
        </div>
      </div>
    )
  }, [index.byId, selectedEdge, store])

  const nodeEditor = useMemo(() => {
    if (!selectedNodeId) return null
    const node = index.byId.get(selectedNodeId)
    if (!node) return null

    const incident = index.edges.filter((e) => e.source === node.id || e.target === node.id)
    const edgeTypes: EdgeType[] = ['PREREQ', 'CO_OCCUR', 'DERIVES', 'SIMILAR']

    return (
      <div
        style={{
          position: 'absolute',
          right: 12,
          top: 60,
          zIndex: 8,
          width: 380,
          maxWidth: 'calc(100% - 24px)',
        }}
        className="panel"
      >
        <div className="panel-inner">
          <div className="row">
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ fontSize: 14 }}>
                节点（考点）
              </div>
              <div className="subtitle" style={{ wordBreak: 'break-word' }}>
                {node.label}（{node.id}）
              </div>
            </div>
            <div className="spacer" />
            <button className="btn" type="button" onClick={() => setSelectedNodeId(null)}>
              关闭
            </button>
          </div>

          <div className="hr" />

          <div className="control">
            <label>标题</label>
            <input
              value={node.label}
              onChange={(e) => store.updateNode(node.id, { label: e.target.value })}
            />
          </div>
          <div className="control">
            <label>章节</label>
            <select
              value={node.chapter}
              onChange={(e) => store.updateNode(node.id, { chapter: e.target.value as any })}
            >
              {index.chapters.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="control">
            <label>父节点 id（可空）</label>
            <input
              value={node.parentId ?? ''}
              placeholder="例如：DIFF1_ROOT"
              onChange={(e) => store.updateNode(node.id, { parentId: e.target.value.trim() || undefined })}
            />
          </div>

          <div className="control">
            <label>标签（用空格分隔）</label>
            <input
              value={node.tags.join(' ')}
              onChange={(e) => store.updateNode(node.id, { tags: e.target.value.trim().split(/\s+/).filter(Boolean) })}
            />
          </div>

          <div className="hr" />

          <div className="title" style={{ fontSize: 13 }}>
            关联边（点击可编辑/删除）
          </div>
          <div className="subtitle" style={{ marginTop: 6 }}>
            {incident.length} 条
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 8, maxHeight: 160, overflow: 'auto' }}>
            {incident.map((e, i) => {
              const s = index.byId.get(e.source)?.label ?? e.source
              const t = index.byId.get(e.target)?.label ?? e.target
              return (
                <button
                  key={`${e.source}-${e.target}-${e.type}-${i}`}
                  className="btn"
                  type="button"
                  style={{ textAlign: 'left' }}
                  onClick={() => setSelectedEdge(e)}
                >
                  <span style={{ opacity: 0.8 }}>{e.type}</span> {s} → {t}{' '}
                  <span style={{ opacity: 0.6 }}>（w={e.weight}）</span>
                </button>
              )
            })}
          </div>

          <div className="hr" />

          <div className="title" style={{ fontSize: 13 }}>
            新增一条边
          </div>
          <AddEdgeForm
            node={node}
            nodes={index.nodes}
            edgeTypes={edgeTypes}
            onAdd={(edge) => store.addEdge(edge)}
          />

          <div className="hr" />

          <button
            className="btn"
            type="button"
            onClick={() => {
              store.deleteNode(node.id)
              setSelectedNodeId(null)
            }}
            style={{ borderColor: 'rgba(251,113,133,0.35)' }}
          >
            删除该节点（同时删除相关边）
          </button>
        </div>
      </div>
    )
  }, [index.byId, index.chapters, index.edges, index.nodes, selectedNodeId, store])

  const createNodePanel = useMemo(() => {
    if (!showCreateNode) return null
    return (
      <div
        style={{
          position: 'absolute',
          right: 12,
          top: 60,
          zIndex: 8,
          width: 380,
          maxWidth: 'calc(100% - 24px)',
        }}
        className="panel"
      >
        <div className="panel-inner">
          <div className="row">
            <div className="title" style={{ fontSize: 14 }}>
              新增节点
            </div>
            <div className="spacer" />
            <button className="btn" type="button" onClick={() => setShowCreateNode(false)}>
              关闭
            </button>
          </div>
          <div className="hr" />
          <CreateNodeForm
            chapters={index.chapters}
            onCreate={(node) => {
              const id = store.addNode(node as any)
              setSelectedNodeId(id)
              setShowCreateNode(false)
            }}
          />
        </div>
      </div>
    )
  }, [index.chapters, showCreateNode, store])

  const content = useMemo(() => {
    if (mode === 'RADIAL_TREE') {
      return (
        <RadialTreeView
          key={resetKey}
          tree={radialTreeData}
          paperCounts={paperCounts}
          topicQuestions={topicQuestions}
        />
      )
    }
    if (mode === 'RADIAL_LINKS') {
      const chapters = index.chapters
      return (
        <RadialLinksView
          key={resetKey}
          layoutMode="primitive"
          chapters={chapters}
          nodes={nodes}
          edges={edgesThin}
          rotDeg={rotDeg}
          graphFocus={mergedGraphFocus}
          paperCounts={paperCounts}
          onSelectEdge={(ed) => setSelectedEdge(ed)}
          onSelectNode={(id) => setSelectedNodeId(id)}
        />
      )
    }
    if (mode === 'FORCE') {
      const g = toEChartsGraph(nodes, edgesThin)
      return (
        <ForceGraphView
          key={resetKey}
          graph={g}
          focusIds={focusIds}
          paperCounts={paperCounts}
          topicQuestions={topicQuestions}
          paperCoverageActive={paperHighlightMode}
          stableMode={perfMode}
          onSelectEdge={(ed) => setSelectedEdge(ed)}
          onSelectNode={(id) => setSelectedNodeId(id)}
        />
      )
    }
    if (mode === 'SANKEY') {
      const s = toSankeyFirstPrinciples(nodes, edges)
      return (
        <SankeyView
          key={resetKey}
          data={s}
          reverse={reverse}
          graphFocusActive={isGraphFocusActive(mergedGraphFocus)}
          highlightAxes={buildHighlightAxes(mergedGraphFocus, index.byId)}
          focusTopicLabels={buildFocusTopicLabels(mergedGraphFocus, index.byId)}
          examAxes={examAxesSet}
          examTopicLabels={examTopicLabelsSet}
          paperHighlightMode={paperHighlightMode}
        />
      )
    }
    if (mode === 'EXAM_HEATMAP') {
      return (
        <ExamHeatmapView
          key={resetKey}
          index={index}
          graphFocusActive={isGraphFocusActive(mergedGraphFocus)}
          highlightChapters={buildHighlightChapters(mergedGraphFocus, index.byId)}
          examChapters={examChaptersSet}
          paperHeatmap={paperHeatmap}
        />
      )
    }
    if (mode === 'CHORD') {
      const matrix = buildPrimitiveChordMatrix(nodes, edges)
      return (
        <ChordView
          key={resetKey}
          segmentLabels={[...PRIMITIVE_AXES]}
          matrix={matrix}
          rotDeg={rotDeg}
          graphFocusActive={isGraphFocusActive(mergedGraphFocus)}
          highlightAxes={buildHighlightAxes(mergedGraphFocus, index.byId)}
          examAxes={examAxesSet}
          paperCoverageActive={paperHighlightMode}
        />
      )
    }
    return null
  }, [
    edges,
    edgesThin,
    examAxesSet,
    examChaptersSet,
    examTopicLabelsSet,
    focusIds,
    graphFocus,
    index,
    mergedGraphFocus,
    mode,
    nodes,
    paperCounts,
    paperHeatmap,
    paperHighlightMode,
    perfMode,
    radialTreeData,
    resetKey,
    reverse,
    rotDeg,
    topicQuestions,
  ])

  return (
    <div className="canvas-inner">
      <div className="canvas-toolbar">
        <button className="btn" type="button" onClick={() => setResetKey((k) => k + 1)}>
          重置视图
        </button>
        <button className="btn" type="button" onClick={() => setShowCreateNode(true)}>
          新增节点
        </button>
        <button className="btn" type="button" onClick={() => setPerfMode((v) => !v)}>
          {perfMode ? '性能模式：开' : '性能模式：关'}
        </button>
        {(mode === 'CHORD' || mode === 'RADIAL_LINKS') && (
          <div className="pill pill--range">
            <span className="pill-label">旋转</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotDeg}
              onChange={(ev) => setRotDeg(Number(ev.target.value))}
              aria-label="旋转画布角度"
            />
            <span className="pill-value">{rotDeg}°</span>
          </div>
        )}
        {mode === 'SANKEY' && (
          <button className="btn" type="button" onClick={() => setReverse((v) => !v)}>
            {reverse ? '正向流' : '反向流'}
          </button>
        )}
        <span className="hint">
          <strong style={{ fontWeight: 650 }}>操作：</strong>
          鼠标在<strong>右侧白底图区</strong>内：滚轮缩放视图、拖拽平移（不滚动整页）；悬浮查看考点。
          {perfMode && edges.length >= 900 ? (
            <span className="hint-muted">{' '}性能模式已启用：为流畅性已自动抽稀关系边。</span>
          ) : null}
          {paperHighlightMode ? (
            <span className="hint-muted">
              {' '}
              已选真题叠加：<span style={{ color: '#0d9488', fontWeight: 600 }}>青描边 / 小徽标</span>
              表示卷面命中；其余考点弱化仅作对比，并非删除数据。
            </span>
          ) : null}
        </span>
      </div>
      {edgeEditor ?? nodeEditor ?? createNodePanel}
      <div ref={chartAreaRef} className="canvas-chart">
        {content}
      </div>
    </div>
  )
}

function EdgeDerivedCreator({
  defaultLabel,
  onCreate,
}: {
  defaultLabel: string
  onCreate: (label: string) => void
}) {
  const [label, setLabel] = useState(defaultLabel)
  useEffect(() => setLabel(defaultLabel), [defaultLabel])
  return (
    <div className="row" style={{ alignItems: 'stretch' }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} />
      <button className="btn" type="button" onClick={() => onCreate(label.trim() || defaultLabel)}>
        生成并加入
      </button>
    </div>
  )
}

