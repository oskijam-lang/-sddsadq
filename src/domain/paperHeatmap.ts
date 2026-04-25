import type { CatalogIndex } from './types'
import { EXAM_ARCHETYPES, EXAM_HEATMAP_CHAPTERS, type ExamArchetype } from './examBlueprint'
import type { TopicQuestionIndex } from './paperAnalysis'

export type PaperHeatmap = {
  chapters: string[]
  archetypes: readonly string[]
  /** ECharts heatmap data: [xi, yi, value] */
  data: [number, number, number][]
  /** 供 tooltip 显示：该格子来自哪些题干片段 */
  cellRefs: Record<string, Array<{ paper: string; qid: string; snippet: string }>>
}

function norm(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[【】]/g, '')
    .trim()
}

export function guessArchetypeFromQuestionText(q: string): ExamArchetype {
  const t = norm(q).toLowerCase()

  // 综合压轴：常见“综合/证明+计算/多问/压轴/探究”
  if (/(压轴|综合|探究|证明并求|讨论并求|证明.*并.*求|多问|（1）.*（2）)/i.test(t)) return '综合压轴'

  // 证明说理
  if (/(证明|证|说明|推出|论证|成立|不成立|充分|必要|充要|单调|有界|连续|可导)/i.test(t)) return '证明说理'

  // 应用建模：文字题、实际意义、面积/体积/功/质心/概率等
  if (/(应用|实际|经济|物理|求面积|体积|功|质心|速度|路程|增长率|模型|最值问题|参数方程.*实际)/i.test(t))
    return '应用建模'

  // 几何建模：曲线/曲面/法向/切线/曲率/空间几何/向量
  if (/(几何|曲线|曲面|切线|法向|曲率|曲率半径|平面|直线|空间|向量|投影|球面|柱面)/i.test(t))
    return '几何建模'

  // 计算求值：直接求极限/导数/积分/解方程/值
  if (/(求.*(值|解)|计算|求导|导数|积分|极限|微分方程|通解|通项|展开|收敛|发散)/i.test(t))
    return '计算求值'

  // 概念辨析：定义/判断/选项/说法
  if (/(定义|概念|判断|下列|正确|错误|说法|选择|填空)/i.test(t)) return '概念辨析'

  return '计算求值'
}

const keyCell = (ch: string, arch: string) => `${ch}\u0000${arch}`

export function buildPaperHeatmap(index: CatalogIndex, topicQuestions: TopicQuestionIndex): PaperHeatmap {
  const chapters = [...EXAM_HEATMAP_CHAPTERS]
  const archetypes = EXAM_ARCHETYPES
  const counts = new Map<string, number>()
  const cellRefs: PaperHeatmap['cellRefs'] = {}

  // 去重：同一 paper+qid 不重复计入同一格子
  const seen = new Set<string>()

  for (const [topicId, refs] of Object.entries(topicQuestions ?? {})) {
    const node = index.byId.get(topicId)
    if (!node) continue
    const ch = node.chapter
    if (!chapters.includes(ch)) continue

    for (const r of refs ?? []) {
      const qText = r.fullText ?? r.snippet ?? ''
      if (!qText) continue
      const arch = guessArchetypeFromQuestionText(qText)
      const sk = `${ch}\u0000${arch}\u0000${r.paper}\u0000${r.qid}`
      if (seen.has(sk)) continue
      seen.add(sk)

      const k = keyCell(ch, arch)
      counts.set(k, (counts.get(k) ?? 0) + 1)
      ;(cellRefs[k] ??= []).push({ paper: r.paper, qid: r.qid, snippet: r.snippet })
    }
  }

  // 生成矩阵数据（xi, yi, v）
  const data: [number, number, number][] = []
  for (let yi = 0; yi < chapters.length; yi++) {
    for (let xi = 0; xi < archetypes.length; xi++) {
      const ch = chapters[yi]!
      const arch = archetypes[xi]!
      const v = counts.get(keyCell(ch, arch)) ?? 0
      data.push([xi, yi, v])
    }
  }

  return { chapters, archetypes, data, cellRefs }
}

