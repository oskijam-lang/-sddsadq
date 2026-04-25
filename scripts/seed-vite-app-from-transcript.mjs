/**
 * Extracts the pre-change App.tsx from the first transcript patch (minus lines after @@).
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

function firstAppPatchText() {
  const text = fs.readFileSync(TRANSCRIPT, 'utf8')
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const c = o?.message?.content
    if (!Array.isArray(c)) continue
    for (const b of c) {
      if (
        b?.type === 'tool_use' &&
        b.name === 'ApplyPatch' &&
        typeof b.input === 'string' &&
        b.input.includes('*** Update File:') &&
        b.input.includes('App.tsx')
      ) {
        return b.input.replace(/\r\n/g, '\n')
      }
    }
  }
  return null
}

function extractMinusBlock(patch) {
  const ls = patch.split('\n')
  let afterAt = false
  const out = []
  for (const L of ls) {
    if (L.trim() === '@@') {
      afterAt = true
      continue
    }
    if (!afterAt) continue
    if (L.startsWith('-')) out.push(L.slice(1))
    else if (L.startsWith('+')) break
  }
  return out.join('\n')
}

const p = firstAppPatchText()
if (!p) {
  console.error('No App.tsx patch in transcript')
  process.exit(1)
}
const body = extractMinusBlock(p)
const out = path.join(WORKSPACE, 'src', 'App.tsx')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, body, 'utf8')
console.log('Wrote seed', out, 'bytes', body.length)
