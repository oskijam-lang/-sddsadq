export type Chapter =
  | 'ALL'
  | '函数与极限'
  | '一元微分学'
  | '一元积分学'
  | '常微分方程'
  | '向量代数与空间解析几何'
  | '多元函数微分学'
  | '多元函数积分学'
  | '无穷级数'
  | '第一性原理与元结构'

export type CognitiveLevel = 'ALL' | '记忆' | '理解' | '应用' | '分析' | '综合' | '评价'

/** 高数知识点的「降维坐标」：用于弦图/力导向着色/径向分组 */
export type PrimitiveAxis =
  | '完备与序'
  | 'ε-δ与逼近'
  | '局部线性'
  | '中值与凸性'
  | 'Taylor与多项式'
  | '代数极限连续'
  | '可逆与隐结构'
  | '累积与分割'
  | '换元与雅可比'
  | '场线通量环量'
  | '收敛与紧性'
  | '对称与估计'

export type ViewMode =
  | 'RADIAL_TREE'
  | 'RADIAL_LINKS'
  | 'CHORD'
  | 'FORCE'
  | 'SANKEY'
  | 'EXAM_HEATMAP'

export type EdgeType = 'PREREQ' | 'CO_OCCUR' | 'SIMILAR' | 'DERIVES'

export type TopicNode = {
  id: string
  label: string
  chapter: Exclude<Chapter, 'ALL'>
  difficulty: 1 | 2 | 3 | 4 | 5
  importance: 1 | 2 | 3 | 4 | 5
  cognitive: Exclude<CognitiveLevel, 'ALL'>[]
  tags: string[]
  alias?: string[]
  parentId?: string
  /** 显式元轴；未填时由 firstPrinciples.inferAxes 推断 */
  axes?: PrimitiveAxis[]
}

export type TopicEdge = {
  source: string
  target: string
  type: EdgeType
  weight: number
  note?: string
}

export type TopicCatalog = {
  version: string
  nodes: TopicNode[]
  edges: TopicEdge[]
}

export type CatalogIndex = {
  nodes: TopicNode[]
  edges: TopicEdge[]
  byId: Map<string, TopicNode>
  children: Map<string, TopicNode[]>
  chapters: Exclude<Chapter, 'ALL'>[]
}

/** 内容维度：可多章叠加；空数组表示「全部章节」 */
export type ChapterScope = Exclude<Chapter, 'ALL'>[]

export type CatalogFilter = {
  query: string
  chapterScope: ChapterScope
  cognitive: CognitiveLevel
  minDifficulty: number
  maxDifficulty: number
}

