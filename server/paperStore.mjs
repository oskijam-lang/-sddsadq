import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
export const PAPERS_DIR = path.join(ROOT, 'papers')

export function ensurePapersDir() {
  fs.mkdirSync(PAPERS_DIR, { recursive: true })
}

export function safeId() {
  const t = Date.now().toString(36)
  const r = Math.random().toString(16).slice(2, 10)
  return `P_${t}_${r}`.toUpperCase()
}

export function slugifyName(name) {
  const s = String(name ?? '').trim()
  if (!s) return '未命名'
  return s.replace(/[\\/:*?\"<>|]/g, '_').slice(0, 80)
}

export function paperDir(paperId) {
  return path.join(PAPERS_DIR, paperId)
}

export function metaPath(paperId) {
  return path.join(paperDir(paperId), 'meta.json')
}

export function analysisPath(paperId) {
  return path.join(paperDir(paperId), 'analysis.json')
}

export function filePath(paperId, filename) {
  return path.join(paperDir(paperId), filename)
}

export function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8')
}

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

export function listPapers() {
  ensurePapersDir()
  const dirs = fs.readdirSync(PAPERS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
  const out = []
  for (const d of dirs) {
    const id = d.name
    const mp = metaPath(id)
    const ap = analysisPath(id)
    const meta = fs.existsSync(mp) ? readJson(mp) : null
    const analysis = fs.existsSync(ap) ? readJson(ap) : null
    out.push({
      id,
      meta,
      hasAnalysis: Boolean(analysis),
      analysisSummary: analysis
        ? {
            topics: Object.keys(analysis.topicCounts ?? {}).length,
            questions: analysis.questionCount ?? 0,
          }
        : null,
    })
  }
  out.sort((a, b) => (b.meta?.uploadedAt ?? 0) - (a.meta?.uploadedAt ?? 0))
  return out
}

