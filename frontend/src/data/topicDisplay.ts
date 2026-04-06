import topicDisplayJson from '@generated/workflow/topic-display.json'

import type { TopicDisplay, TopicDisplayCollection } from '@/types/topic-display'

const BRANCH_COLOR_PALETTE = [
  '#D94F3D',
  '#2F67F6',
  '#0F9D7A',
  '#C66A1C',
  '#7A5AF8',
  '#CA3D6A',
  '#168A9A',
  '#B6452C',
  '#496DDB',
  '#3C8E5B',
]

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function hashBranchId(value: string) {
  let hash = 0
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash
}

function colorForBranch(branchId: string, mainlineBranchId?: string | null) {
  if (
    branchId === 'main' ||
    branchId.startsWith('main:') ||
    (mainlineBranchId ? branchId === mainlineBranchId : /:origin$/u.test(branchId))
  ) {
    return '#D94F3D'
  }
  return BRANCH_COLOR_PALETTE[hashBranchId(branchId) % BRANCH_COLOR_PALETTE.length]
}

function normalizeTopicDisplay(raw: unknown): TopicDisplay | null {
  const record = asRecord(raw)
  if (!record) return null
  const hero = asRecord(record.hero)
  if (!hero) return null
  const stageColumns = Array.isArray(record.stageColumns) ? record.stageColumns : []
  const branchPalette = Array.isArray(record.branchPalette) ? record.branchPalette : []
  const mergeMarkers = Array.isArray(record.mergeMarkers) ? record.mergeMarkers : []

  // 如果没有 stageColumns，说明数据不完整，返回 null
  if (stageColumns.length === 0) return null

  return {
    topicId: asString(record.topicId),
    hero: {
      topicId: asString(hero.topicId),
      title: asString(hero.title),
      subtitle: asString(hero.subtitle),
      summary: asString(hero.summary),
      originPaperId: asString(hero.originPaperId),
      originPaperTitleZh: asString(hero.originPaperTitleZh),
      originPaperTitleEn: asString(hero.originPaperTitleEn),
      stageCount: asNumber(hero.stageCount),
      activeBranchCount: asNumber(hero.activeBranchCount),
      mergeCount: asNumber(hero.mergeCount),
      lastBuiltAt: asString(hero.lastBuiltAt),
    },
    stageColumns: stageColumns
      .map((item) => {
        const column = asRecord(item)
        if (!column) return null
        return {
          stageIndex: Math.max(1, Math.trunc(asNumber(column.stageIndex, 1))),
          title: asString(column.title),
          summary: asString(column.summary),
          branchCards: Array.isArray(column.branchCards)
            ? column.branchCards
                .map((card) => {
                  const branchCard = asRecord(card)
                  if (!branchCard) return null
                  return {
                    branchId: asString(branchCard.branchId),
                    branchLabel: asString(branchCard.branchLabel),
                    branchColor: asString(branchCard.branchColor, colorForBranch(asString(branchCard.branchId))),
                    status: asString(branchCard.status),
                    statusLabel: asString(branchCard.statusLabel),
                    paperId: asString(branchCard.paperId),
                    paperTitleZh: asString(branchCard.paperTitleZh),
                    paperTitleEn: asString(branchCard.paperTitleEn),
                    timelineDigest: asString(branchCard.timelineDigest),
                    windowStart: asString(branchCard.windowStart),
                    windowEnd: asString(branchCard.windowEnd),
                    windowMonths: Math.max(1, Math.trunc(asNumber(branchCard.windowMonths, 1))),
                    problemTags: asStringArray(branchCard.problemTags),
                    isMergePaper: branchCard.isMergePaper === true,
                    mergeFromBranchIds: asStringArray(branchCard.mergeFromBranchIds),
                  }
                })
                .filter((card): card is NonNullable<typeof card> => Boolean(card))
            : [],
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => left.stageIndex - right.stageIndex),
    branchPalette: branchPalette
      .map((item) => {
        const branch = asRecord(item)
        if (!branch) return null
        return {
          branchId: asString(branch.branchId),
          branchLabel: asString(branch.branchLabel),
          color: asString(branch.color, colorForBranch(asString(branch.branchId))),
          status: asString(branch.status),
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    mergeMarkers: mergeMarkers
      .map((item) => {
        const marker = asRecord(item)
        if (!marker) return null
        return {
          paperId: asString(marker.paperId),
          paperTitleZh: asString(marker.paperTitleZh),
          stageIndex: Math.max(1, Math.trunc(asNumber(marker.stageIndex, 1))),
          branchId: asString(marker.branchId),
          branchColor: asString(marker.branchColor, colorForBranch(asString(marker.branchId))),
          mergedBranchIds: asStringArray(marker.mergedBranchIds),
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    timelineLegend: {
      stageLabel: asString(asRecord(record.timelineLegend)?.stageLabel, '纵向代表同一层级的研究阶段。'),
      branchLabel: asString(asRecord(record.timelineLegend)?.branchLabel, '横向不同颜色代表不同分支，同一分支颜色跨页面保持一致。'),
      mergeLabel: asString(asRecord(record.timelineLegend)?.mergeLabel, '当一篇论文承接多条分支时，会以汇流节点出现。'),
      dormantLabel: asString(asRecord(record.timelineLegend)?.dormantLabel, '若本阶段没有新论文推进，会显示为"本阶段未推进"。'),
    },
  }
}

const generatedCollection = topicDisplayJson as TopicDisplayCollection
const normalizedGeneratedDisplays = (generatedCollection.topics ?? [])
  .map(normalizeTopicDisplay)
  .filter((topic): topic is TopicDisplay => Boolean(topic))

// 只使用后端生成的数据，不再构建 fallback
export const topicDisplayMap: Record<string, TopicDisplay> = Object.fromEntries(
  normalizedGeneratedDisplays.map((display) => [display.topicId, display]),
)

export function getTopicDisplay(topicId: string) {
  return topicDisplayMap[topicId] ?? null
}

export function getTopicPaperSequence(display: TopicDisplay) {
  const sequence: Array<{
    stageIndex: number
    branchId: string
    branchLabel: string
    paperId: string
    paperTitleZh: string
    paperTitleEn: string
    isMergePaper: boolean
  }> = []

  for (const column of display.stageColumns) {
    for (const card of column.branchCards) {
      if (!card.paperId || card.status === 'no-candidate') continue
      sequence.push({
        stageIndex: column.stageIndex,
        branchId: card.branchId,
        branchLabel: card.branchLabel,
        paperId: card.paperId,
        paperTitleZh: card.paperTitleZh,
        paperTitleEn: card.paperTitleEn,
        isMergePaper: card.isMergePaper,
      })
    }
  }

  return sequence.filter((item, index, collection) => {
    return collection.findIndex((candidate) => candidate.paperId === item.paperId) === index
  })
}

export function getDisplayPaper(display: TopicDisplay, paperId: string) {
  for (const column of display.stageColumns) {
    for (const card of column.branchCards) {
      if (card.paperId === paperId) {
        return {
          stageIndex: column.stageIndex,
          stageTitle: column.title,
          stageSummary: column.summary,
          card,
        }
      }
    }
  }
  return null
}

export function getPaperNeighbors(display: TopicDisplay, paperId: string) {
  const sequence = getTopicPaperSequence(display)
  const currentIndex = sequence.findIndex((item) => item.paperId === paperId)
  return {
    previous: currentIndex > 0 ? sequence[currentIndex - 1] : null,
    next: currentIndex >= 0 && currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null,
  }
}
