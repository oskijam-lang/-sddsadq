import type { PrimitiveAxis, TopicEdge, TopicNode } from './types'

/** 弦图 / 力导向着色 / 径向+连线分组的共同「降维坐标」——不是章节名 */
export const PRIMITIVE_AXES: readonly PrimitiveAxis[] = [
  '完备与序',
  'ε-δ与逼近',
  '局部线性',
  '中值与凸性',
  'Taylor与多项式',
  '代数极限连续',
  '可逆与隐结构',
  '累积与分割',
  '换元与雅可比',
  '场线通量环量',
  '收敛与紧性',
  '对称与估计',
]

const axisIndex = new Map<PrimitiveAxis, number>()
PRIMITIVE_AXES.forEach((a, i) => axisIndex.set(a, i))

/** 排除章根等聚合壳，只保留可命题的「叶子考点」参与弦图矩阵 */
export function isLeafLikeTopic(n: TopicNode): boolean {
  if (n.tags.includes('章根')) return false
  if (n.id === 'ROOT' || n.id.endsWith('_ROOT')) return false
  return true
}

function pushUnique(arr: PrimitiveAxis[], a: PrimitiveAxis) {
  if (!arr.includes(a)) arr.push(a)
}

/** 从显式 axes、标签、id、标题关键词推断「底层知识点」落在哪些元轴上（可多轴） */
export function inferAxes(n: TopicNode): PrimitiveAxis[] {
  if (n.axes && n.axes.length > 0) return [...n.axes]

  const out: PrimitiveAxis[] = []
  const t = `${n.id} ${n.label} ${(n.alias ?? []).join(' ')} ${n.tags.join(' ')}`.toLowerCase()

  const has = (s: string) => t.includes(s.toLowerCase())

  if (has('完备') || has('上确界') || has('dedekind') || has('实数')) pushUnique(out, '完备与序')
  if (has('ε') || has('极限') || has('无穷小') || has('逼近') || has('n 定义') || has('δ')) pushUnique(out, 'ε-δ与逼近')
  if (has('导数') || has('微分') || has('偏导') || has('全微分') || has('梯度') || has('线性近似')) pushUnique(out, '局部线性')
  if (has('中值') || has('罗尔') || has('拉格朗日') || has('柯西') || has('凹凸') || has('拐点')) pushUnique(out, '中值与凸性')
  if (has('泰勒') || has('taylor') || has('麦克劳林') || has('展开') || has('幂级数')) pushUnique(out, 'Taylor与多项式')
  if (has('连续') || has('间断') || has('极限运算') || has('夹逼')) pushUnique(out, '代数极限连续')
  if (has('反函数') || has('隐函数') || has('参数') || has('雅可比') || has('方程组')) pushUnique(out, '可逆与隐结构')
  if (has('积分') || has('原函数') || has('牛顿') || has('莱布尼茨') || has('黎曼')) pushUnique(out, '累积与分割')
  if (has('换元') || has('极坐标') || has('柱坐标') || has('球坐标') || has('雅可比')) pushUnique(out, '换元与雅可比')
  if (has('曲线积分') || has('曲面积分') || has('通量') || has('环量') || has('格林') || has('高斯') || has('斯托克斯') || has('散度') || has('旋度'))
    pushUnique(out, '场线通量环量')
  if (has('收敛') || has('发散') || has('级数') || has('判别') || has('反常')) pushUnique(out, '收敛与紧性')
  if (has('不等式') || has('估计') || has('对称') || has('奇偶')) pushUnique(out, '对称与估计')

  if (n.id.startsWith('LIM_')) {
    pushUnique(out, 'ε-δ与逼近')
    pushUnique(out, '代数极限连续')
  }
  if (n.id.startsWith('DIFF1_')) {
    pushUnique(out, '局部线性')
    pushUnique(out, '中值与凸性')
  }
  if (n.id.startsWith('INT1_')) {
    pushUnique(out, '累积与分割')
    pushUnique(out, '对称与估计')
  }
  if (n.id.startsWith('ODE_')) {
    pushUnique(out, '累积与分割')
    pushUnique(out, '局部线性')
  }
  if (n.id.startsWith('VEC_')) {
    pushUnique(out, '换元与雅可比')
    pushUnique(out, '对称与估计')
  }
  if (n.id.startsWith('DIFFM_')) {
    pushUnique(out, '局部线性')
    pushUnique(out, '可逆与隐结构')
  }
  if (n.id.startsWith('INTM_')) {
    pushUnique(out, '换元与雅可比')
    pushUnique(out, '场线通量环量')
  }
  if (n.id.startsWith('SER_')) {
    pushUnique(out, '收敛与紧性')
    pushUnique(out, 'Taylor与多项式')
  }
  if (out.length === 0) pushUnique(out, '代数极限连续')
  return out
}

export function primaryAxis(n: TopicNode): PrimitiveAxis {
  return inferAxes(n)[0]!
}

/** 元轴 × 元轴：用底层边在两端点的元轴张量上累加权重（第一性原理上的「共现强度」） */
export function buildPrimitiveChordMatrix(nodes: TopicNode[], edges: TopicEdge[]): number[][] {
  const n0 = PRIMITIVE_AXES.length
  const matrix = Array.from({ length: n0 }, () => Array.from({ length: n0 }, () => 0))
  const byId = new Map(nodes.map((x) => [x.id, x]))
  const leafIds = new Set(nodes.filter(isLeafLikeTopic).map((x) => x.id))

  for (const ed of edges) {
    if (!leafIds.has(ed.source) || !leafIds.has(ed.target)) continue
    const u = byId.get(ed.source)
    const v = byId.get(ed.target)
    if (!u || !v) continue
    const Au = inferAxes(u)
    const Av = inferAxes(v)
    const w =
      ed.weight * (ed.type === 'PREREQ' ? 2.4 : ed.type === 'DERIVES' ? 2.0 : ed.type === 'CO_OCCUR' ? 1.5 : 1.0)
    for (const a of Au) {
      const i = axisIndex.get(a)
      if (i == null) continue
      for (const b of Av) {
        const j = axisIndex.get(b)
        if (j == null) continue
        matrix[i][j] += w
        if (i !== j) matrix[j][i] += w * 0.92
      }
    }
  }
  for (let i = 0; i < n0; i++) matrix[i][i] += 0.03
  return matrix
}
