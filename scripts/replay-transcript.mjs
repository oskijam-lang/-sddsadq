/**
 * Replays Cursor agent transcript tool ops into the workspace (no git required).
 * Supports: ApplyPatch, Write, StrReplace (in chronological order).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TRANSCRIPT = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'e-jiaoyuXUE',
  'agent-transcripts',
  '0766a85c-8923-4c88-b37a-0432eca3159e',
  '0766a85c-8923-4c88-b37a-0432eca3159e.jsonl',
)

function normRel(p) {
  let s = String(p).replaceAll('/', path.sep).replaceAll('\\', path.sep)
  const low = s.toLowerCase()
  const marker = 'jiaoyuxue' + path.sep
  const idx = low.lastIndexOf(marker)
  if (idx >= 0) s = s.slice(idx + marker.length)
  return s.replace(/^[/\\]+/, '').replaceAll('\\', path.sep)
}

function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8')
  const out = []
  for (const line of text.split(/\n/)) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip
    }
  }
  return out
}

function collectOps(rows) {
  const ops = []
  for (const row of rows) {
    const content = row?.message?.content
    if (!Array.isArray(content)) continue
    // 本会话后来写入了「简化版」图谱；同一条 jsonl 里若带上它，会把前面恢复的大考点库覆盖掉
    const tainted = content.some(
      (b) =>
        b?.type === 'tool_use' &&
        b.name === 'Write' &&
        typeof b.input?.contents === 'string' &&
        b.input.contents.includes('HMATH_ROOT_ID'),
    )
    if (tainted) break
    for (const b of content) {
      if (b?.type !== 'tool_use') continue
      const name = b.name
      if (name === 'ApplyPatch' && typeof b.input === 'string') {
        ops.push({ kind: 'patch', text: b.input })
      } else if (name === 'Write' && b.input?.path && typeof b.input.contents === 'string') {
        ops.push({ kind: 'write', path: b.input.path, contents: b.input.contents })
      } else if (
        name === 'StrReplace' &&
        b.input?.path &&
        typeof b.input.old_string === 'string' &&
        typeof b.input.new_string === 'string'
      ) {
        ops.push({
          kind: 'str',
          path: b.input.path,
          old: b.input.old_string,
          new: b.input.new_string,
        })
      }
    }
  }
  return ops
}

function hunkToOldNew(hunkText) {
  const rawLines = hunkText.replace(/\r\n/g, '\n').split('\n')
  const oldL = []
  const newL = []
  for (let line of rawLines) {
    if (line === '') continue
    const tag = line[0]
    const rest = line.slice(1)
    if (tag === ' ') {
      oldL.push(rest)
      newL.push(rest)
    } else if (tag === '-') {
      oldL.push(rest)
    } else if (tag === '+') {
      newL.push(rest)
    } else {
      // tolerate missing leading marker (context): treat as context
      oldL.push(line)
      newL.push(line)
    }
  }
  return { oldL, newL }
}

function findSubarray(hay, needle) {
  if (needle.length === 0) return 0
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

function applyHunks(content, hunks) {
  let lines = content.replace(/\r\n/g, '\n').split('\n')
  for (const hunk of hunks) {
    const { oldL, newL } = hunkToOldNew(hunk)
    if (oldL.length === 0 && newL.length === 0) continue
    const idx = findSubarray(lines, oldL)
    if (idx < 0) {
      const preview = oldL.slice(0, 6).join('\n')
      throw new Error(`Hunk not found. Old preview:\n${preview}`)
    }
    lines = [...lines.slice(0, idx), ...newL, ...lines.slice(idx + oldL.length)]
  }
  return lines.join('\n')
}

function parseUpdateBody(body) {
  let b = body.replace(/\r\n/g, '\n').trimStart()
  if (b.startsWith('@@')) b = b.replace(/^@@\n?/, '')
  if (!b.trim()) return []
  return b.split(/\n@@\n/).map((h) => h.trimEnd())
}

function applyOnePatchText(files, patchText) {
  patchText = patchText.replace(/\r\n/g, '\n')
  if (!patchText.includes('*** Begin Patch')) return
  const inner = patchText.split('*** Begin Patch')[1].split('*** End Patch')[0]
  const lines = inner.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\r$/, ''))
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('*** Update File:')) {
      const fp = normRel(line.replace('*** Update File:', '').trim())
      i++
      const chunk = []
      while (i < lines.length && !lines[i].startsWith('***')) {
        chunk.push(lines[i])
        i++
      }
      const body = chunk.join('\n')
      const hunks = parseUpdateBody(body)
      const disk =
        fs.existsSync(path.join(WORKSPACE, fp))
          ? fs.readFileSync(path.join(WORKSPACE, fp), 'utf8')
          : ''
      const prev = files.has(fp) ? files.get(fp) : disk
      try {
        files.set(fp, applyHunks(prev, hunks))
      } catch (e) {
        console.warn('[skip update]', fp, '-', e.message.split('\n')[0])
      }
      continue
    }
    if (line.startsWith('*** Add File:')) {
      const fp = normRel(line.replace('*** Add File:', '').trim())
      i++
      const out = []
      while (i < lines.length && !lines[i].startsWith('***')) {
        const L = lines[i]
        if (L.startsWith('+')) out.push(L.slice(1))
        else if (L.startsWith('-')) throw new Error(`Invalid add line in ${fp}: ${L}`)
        else if (L.trim() === '') out.push('')
        else out.push(L)
        i++
      }
      files.set(fp, out.join('\n'))
      continue
    }
    if (line.startsWith('*** Delete File:')) {
      const fp = normRel(line.replace('*** Delete File:', '').trim())
      files.delete(fp)
      i++
      continue
    }
    i++
  }
}

function normalizeText(s) {
  return String(s).replace(/\r\n/g, '\n')
}

function applyStr(files, fp, oldS, newS) {
  const rel = normRel(fp)
  const disk =
    fs.existsSync(path.join(WORKSPACE, rel))
      ? fs.readFileSync(path.join(WORKSPACE, rel), 'utf8')
      : ''
  const cur0 = files.has(rel) ? files.get(rel) : disk
  const cur = normalizeText(cur0)
  const o = normalizeText(oldS)
  const n = normalizeText(newS)
  if (!cur.includes(o)) {
    const head = o.slice(0, 120)
    console.warn('[skip str]', rel, JSON.stringify(head))
    return
  }
  files.set(rel, cur.replace(o, n))
}

function main() {
  if (!fs.existsSync(TRANSCRIPT)) {
    console.error('Transcript not found:', TRANSCRIPT)
    process.exit(1)
  }
  const rows = readJsonl(TRANSCRIPT)
  const ops = collectOps(rows)
  console.log('ops', ops.length)

  const files = new Map()
  let n = 0
  for (const op of ops) {
    n++
    try {
      if (op.kind === 'patch') applyOnePatchText(files, op.text)
      else if (op.kind === 'write') files.set(normRel(op.path), op.contents)
      else if (op.kind === 'str') applyStr(files, op.path, op.old, op.new)
    } catch (e) {
      console.error(`\nFAIL at op #${n} (${op.kind})`, e.message)
      process.exit(1)
    }
  }

  for (const [rel, content] of files.entries()) {
    const abs = path.join(WORKSPACE, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
  }
  console.log('wrote', files.size, 'files under', WORKSPACE)
}

main()
