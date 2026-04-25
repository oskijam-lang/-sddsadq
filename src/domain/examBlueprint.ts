import type { Chapter } from './types'

export const EXAM_ARCHETYPES = [
  '概念辨析',
  '计算求值',
  '证明说理',
  '几何建模',
  '应用建模',
  '综合压轴',
] as const

export type ExamArchetype = (typeof EXAM_ARCHETYPES)[number]

export const EXAM_HEATMAP_CHAPTERS: Exclude<Chapter, 'ALL'>[] = [
  '函数与极限',
  '一元微分学',
  '一元积分学',
  '常微分方程',
  '向量代数与空间解析几何',
  '多元函数微分学',
  '多元函数积分学',
  '无穷级数',
  '第一性原理与元结构',
]

export type ExamBlueprint = {
  chapter: Exclude<Chapter, 'ALL'>
  archetype: ExamArchetype
  title: string
  bullets: string[]
  /** 图谱中的考点 id，悬停时可解析为标题 */
  relatedTopicIds: string[]
}

const archHints: Record<ExamArchetype, string[]> = {
  概念辨析: ['定义与记号是否一致', '充分/必要/充要条件的甄别', '反例构造与常见误区'],
  计算求值: ['标准化步骤 + 化简技巧', '参数讨论与分段', '数值稳定性与验算'],
  证明说理: ['中值/凸性/单调桥接', 'ε-δ 或 估计式', '构造辅助函数'],
  几何建模: ['坐标系选取', '对称性降维', '边界与奇点处理'],
  应用建模: ['微元法列式', '量纲与物理意义', '边界条件与积分域'],
  综合压轴: ['多章工具链', '放缩与一致收敛感', '时间压力下取舍策略'],
}

const chapterTopicHints: Partial<Record<Exclude<Chapter, 'ALL'>, string[]>> = {
  函数与极限: ['LIM_ROOT', 'LIM_010', 'LIM_012', 'LIM_015'],
  一元微分学: ['DIFF1_ROOT', 'DIFF1_006', 'DIFF1_012', 'DIFF1_018'],
  一元积分学: ['INT1_ROOT', 'INT1_007', 'INT1_010', 'INT1_013', 'INT1_015'],
  常微分方程: ['ODE_ROOT', 'ODE_004', 'ODE_008'],
  向量代数与空间解析几何: ['VEC_ROOT', 'VEC_004', 'VEC_006'],
  多元函数微分学: ['DIFFM_ROOT', 'DIFFM_003', 'DIFFM_009', 'DIFFM_010'],
  多元函数积分学: ['INTM_ROOT', 'INTM_002', 'INTM_008', 'INTM_012'],
  无穷级数: ['SER_ROOT', 'SER_006', 'SER_008', 'SER_010'],
  第一性原理与元结构: ['FP_ROOT', 'FP_C01', 'FP_E01', 'FP_S01'],
}

function extraForCell(ch: Exclude<Chapter, 'ALL'>, arch: ExamArchetype): string[] {
  if (arch === '应用建模' && ch === '一元积分学') {
    return ['典型：面积/旋转体/弧长/功与质心', '与牛顿-莱布尼茨、反常积分判别联动出大题']
  }
  if (arch === '几何建模' && ch === '多元函数积分学') {
    return ['格林/高斯/斯托克斯的「方向与定向」', '参数曲面与投影域']
  }
  if (arch === '证明说理' && ch === '函数与极限') {
    return ['夹逼与单调有界', '连续延拓与间断分类']
  }
  if (arch === '综合压轴' && ch === '无穷级数') {
    return ['和函数 + 逐项求导/积分', '端点收敛单独讨论']
  }
  return [`本章在「${arch}」维度下的常见卷面组合与赋分点`]
}

function relatedIds(ch: Exclude<Chapter, 'ALL'>, arch: ExamArchetype): string[] {
  const base = chapterTopicHints[ch] ?? []
  if (arch === '应用建模' && ch === '一元积分学') {
    return ['INT1_007', 'INT1_010', 'INT1_011', 'INT1_012', 'INT1_013', 'INT1_015']
  }
  if (arch === '计算求值' && ch === '一元积分学') {
    return ['INT1_002', 'INT1_003', 'INT1_015', 'INT1_014', 'INT1_007']
  }
  return base
}

export const EXAM_BLUEPRINTS: ExamBlueprint[] = EXAM_HEATMAP_CHAPTERS.flatMap((ch) =>
  EXAM_ARCHETYPES.map((arch) => ({
    chapter: ch,
    archetype: arch,
    title: `${ch} × ${arch}`,
    bullets: [...archHints[arch], ...extraForCell(ch, arch)],
    relatedTopicIds: relatedIds(ch, arch),
  })),
)

const cellKey = (ch: string, arch: string) => `${ch}\u0000${arch}`

const byCell = new Map<string, ExamBlueprint[]>()
for (const b of EXAM_BLUEPRINTS) {
  const k = cellKey(b.chapter, b.archetype)
  const arr = byCell.get(k) ?? []
  arr.push(b)
  byCell.set(k, arr)
}

export function blueprintsForCell(chapter: string, archetype: string): ExamBlueprint[] {
  return byCell.get(cellKey(chapter, archetype)) ?? []
}

export function examHeatmapMatrix(): {
  chapters: string[]
  archetypes: readonly string[]
  data: [number, number, number][]
} {
  const chapters = [...EXAM_HEATMAP_CHAPTERS]
  const archetypes = EXAM_ARCHETYPES
  const data: [number, number, number][] = []
  for (let yi = 0; yi < chapters.length; yi++) {
    for (let xi = 0; xi < archetypes.length; xi++) {
      const list = blueprintsForCell(chapters[yi]!, archetypes[xi]!)
      const bp = list[0]
      const v = Math.min(10, 3 + Math.min(7, (bp?.relatedTopicIds.length ?? 0) + (bp?.bullets.length ?? 0) / 2))
      data.push([xi, yi, v])
    }
  }
  return { chapters, archetypes, data }
}
