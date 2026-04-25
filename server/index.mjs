import express from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import {
  analysisPath,
  ensurePapersDir,
  filePath,
  listPapers,
  metaPath,
  paperDir,
  safeId,
  slugifyName,
  writeJson,
} from './paperStore.mjs'

const app = express()
app.use(express.json({ limit: '10mb' }))

// Local-only CORS for Vite dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

ensurePapersDir()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

app.get('/api/papers', (req, res) => {
  res.json({ papers: listPapers() })
})

app.post('/api/papers', upload.single('file'), (req, res) => {
  const f = req.file
  if (!f) return res.status(400).json({ error: 'missing file' })
  const displayName = slugifyName(req.body?.displayName ?? path.parse(f.originalname).name)
  const id = safeId()
  const dir = paperDir(id)
  fs.mkdirSync(dir, { recursive: true })

  const originalName = String(f.originalname ?? 'paper')
  const saveName = slugifyName(originalName)
  fs.writeFileSync(filePath(id, saveName), f.buffer)
  writeJson(metaPath(id), {
    id,
    displayName,
    originalName,
    savedName: saveName,
    size: f.size,
    mime: f.mimetype,
    uploadedAt: Date.now(),
  })
  res.json({ id, displayName, savedName: saveName })
})

app.put('/api/papers/:id/meta', (req, res) => {
  const id = String(req.params.id)
  const mp = metaPath(id)
  if (!fs.existsSync(mp)) return res.status(404).json({ error: 'not found' })
  const meta = JSON.parse(fs.readFileSync(mp, 'utf8'))
  const displayName = slugifyName(req.body?.displayName ?? meta.displayName)
  meta.displayName = displayName
  fs.writeFileSync(mp, JSON.stringify(meta, null, 2), 'utf8')
  res.json({ ok: true, meta })
})

app.get('/api/papers/:id/analysis', (req, res) => {
  const id = String(req.params.id)
  const ap = analysisPath(id)
  if (!fs.existsSync(ap)) return res.status(404).json({ error: 'no analysis' })
  res.type('json').send(fs.readFileSync(ap, 'utf8'))
})

app.post('/api/papers/:id/analysis', (req, res) => {
  const id = String(req.params.id)
  const dir = paperDir(id)
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'paper not found' })
  const body = req.body ?? {}
  const out = {
    topicCounts: body.topicCounts ?? {},
    topicQuestions: body.topicQuestions ?? {},
    questionCount: body.questionCount ?? 0,
    updatedAt: Date.now(),
  }
  fs.writeFileSync(analysisPath(id), JSON.stringify(out, null, 2), 'utf8')
  res.json({ ok: true })
})

app.delete('/api/papers/:id', (req, res) => {
  const id = String(req.params.id)
  const dir = paperDir(id)
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'not found' })
  fs.rmSync(dir, { recursive: true, force: true })
  res.json({ ok: true })
})

const port = Number(process.env.PORT ?? 5177)
app.listen(port, '127.0.0.1', () => {
  console.log(`[paper-api] listening on http://127.0.0.1:${port}`)
})

