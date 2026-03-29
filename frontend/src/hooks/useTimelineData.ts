import { useMemo } from 'react'
import { paperMap } from '../data/tracker'
import type { ProblemTrace, TrackerPaper, TrackerTopic } from '../types/tracker'

export interface TimelineGroup {
  dateLabel: string
  dateRaw: string
  year: string
  monthDay: string
  papers: TrackerPaper[]
  problems: ProblemTrace[]
}

export function getTopicPapers(topic: TrackerTopic): TrackerPaper[] {
  const paperIds = new Set<string>()

  paperIds.add(topic.originPaper.id)
  topic.papers.forEach((paper) => paperIds.add(paper.id))

  topic.memory.publishedMainlinePaperIds.forEach((paperId) => paperIds.add(paperId))
  topic.memory.publishedBranchPaperIds.forEach((paperId) => paperIds.add(paperId))
  topic.memory.candidatePaperIds.forEach((paperId) => paperIds.add(paperId))
  topic.memory.seedPaperIds.forEach((paperId) => paperIds.add(paperId))
  topic.memory.paperRelations?.forEach((relation) => paperIds.add(relation.paperId))
  topic.memory.stageLedger?.forEach((stage) => {
    paperIds.add(stage.anchorPaperId)
    stage.candidatePaperIds.forEach((paperId) => paperIds.add(paperId))
    if (stage.selectedPaperId) {
      paperIds.add(stage.selectedPaperId)
    }
    stage.mergeEvents.forEach((event) => {
      paperIds.add(event.paperId)
    })
  })

  topic.stages.forEach((stage) => {
    if (stage.parentPaper) {
      paperIds.add(stage.parentPaper.id)
    }
    stage.directCandidates.forEach((candidate) => paperIds.add(candidate.candidate.paperId))
    stage.transferCandidates.forEach((candidate) => paperIds.add(candidate.candidate.paperId))
  })

  return Array.from(paperIds)
    .map((id) => paperMap[id])
    .filter((paper): paper is TrackerPaper => Boolean(paper))
    .sort((left, right) => comparePaperDates(left.published, right.published))
}

function comparePaperDates(left: string, right: string) {
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  const normalizedLeft = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime
  const normalizedRight = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime
  return normalizedLeft - normalizedRight
}

function extractDateKey(dateStr: string) {
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : dateStr.slice(0, 10)
}

function parseDateKey(dateKey: string) {
  const parts = dateKey.split('-')
  return {
    year: parts[0] || '----',
    month: parts[1] || '--',
    day: parts[2] || '--',
  }
}

export function useTimelineData(topic: TrackerTopic): TimelineGroup[] {
  return useMemo(() => {
    const papers = getTopicPapers(topic)
    const groupMap = new Map<string, { papers: TrackerPaper[]; problems: ProblemTrace[] }>()

    papers.forEach((paper) => {
      const dateKey = extractDateKey(paper.published)
      const entry = groupMap.get(dateKey) ?? { papers: [], problems: [] }
      entry.papers.push(paper)
      if (paper.problemsOut.length > 0) {
        entry.problems.push(...paper.problemsOut)
      }
      groupMap.set(dateKey, entry)
    })

    const groups: TimelineGroup[] = Array.from(groupMap.entries()).map(([dateKey, data]) => {
      const parsed = parseDateKey(dateKey)
      return {
        dateLabel: `${parsed.year}.${parsed.month}.${parsed.day}`,
        dateRaw: dateKey,
        year: parsed.year,
        monthDay: `${parsed.month}.${parsed.day}`,
        papers: data.papers,
        problems: data.problems,
      }
    })

    return groups.sort((left, right) => left.dateRaw.localeCompare(right.dateRaw))
  }, [topic])
}
