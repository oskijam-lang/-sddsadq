import { useEffect, useState } from 'react'
import type { CatalogIndex, EdgeType, TopicEdge, TopicNode } from '../../domain/types'
import type { TopicQuestionIndex } from '../../domain/paperAnalysis'
import type { CatalogMutations } from '../state/catalogStore'

export type InspectorState =
  | { type: 'node'; id: string }
  | { type: 'edge'; edge: TopicEdge }
  | { type: 'create' }

type Props = {
  state: InspectorState | null
  setInspector: (s: InspectorState | null) => void
  onClose: () => void
  index: CatalogIndex
  store: CatalogMutations
  /** 左侧所选真题叠加后的考点命中次数 */
  paperCounts?: Record<string, number>
  /** 考点 → 真题题干片段 */
  topicQuestions?: TopicQuestionIndex
}

export function GraphInspector({
  state,
  setInspector,
  onClose,
  index,
  store,
  paperCounts = {},
  topicQuestions = {},
}: Props) {
  if (!state) return null

  if (state.type === 'create') {
    return (
      <div className="inspector-sheet">
        <div className="inspector-head">
          <div className="inspector-title">新建考点</div>
          <button type="button" className="touch-btn touch-btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <CreateNodeForm
          chapters={index.chapters}
          onCreate={(node) => {
            const id = store.addNode(node as any)
            setInspector({ type: 'node', id })
          }}
        />
      </div>
    )
  }

  if (state.type === 'edge') {
    const selectedEdge = state.edge
    const src = index.byId.get(selectedEdge.source)
    const tgt = index.byId.get(selectedEdge.target)
    const title = `${src?.label ?? selectedEdge.source} → ${tgt?.label ?? selectedEdge.target}`
    return (
      <div className="inspector-sheet">
        <div className="inspector-head">
          <div>
            <div className="inspector-title">关系边</div>
            <div className="inspector-meta">{title}</div>
            <div className="inspector-meta subtle">
              {selectedEdge.type} · 权重 {selectedEdge.weight}
            </div>
          </div>
          <button type="button" className="touch-btn touch-btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="control">
          <label>由此联系生成的新考点</label>
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
              setInspector({ type: 'node', id: newId })
            }}
          />
        </div>

        <div className="inspector-actions">
          <button
            type="button"
            className="touch-btn touch-btn-danger"
            onClick={() => {
              store.deleteEdge(selectedEdge)
              onClose()
            }}
          >
            删除这条边
          </button>
        </div>
      </div>
    )
  }

  const node = index.byId.get(state.id)
  if (!node) {
    return (
      <div className="inspector-sheet">
        <div className="inspector-meta">节点不存在或已删除</div>
        <button type="button" className="touch-btn" onClick={onClose}>
          关闭
        </button>
      </div>
    )
  }

  const incident = index.edges.filter((e) => e.source === node.id || e.target === node.id)
  const edgeTypes: EdgeType[] = ['PREREQ', 'CO_OCCUR', 'DERIVES', 'SIMILAR']
  const pHit = paperCounts[node.id] ?? 0
  const pRefs = topicQuestions[node.id] ?? []

  return (
    <div className="inspector-sheet">
      <div className="inspector-head">
        <div>
          <div className="inspector-title">编辑考点</div>
          <div className="inspector-meta">{node.label}</div>
          <div className="inspector-id subtle">{node.id}</div>
        </div>
        <button type="button" className="touch-btn touch-btn-ghost" onClick={onClose}>
          关闭
        </button>
      </div>

      <div className="control">
        <label>标题</label>
        <input value={node.label} onChange={(e) => store.updateNode(node.id, { label: e.target.value })} />
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
        <label>标签（空格分隔）</label>
        <input
          value={node.tags.join(' ')}
          onChange={(e) =>
            store.updateNode(node.id, { tags: e.target.value.trim().split(/\s+/).filter(Boolean) })
          }
        />
      </div>

      <div className="hr" />

      <div className="inspector-subtitle">真题覆盖（已选试卷叠加）</div>
      {pHit > 0 ? (
        <div className="inspector-paper-block">
          <div className="inspector-meta">
            本题在已选真题文本中累计命中 <strong>{pHit}</strong> 次（由题干分词与考点标签粗匹配，可对照 PDF 人工复核）。
          </div>
          {pRefs.length > 0 ? (
            <ul className="inspector-paper-refs">
              {pRefs.slice(0, 8).map((r, i) => (
                <li key={`${r.paper}-${r.qid}-${i}`}>
                  <span className="inspector-paper-qid">
                    {r.paper} · {r.qid}
                  </span>
                  <div className="inspector-paper-snippet">{r.snippet}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : Object.keys(paperCounts).length > 0 ? (
        <div className="inspector-meta subtle">当前所选真题未匹配到该考点（可换卷或加强题干关键词）。</div>
      ) : (
        <div className="inspector-meta subtle">尚未在左侧选择真题文件夹，或尚未上传/解析 PDF。</div>
      )}

      <div className="hr" />

      <div className="inspector-subtitle">关联边（{incident.length}）</div>
      <div className="edge-list">
        {incident.map((e, i) => {
          const s = index.byId.get(e.source)?.label ?? e.source
          const t = index.byId.get(e.target)?.label ?? e.target
          return (
            <button
              key={`${e.source}-${e.target}-${e.type}-${i}`}
              type="button"
              className="edge-list-item"
              onClick={() => setInspector({ type: 'edge', edge: e })}
            >
              <span className="edge-type">{e.type}</span>
              <span className="edge-line">
                {s} → {t}
              </span>
              <span className="edge-w">w={e.weight}</span>
            </button>
          )
        })}
      </div>

      <div className="hr" />

      <div className="inspector-subtitle">新增一条边</div>
      <AddEdgeForm node={node} nodes={index.nodes} edgeTypes={edgeTypes} onAdd={(edge) => store.addEdge(edge)} />

      <div className="hr" />

      <button
        type="button"
        className="touch-btn touch-btn-danger touch-btn-block"
        onClick={() => {
          store.deleteNode(node.id)
          onClose()
        }}
      >
        删除该节点（含相关边）
      </button>
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
    <div className="inspector-row">
      <input className="input-grow" value={label} onChange={(e) => setLabel(e.target.value)} />
      <button type="button" className="touch-btn touch-btn-primary" onClick={() => onCreate(label.trim() || defaultLabel)}>
        生成
      </button>
    </div>
  )
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
        <div className="inspector-row">
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
        </div>
      </div>
      <button
        type="button"
        className="touch-btn touch-btn-primary touch-btn-block"
        style={{ marginTop: 10 }}
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
        创建并打开编辑
      </button>
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
        <div className="inspector-row">
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
        </div>
      </div>
      <button type="button" className="touch-btn touch-btn-block" onClick={() => onAdd({ source: node.id, target, type, weight })}>
        添加边
      </button>
    </>
  )
}
