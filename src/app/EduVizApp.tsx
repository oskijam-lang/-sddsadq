import { useMemo, useState } from 'react'
import type { CatalogFilter, ViewMode } from '../domain/types'
import { buildCatalogIndex } from '../domain/hmathCatalog'
import { expandByEdgeHops, searchTopicsInBase, type SearchMatchMode } from '../domain/searchUtils'
import { CatalogSidebar } from './components/CatalogSidebar'
import { GraphInspector, type InspectorState } from './components/GraphInspector'
import { VizCanvas } from './components/VizCanvas'
import { useCatalogStore } from './state/catalogStore'

function describeSearchStrategy(mode: SearchMatchMode): string {
  if (mode === 'AND') return '分词全匹配'
  if (mode === 'OR_SCORE') return '相关度匹配'
  if (mode === 'OR_ANY') return '弱匹配'
  if (mode === 'ALL') return '（未分词）'
  return '无命中'
}

const defaultFilter: CatalogFilter = {
  query: '',
  chapterScope: [],
  cognitive: 'ALL',
  minDifficulty: 1,
  maxDifficulty: 5,
}

export function EduVizApp() {
  const [mode, setMode] = useState<ViewMode>('RADIAL_LINKS')
  const [filter, setFilter] = useState<CatalogFilter>(defaultFilter)
  const [inspector, setInspector] = useState<InspectorState | null>(null)

  const store = useCatalogStore()
  const index = useMemo(() => buildCatalogIndex(store.catalog), [store.catalog])

  const { displayNodes, focusIds, searchAssist } = useMemo(() => {
    const q = filter.query.trim().toLowerCase()

    const base = index.nodes.filter((n) => {
      if (filter.chapterScope.length > 0 && !filter.chapterScope.includes(n.chapter)) return false
      if (filter.cognitive !== 'ALL' && !n.cognitive.includes(filter.cognitive))
        return false
      if (n.difficulty < filter.minDifficulty || n.difficulty > filter.maxDifficulty)
        return false
      return true
    })

    if (!q) return { displayNodes: base, focusIds: [] as string[], searchAssist: undefined }

    const { matched, mode } = searchTopicsInBase(base, filter.query)
    const baseIds = new Set(base.map((n) => n.id))

    if (matched.length === 0) {
      return {
        displayNodes: base,
        focusIds: [] as string[],
        searchAssist: { label: '无命中', matched: 0, visible: base.length },
      }
    }

    const matchedIds = new Set(matched.map((n) => n.id))
    const expanded = expandByEdgeHops(matchedIds, index.edges, baseIds, 2)

    return {
      displayNodes: base.filter((n) => expanded.has(n.id)),
      searchAssist: {
        label: describeSearchStrategy(mode),
        matched: matched.length,
        visible: expanded.size,
      },
    }
  }, [filter, index.edges, index.nodes])

  const stats = useMemo(() => {
    const nodeIds = new Set(displayNodes.map((n) => n.id))
    const edges = index.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    return {
      nodes: displayNodes.length,
      edges: edges.length,
      chapters: new Set(displayNodes.map((n) => n.chapter)).size,
    }
  }, [displayNodes, index.edges])

  return (
    <div className="app-shell">
      <div className="panel sidebar-panel">
        <div className="panel-inner sidebar-inner">
          <div className="accent-rule" aria-hidden />
          <div className="row">
            <div>
              <div className="title">高等数学考点图谱（教育测量学视角）</div>
              <div className="subtitle">
                用全量考点关系做「降维」：先建脑内坐标系，再用专升本/真题数据校准，哪里常考、哪里空白一目了然。
              </div>
            </div>
          </div>

          <div className="hr" />

          <div className="sidebar-scroll">
            <section className="mission-card" aria-label="使用目标">
              <div className="mission-card-title">目标：专升本数学满分路径</div>
              <p className="mission-card-text">
                用全量考点关系做「降维」：搜索命中会高亮并展开邻居；可在右侧多视图之间切换。
              </p>
            </section>

            <div className="hr" />

            <CatalogSidebar
              mode={mode}
              setMode={setMode}
              filter={filter}
              setFilter={setFilter}
              stats={stats}
              index={index}
              onOpenCreateNode={() => setInspector({ type: 'create' })}
              searchAssist={searchAssist}
            />

            <GraphInspector
              state={inspector}
              setInspector={setInspector}
              onClose={() => setInspector(null)}
              index={index}
              store={store}
            />
          </div>
        </div>
      </div>

      <div className="panel canvas">
        <VizCanvas
          mode={mode}
          index={index}
          filteredNodes={displayNodes}
          focusIds={focusIds}
          store={store}
        />
      </div>
    </div>
  )
}

