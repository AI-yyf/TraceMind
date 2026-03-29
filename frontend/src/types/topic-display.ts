export interface TopicDisplayHero {
  topicId: string
  title: string
  subtitle: string
  summary: string
  originPaperId: string
  originPaperTitleZh: string
  originPaperTitleEn: string
  stageCount: number
  activeBranchCount: number
  mergeCount: number
  lastBuiltAt: string
}

export interface TopicDisplayBranchCard {
  branchId: string
  branchLabel: string
  branchColor: string
  status: string
  statusLabel?: string
  paperId: string
  paperTitleZh: string
  paperTitleEn: string
  timelineDigest: string
  windowStart: string
  windowEnd: string
  windowMonths: number
  problemTags: string[]
  isMergePaper: boolean
  mergeFromBranchIds: string[]
}

export interface TopicDisplayStageColumn {
  stageIndex: number
  title: string
  summary: string
  branchCards: TopicDisplayBranchCard[]
}

export interface TopicDisplayBranchPaletteEntry {
  branchId: string
  branchLabel: string
  color: string
  status: string
}

export interface TopicDisplayMergeMarker {
  paperId: string
  paperTitleZh: string
  stageIndex: number
  branchId: string
  branchColor: string
  mergedBranchIds: string[]
}

export interface TopicDisplayLegend {
  stageLabel: string
  branchLabel: string
  mergeLabel: string
  dormantLabel: string
}

export interface TopicDisplay {
  topicId: string
  hero: TopicDisplayHero
  stageColumns: TopicDisplayStageColumn[]
  branchPalette: TopicDisplayBranchPaletteEntry[]
  mergeMarkers: TopicDisplayMergeMarker[]
  timelineLegend: TopicDisplayLegend
  /** 后端生成的叙事性文章，完整讲述该主题的学术旅程 */
  narrativeArticle?: string
}

export interface TopicDisplayCollection {
  schemaVersion?: number
  topics: TopicDisplay[]
}
