import { useEffect, useMemo, useState } from 'react'
import type { TopicCatalog, TopicEdge, TopicNode } from '../../domain/types'
import { hmCatalog } from '../../domain/hmathCatalog'

const LS_KEY = 'edu-viz.catalog.v1'

function safeParse(json: string | null): TopicCatalog | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    if (!v || typeof v !== 'object') return null
    if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) return null
    /** 空壳或半保存失败会导致全站白屏，回退到内置目录 */
    if (v.nodes.length < 3) return null
    // 兼容旧章节命名：重积分与曲线曲面积分 → 多元函数积分学
    try {
      if (Array.isArray(v.nodes)) {
        v.nodes = v.nodes.map((n: any) =>
          n && n.chapter === '重积分与曲线曲面积分' ? { ...n, chapter: '多元函数积分学' } : n,
        )
      }
    } catch {
      // ignore
    }
    return v as TopicCatalog
  } catch {
    return null
  }
}

function nowVersion() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function genId(prefix: string) {
  const s = Math.random().toString(16).slice(2, 10).toUpperCase()
  return `${prefix}_${s}`
}

export type CatalogMutations = {
  setCatalog: (c: TopicCatalog) => void
  resetToDefault: () => void
  addNode: (node: Omit<TopicNode, 'id'> & { id?: string }) => string
  updateNode: (id: string, patch: Partial<TopicNode>) => void
  deleteNode: (id: string) => void
  addEdge: (edge: TopicEdge) => void
  deleteEdge: (edge: TopicEdge) => void
}

export function useCatalogStore() {
  const [catalog, setCatalogState] = useState<TopicCatalog>(() => {
    const fromLs = safeParse(localStorage.getItem(LS_KEY))
    return fromLs ?? hmCatalog
  })

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(catalog))
  }, [catalog])

  const api = useMemo(() => {
    const setCatalog = (c: TopicCatalog) => setCatalogState(c)
    const resetToDefault = () => setCatalogState(hmCatalog)

    const addNode: CatalogMutations['addNode'] = (node) => {
      const id = node.id?.trim() || genId('USR')
      setCatalogState((s) => ({
        version: nowVersion(),
        nodes: [...s.nodes, { ...node, id }],
        edges: s.edges,
      }))
      return id
    }

    const updateNode: CatalogMutations['updateNode'] = (id, patch) => {
      setCatalogState((s) => ({
        version: nowVersion(),
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch, id } : n)),
        edges: s.edges,
      }))
    }

    const deleteNode: CatalogMutations['deleteNode'] = (id) => {
      setCatalogState((s) => ({
        version: nowVersion(),
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      }))
    }

    const sameEdge = (a: TopicEdge, b: TopicEdge) =>
      a.source === b.source && a.target === b.target && a.type === b.type

    const addEdge: CatalogMutations['addEdge'] = (edge) => {
      setCatalogState((s) => {
        const exists = s.edges.some((e) => sameEdge(e, edge))
        return exists
          ? s
          : {
              version: nowVersion(),
              nodes: s.nodes,
              edges: [...s.edges, edge],
            }
      })
    }

    const deleteEdge: CatalogMutations['deleteEdge'] = (edge) => {
      setCatalogState((s) => ({
        version: nowVersion(),
        nodes: s.nodes,
        edges: s.edges.filter((e) => !sameEdge(e, edge)),
      }))
    }

    return { setCatalog, resetToDefault, addNode, updateNode, deleteNode, addEdge, deleteEdge }
  }, [])

  return { catalog, ...api }
}

