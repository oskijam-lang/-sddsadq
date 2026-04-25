import type { TopicNode } from './types'

/** 与「定积分」强相关、但不包含「不定积分」误判的考点 id */
const DEFINITE_INTEGRAL_IDS = new Set([
  'INT1_006',
  'INT1_007',
  'INT1_008',
  'INT1_009',
  'INT1_010',
  'INT1_011',
  'INT1_012',
  'INT1_013',
  'INT1_014',
  'INT1_015',
  'INT1_016',
  'INT1_017',
  'INT1_018',
])

const INDEFINITE_INTEGRAL_IDS = new Set(['INT1_001', 'INT1_002', 'INT1_003', 'INT1_004', 'INT1_005'])

/** 构造可检索文本（含 id）。将「不定积分」整体占位，避免子串「定积分」误命中 */
export function buildSearchHaystack(n: TopicNode): string {
  const raw = [
    n.id,
    n.label,
    ...(n.alias ?? []),
    ...n.tags,
    n.chapter,
    ...(n.axes ?? []),
    n.cognitive.join(''),
  ]
    .join('\u0001')
    .toLowerCase()
  return raw.replace(/不定积分/g, '__indefinite_integral__')
}

/** 分词：去空白、常见标点，并把「的」拆成空格（「定积分的应用」→ 定积分 + 应用） */
export function tokenizeSearchQuery(raw: string): string[] {
  const s = raw.trim().toLowerCase()
  if (!s) return []
  return s
    .replace(/[的之与及和或、，。；;:!？?（）()\[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

const SYNONYMS: Record<string, string[]> = {
  定积分: ['定积分', '牛顿', '莱布尼茨', '牛-莱', '变上限', '反常积分', '∫'],
  变上限: ['变上限', '变限', '上积分', '上积分限', '定限'],
  不定积分: ['不定积分', '原函数'],
  积分: ['积分', '∫'],
  极限: ['极限', 'ε', 'δ', '无穷小'],
  导数: ['导数', '可导', '偏导', '全微分'],
  级数: ['级数', '幂级数', '收敛', '发散'],
  泰勒: ['泰勒', 'taylor', '麦克劳林', '展开'],
  应用: ['应用', '建模', '几何', '物理', '面积', '体积', '功', '压力', '弧长', '质心', '转动惯量'],
  证明: ['证明', '中值', '罗尔', '拉格朗日', '柯西', '不等式'],
  计算: ['计算', '求值', '求导', '换元', '分部'],
}

function expansionsForToken(tok: string): string[] {
  const out = new Set<string>([tok])
  /** 「定积分」等词若触发泛泛的「积分」扩召回，会把不定积分技巧节点全拉进来 */
  const skipBroadIntegral = /定积|不定积/.test(tok)
  for (const [k, arr] of Object.entries(SYNONYMS)) {
    if (skipBroadIntegral && k === '积分') continue
    if (tok === k || tok.includes(k) || k.includes(tok)) {
      arr.forEach((x) => out.add(x))
      out.add(k)
    }
  }
  return [...out]
}

/** 单 token 是否在文本中命中（含同义扩展 + 章节/id 启发） */
export function tokenHitsNode(tok: string, hay: string, n: TopicNode): boolean {
  const h = hay.toLowerCase()

  if (tok === '应用' || tok === '建模') {
    const labTags = `${n.label}${n.tags.join('')}`.toLowerCase()
    if (/应用|建模|几何|物理|面积|体积|功|压力|弧长|质心|应用题|建模题|几何应用/.test(labTags)) return true
    if (n.tags.some((t) => /应用|建模|几何|物理|几何应用|应用题/.test(t))) return true
    return false
  }

  if (h.includes(tok)) return true
  for (const ex of expansionsForToken(tok)) {
    if (h.includes(ex)) return true
  }

  if (tok.includes('不定积') || tok === '不定积分' || tok === '不定') {
    if (h.includes('__indefinite_integral__')) return true
    if (INDEFINITE_INTEGRAL_IDS.has(n.id)) return true
  }

  if (tok.includes('定积') || tok === '定积分') {
    if (h.includes('定积分')) return true
    if (DEFINITE_INTEGRAL_IDS.has(n.id)) return true
    if (h.includes('莱布尼茨') || h.includes('牛顿')) return true
    if (h.includes('变上限')) return true
    if (h.includes('反常积分')) return true
  }
  if (tok.includes('变上') || tok === '变限' || tok.includes('变限')) {
    if (h.includes('变上限') || h.includes('变限')) return true
    if (n.id === 'INT1_007' || h.includes('莱布尼茨') || h.includes('变上限积')) return true
  }
  if (tok.includes('应用') && tok.length > 2) {
    if (h.includes(tok)) return true
    if (n.tags.some((t) => t.includes(tok) || tok.includes(t))) return true
  }
  return false
}

/** AND：每个分词都要命中（适合「定积分 应用」） */
export function matchAllTokens(n: TopicNode, tokens: string[]): boolean {
  const hay = buildSearchHaystack(n)
  return tokens.every((t) => tokenHitsNode(t, hay, n))
}

/** 软评分：命中分词越多分越高 */
export function scoreTopicMatch(n: TopicNode, tokens: string[]): number {
  const hay = buildSearchHaystack(n)
  let s = 0
  for (const t of tokens) {
    if (tokenHitsNode(t, hay, n)) s += 1
  }
  return s
}

export type SearchMatchMode = 'ALL' | 'AND' | 'OR_SCORE' | 'OR_ANY'

export function searchTopicsInBase(
  base: TopicNode[],
  queryRaw: string,
): { matched: TopicNode[]; mode: SearchMatchMode; tokens: string[] } {
  const tokens = tokenizeSearchQuery(queryRaw)
  if (tokens.length === 0) return { matched: base, mode: 'ALL', tokens: [] }

  const and = base.filter((n) => matchAllTokens(n, tokens))
  if (and.length > 0) return { matched: and, mode: 'AND', tokens }

  const scored = base
    .map((n) => ({ n, s: scoreTopicMatch(n, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)

  const need = Math.max(1, Math.ceil(tokens.length * 0.6))
  const byScore = scored.filter((x) => x.s >= need).map((x) => x.n)
  if (byScore.length > 0) return { matched: byScore, mode: 'OR_SCORE', tokens }

  const any = scored.map((x) => x.n).slice(0, 40)
  return { matched: any, mode: 'OR_ANY', tokens }
}

/** 在边集上从 seed 做 BFS，扩 k 跳（仅端点均在 allowed 内） */
export function expandByEdgeHops(
  seeds: Set<string>,
  edges: { source: string; target: string }[],
  allowed: Set<string>,
  hops: number,
): Set<string> {
  const out = new Set<string>(seeds)
  let frontier = new Set<string>(seeds)
  for (let h = 0; h < hops; h++) {
    const next = new Set<string>()
    for (const e of edges) {
      if (!allowed.has(e.source) || !allowed.has(e.target)) continue
      if (frontier.has(e.source)) next.add(e.target)
      if (frontier.has(e.target)) next.add(e.source)
    }
    for (const id of next) out.add(id)
    frontier = next
  }
  return out
}
