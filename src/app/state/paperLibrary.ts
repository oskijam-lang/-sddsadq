import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TopicQuestionIndex } from '../../domain/paperAnalysis'

export type PaperMeta = {
  id: string
  displayName: string
  originalName: string
  savedName: string
  size: number
  mime: string
  uploadedAt: number
}

export type PaperListItem = {
  id: string
  meta: PaperMeta | null
  hasAnalysis: boolean
  analysisSummary: { topics: number; questions: number } | null
}

export type PaperAnalysisStore = {
  topicCounts: Record<string, number>
  topicQuestions: TopicQuestionIndex
  questionCount: number
  updatedAt: number
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export function usePaperLibrary() {
  const [items, setItems] = useState<PaperListItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [analysisCache, setAnalysisCache] = useState<Record<string, PaperAnalysisStore>>({})

  const refresh = useCallback(async () => {
    const data = await apiJson<{ papers: PaperListItem[] }>('/api/papers')
    setItems(data.papers)
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const upload = useCallback(
    async (file: File, displayName: string) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('displayName', displayName)
      const res = await apiJson<{ id: string }>('/api/papers', { method: 'POST', body: fd })
      await refresh()
      return res.id
    },
    [refresh],
  )

  const saveAnalysis = useCallback(async (paperId: string, payload: Omit<PaperAnalysisStore, 'updatedAt'>) => {
    await apiJson('/api/papers/' + encodeURIComponent(paperId) + '/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const a = (await apiJson<PaperAnalysisStore>('/api/papers/' + encodeURIComponent(paperId) + '/analysis')) as any
    setAnalysisCache((s) => ({ ...s, [paperId]: a }))
    await refresh()
  }, [refresh])

  const loadAnalysis = useCallback(async (paperId: string) => {
    if (analysisCache[paperId]) return analysisCache[paperId]
    const a = await apiJson<PaperAnalysisStore>('/api/papers/' + encodeURIComponent(paperId) + '/analysis')
    setAnalysisCache((s) => ({ ...s, [paperId]: a }))
    return a
  }, [analysisCache])

  const rename = useCallback(async (paperId: string, displayName: string) => {
    await apiJson('/api/papers/' + encodeURIComponent(paperId) + '/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    })
    await refresh()
  }, [refresh])

  const remove = useCallback(async (paperId: string) => {
    await apiJson('/api/papers/' + encodeURIComponent(paperId), { method: 'DELETE' })
    setSelectedIds((s) => s.filter((x) => x !== paperId))
    setAnalysisCache((s) => {
      const { [paperId]: _, ...rest } = s
      return rest
    })
    await refresh()
  }, [refresh])

  const toggleSelect = useCallback((paperId: string) => {
    setSelectedIds((s) => (s.includes(paperId) ? s.filter((x) => x !== paperId) : [...s, paperId]))
  }, [])

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds([...new Set(ids)])
  }, [])

  const addToSelection = useCallback((ids: string[]) => {
    setSelectedIds((s) => [...new Set([...s, ...ids])])
  }, [])

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  return {
    items,
    selectedIds,
    selected,
    refresh,
    upload,
    saveAnalysis,
    loadAnalysis,
    rename,
    remove,
    toggleSelect,
    setSelection,
    addToSelection,
  }
}

