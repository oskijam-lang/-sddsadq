import type { CatalogFilter, CatalogIndex, ChapterScope, CognitiveLevel, ViewMode } from '../../domain/types'
import type { DivergentSearchInsight } from '../../domain/divergentSearch'
import type { PaperListItem } from '../state/paperLibrary'

type Props = {
  mode: ViewMode
  setMode: (m: ViewMode) => void
  filter: CatalogFilter
  setFilter: (f: CatalogFilter) => void
  stats: { nodes: number; edges: number; chapters: number }
  index: CatalogIndex
  onOpenCreateNode: () => void
  /** 有搜索词时展示匹配策略与扩散步数效果 */
  searchAssist?: { label: string; matched: number; visible: number; expandHops?: number }
  /** 多概念联合检索时的关联解读 */
  divergentInsight?: DivergentSearchInsight
  /** 真题文件夹维度（与章节区分） */
  paperItems?: PaperListItem[]
  paperSelected?: Set<string>
  onTogglePaper?: (paperId: string) => void
  onSelectAllPapers?: () => void
  onClearPapers?: () => void
}

const modeLabel: Record<ViewMode, string> = {
  RADIAL_LINKS: '径向+连线',
  CHORD: '弦图',
  FORCE: '力导向',
  SANKEY: '桑基',
  EXAM_HEATMAP: '出题热力',
}

const cognitiveLevels: Exclude<CognitiveLevel, never>[] = [
  'ALL',
  '记忆',
  '理解',
  '应用',
  '分析',
  '综合',
  '评价',
]

function toggleChapter(scope: ChapterScope, ch: string): ChapterScope {
  const i = scope.indexOf(ch as any)
  if (i >= 0) return scope.filter((c) => c !== ch)
  return [...scope, ch as any]
}

export function CatalogSidebar({
  mode,
  setMode,
  filter,
  setFilter,
  stats,
  index,
  onOpenCreateNode,
  searchAssist,
  divergentInsight,
  paperItems = [],
  paperSelected = new Set(),
  onTogglePaper,
  onSelectAllPapers,
  onClearPapers,
}: Props) {
  const scope = filter.chapterScope
  const allChapters = index.chapters

  return (
    <>
      <div className="segmented" role="group" aria-label="视图切换">
        {(Object.keys(modeLabel) as ViewMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className="seg-btn"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            title={modeLabel[m]}
          >
            {modeLabel[m]}
          </button>
        ))}
      </div>

      <div className="control">
        <label>内容维度（真题文件夹，可多选叠加）</label>
        <div className="chapter-toolbar">
          <span className="chapter-hint">
            {paperSelected.size === 0 ? '当前：未选择文件夹' : `已选 ${paperSelected.size} 个`}
          </span>
          <div className="chapter-toolbar-btns">
            <button type="button" className="touch-btn touch-btn-tiny" onClick={() => onSelectAllPapers?.()}>
              全选
            </button>
            <button type="button" className="touch-btn touch-btn-tiny" onClick={() => onClearPapers?.()}>
              清空
            </button>
          </div>
        </div>
        <div className="paper-grid" role="group" aria-label="真题文件夹多选">
          {paperItems.length === 0 ? (
            <div className="subtitle">尚未导入真题文件夹。</div>
          ) : (
            paperItems.map((p) => {
              const name = p.meta?.displayName ?? p.id
              const active = paperSelected.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`paper-chip ${active ? 'paper-chip-on' : 'paper-chip-off'}`}
                  aria-pressed={active}
                  title={p.meta?.originalName}
                  onClick={() => onTogglePaper?.(p.id)}
                >
                  {name}
                </button>
              )
            })
          )}
        </div>
        <div className="subtitle" style={{ marginTop: 8 }}>
          输入文件夹名到搜索框，会自动选中对应文件夹并展示其题目覆盖的考点与关联。
        </div>
      </div>

      <div className="kpi">
        <div className="card">
          <div className="val">{stats.nodes}</div>
          <div className="lbl">当前节点</div>
        </div>
        <div className="card">
          <div className="val">{stats.edges}</div>
          <div className="lbl">当前关系</div>
        </div>
        <div className="card">
          <div className="val">{stats.chapters}</div>
          <div className="lbl">覆盖章节</div>
        </div>
        <div className="card">
          <div className="val">{index.nodes.length}</div>
          <div className="lbl">总节点</div>
        </div>
      </div>

      <div className="hr" />

      <div className="control">
        <label htmlFor="q">搜索（支持中文/标签）</label>
        <input
          id="q"
          value={filter.query}
          placeholder="例如：极限与变上限的深度耦合 / 定积分的应用 / 格林公式"
          onChange={(ev) => setFilter({ ...filter, query: ev.target.value })}
        />
        {searchAssist && filter.query.trim() && (
          <div className="search-assist" role="status">
            {searchAssist.label}：匹配种子 {searchAssist.matched} 个，子图内共 {searchAssist.visible} 个考点（
            {searchAssist.expandHops ?? 2} 跳关系展开）。
            {divergentInsight
              ? ' 可切换力导向/径向+连线看跨章关联；点节点读笔记与边类型。'
              : ' 可点击图中节点与边展开详情。'}
          </div>
        )}
        {divergentInsight && divergentInsight.conceptPicks.length > 0 && (
          <div className="divergent-panel" role="region" aria-label="多概念关联解读">
            <div className="divergent-panel-title">多概念联合 · 关联涌现</div>
            {divergentInsight.conceptPicks.map((p) => (
              <div key={p.phrase} className="divergent-concept">
                <div className="divergent-concept-phrase">「{p.phrase}」</div>
                <ul className="divergent-concept-hits">
                  {p.topLabels.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
            {divergentInsight.bridgeIds.length > 0 && (
              <div className="divergent-bridges">
                <div className="divergent-bridges-lbl">桥接/枢纽（两概念 2 跳前缘的交）</div>
                <ul>
                  {divergentInsight.bridgeIds.map((id) => (
                    <li key={id}>
                      {index.byId.get(id)?.label ?? id}
                      <span className="divergent-id">{id}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {divergentInsight.pathSummaries[0] && (
              <div className="divergent-path">
                <div className="divergent-bridges-lbl">代表路径（可举一反三对读）</div>
                <div className="divergent-path-line">{divergentInsight.pathSummaries[0].labelPath}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="control">
        <label>内容维度（章节，可多选叠加）</label>
        <div className="chapter-toolbar">
          <span className="chapter-hint">
            {scope.length === 0 ? '当前：全部章节' : `已选 ${scope.length} 章`}
          </span>
          <div className="chapter-toolbar-btns">
            <button
              type="button"
              className="touch-btn touch-btn-tiny"
              onClick={() => setFilter({ ...filter, chapterScope: [...allChapters] as ChapterScope })}
            >
              全选
            </button>
            <button type="button" className="touch-btn touch-btn-tiny" onClick={() => setFilter({ ...filter, chapterScope: [] })}>
              清空
            </button>
          </div>
        </div>
        <div className="chapter-grid" role="group" aria-label="章节多选">
          {allChapters.map((c) => {
            const active = scope.length > 0 && scope.includes(c)
            return (
              <button
                key={c}
                type="button"
                className={`chapter-chip ${scope.length === 0 ? 'chapter-chip-all' : active ? 'chapter-chip-on' : 'chapter-chip-off'}`}
                aria-pressed={active}
                title={scope.length === 0 ? '未限定章节；点选开始多章叠加' : undefined}
                onClick={() => {
                  if (scope.length === 0) {
                    setFilter({ ...filter, chapterScope: [c] })
                    return
                  }
                  const next = toggleChapter(scope, c)
                  setFilter({ ...filter, chapterScope: next })
                }}
              >
                {c}
              </button>
            )
          })}
        </div>
        <div className="subtitle" style={{ marginTop: 8 }}>
          未点任何章时视为<strong>全部</strong>；点选后仅显示所选章的并集，可叠加多章对比。
        </div>
      </div>

      <div className="control">
        <label htmlFor="cog">认知过程（Bloom 风格）</label>
        <select
          id="cog"
          value={filter.cognitive}
          onChange={(ev) => setFilter({ ...filter, cognitive: ev.target.value as any })}
        >
          {cognitiveLevels.map((c) => (
            <option key={c} value={c}>
              {c === 'ALL' ? '全部层级' : c}
            </option>
          ))}
        </select>
      </div>

      <div className="control">
        <label>难度范围（1-5）</label>
        <div className="row">
          <div className="pill" style={{ flex: 1 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>min</span>
            <select
              value={filter.minDifficulty}
              onChange={(ev) =>
                setFilter({
                  ...filter,
                  minDifficulty: Math.min(Number(ev.target.value), filter.maxDifficulty),
                })
              }
            >
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="pill" style={{ flex: 1 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>max</span>
            <select
              value={filter.maxDifficulty}
              onChange={(ev) =>
                setFilter({
                  ...filter,
                  maxDifficulty: Math.max(Number(ev.target.value), filter.minDifficulty),
                })
              }
            >
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="hr" />

      <div className="control">
        <label>图谱管理</label>
        <button type="button" className="touch-btn touch-btn-primary touch-btn-block" onClick={onOpenCreateNode}>
          新建考点
        </button>
        <div className="subtitle" style={{ marginTop: 8 }}>
          在画布上点击节点或连线后，表单会出现在下方「编辑区」，避免遮挡图形。
        </div>
      </div>

      <div className="hr" />

      <div className="subtitle">提示：右侧画布可缩放拖拽；搜索命中会高亮并展开一跳邻居。</div>
    </>
  )
}
