export const DEFAULT_STAGE_WINDOW_MONTHS = 1
export const MIN_STAGE_WINDOW_MONTHS = 1
export const MAX_STAGE_WINDOW_MONTHS = 24

type DateLike = Date | string | null | undefined

type PaperLike = {
  id: string
  published: DateLike
}

type NodePaperLike = {
  paperId: string
}

type NodeLike = {
  id: string
  primaryPaperId?: string | null
  papers?: NodePaperLike[]
  updatedAt?: DateLike
  createdAt?: DateLike
}

export interface TemporalStageAssignment {
  stageIndex: number
  bucketKey: string
  label: string
  labelEn: string
  yearLabel: string
  dateLabel: string
  timeLabel: string
  bucketStart: Date
  bucketEndExclusive: Date
}

export interface TemporalStageBucket extends TemporalStageAssignment {
  description: string
  descriptionEn: string
  paperIds: string[]
  nodeIds: string[]
}

export interface TemporalStageBucketResult {
  windowMonths: number
  buckets: TemporalStageBucket[]
  paperAssignments: Map<string, TemporalStageAssignment>
  nodeAssignments: Map<string, TemporalStageAssignment>
  fallbackAssignment: TemporalStageAssignment | null
}

function parseDate(value: DateLike) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfUtcMonth(value: DateLike) {
  const parsed = parseDate(value)
  if (!parsed) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1))
}

function addUtcMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1))
}

function differenceInUtcMonths(left: Date, right: Date) {
  return (left.getUTCFullYear() - right.getUTCFullYear()) * 12 + (left.getUTCMonth() - right.getUTCMonth())
}

function formatUtcYearMonth(value: Date) {
  return `${value.getUTCFullYear()}.${`${value.getUTCMonth() + 1}`.padStart(2, '0')}`
}

function formatUtcYear(value: Date) {
  return `${value.getUTCFullYear()}`
}

function assignmentKey(start: Date) {
  return `${start.getUTCFullYear()}-${`${start.getUTCMonth() + 1}`.padStart(2, '0')}-01`
}

function formatTemporalStageLabel(start: Date, windowMonths: number) {
  const bucketStart = startOfUtcMonth(start) ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const bucketEnd = addUtcMonths(bucketStart, Math.max(1, windowMonths) - 1)

  if (windowMonths <= 1) {
    return formatUtcYearMonth(bucketStart)
  }

  return `${formatUtcYearMonth(bucketStart)}-${formatUtcYearMonth(bucketEnd)}`
}

function buildTemporalStageDescription(label: string, windowMonths: number) {
  if (windowMonths <= 1) {
    return `收拢 ${label} 进入主题主线的论文与节点，让主题页沿时间重新对齐。`
  }

  return `收拢 ${label} 这一时间窗进入主线的论文与节点，让阶段边界按可调时间窗稳定展开。`
}

function buildTemporalStageDescriptionEn(label: string, windowMonths: number) {
  if (windowMonths <= 1) {
    return `Collect the papers and nodes that entered the mainline in ${label} so the topic can be reread on a monthly time axis.`
  }

  return `Collect the papers and nodes that entered the mainline during ${label} so the topic can be regrouped with an adjustable time bucket.`
}

function buildAssignment(
  start: Date,
  stageIndex: number,
  windowMonths: number,
): TemporalStageAssignment {
  const bucketStart = startOfUtcMonth(start) ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const bucketEndExclusive = addUtcMonths(bucketStart, windowMonths)
  const label = formatTemporalStageLabel(bucketStart, windowMonths)

  return {
    stageIndex,
    bucketKey: assignmentKey(bucketStart),
    label,
    labelEn: label,
    yearLabel: formatUtcYear(bucketStart),
    dateLabel: label,
    timeLabel: label,
    bucketStart,
    bucketEndExclusive,
  }
}

export function normalizeStageWindowMonths(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_STAGE_WINDOW_MONTHS
  }

  return Math.min(
    MAX_STAGE_WINDOW_MONTHS,
    Math.max(MIN_STAGE_WINDOW_MONTHS, Math.trunc(value)),
  )
}

export function deriveTemporalStageBuckets(args: {
  papers: PaperLike[]
  nodes?: NodeLike[]
  windowMonths?: number | null
  fallbackDate?: DateLike
}): TemporalStageBucketResult {
  const windowMonths = normalizeStageWindowMonths(args.windowMonths)
  const paperDates = args.papers
    .map((paper) => ({
      id: paper.id,
      published: parseDate(paper.published),
    }))
    .filter((paper): paper is { id: string; published: Date } => Boolean(paper.published))
  const anchorDate = paperDates[0]?.published ?? parseDate(args.fallbackDate) ?? new Date()
  const earliestPaperDate =
    [...paperDates]
      .map((paper) => paper.published)
      .sort((left, right) => +left - +right)[0] ?? anchorDate
  const anchorMonth =
    startOfUtcMonth(earliestPaperDate) ??
    startOfUtcMonth(anchorDate) ??
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const paperById = new Map(paperDates.map((paper) => [paper.id, paper.published]))
  const paperAssignmentsByBucket = new Map<string, string[]>()
  const nodeAssignmentsByBucket = new Map<string, string[]>()
  const paperAssignments = new Map<string, TemporalStageAssignment>()
  const nodeAssignments = new Map<string, TemporalStageAssignment>()

  const resolveBucketStart = (value: Date) => {
    const normalized = startOfUtcMonth(value) ?? anchorMonth
    const monthOffset = differenceInUtcMonths(normalized, anchorMonth)
    const bucketOffset = Math.max(0, Math.floor(monthOffset / windowMonths))
    return addUtcMonths(anchorMonth, bucketOffset * windowMonths)
  }

  const paperBucketStarts = new Map<string, Date>()

  for (const paper of paperDates) {
    const bucketStart = resolveBucketStart(paper.published)
    paperBucketStarts.set(paper.id, bucketStart)
    const key = assignmentKey(bucketStart)
    const current = paperAssignmentsByBucket.get(key) ?? []
    current.push(paper.id)
    paperAssignmentsByBucket.set(key, current)
  }

  const nodeBucketStarts = new Map<string, Date>()

  for (const node of args.nodes ?? []) {
    const linkedPaperDates = Array.from(
      new Set([
        ...(node.primaryPaperId ? [node.primaryPaperId] : []),
        ...((node.papers ?? []).map((entry) => entry.paperId)),
      ]),
    )
      .map((paperId) => paperById.get(paperId) ?? paperBucketStarts.get(paperId) ?? null)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => +left - +right)

    const sourceDate =
      linkedPaperDates[0] ??
      parseDate(node.updatedAt) ??
      parseDate(node.createdAt) ??
      anchorMonth
    const bucketStart = resolveBucketStart(sourceDate)
    nodeBucketStarts.set(node.id, bucketStart)
    const key = assignmentKey(bucketStart)
    const current = nodeAssignmentsByBucket.get(key) ?? []
    current.push(node.id)
    nodeAssignmentsByBucket.set(key, current)
  }

  const orderedBucketStarts = Array.from(
    new Map(
      [...paperAssignmentsByBucket.keys(), ...nodeAssignmentsByBucket.keys()]
        .sort()
        .map((key) => [key, new Date(`${key}T00:00:00.000Z`)]),
    ).values(),
  ).sort((left, right) => +left - +right)

  if (orderedBucketStarts.length === 0) {
    const fallbackAssignment = buildAssignment(anchorMonth, 1, windowMonths)
    return {
      windowMonths,
      buckets: [
        {
          ...fallbackAssignment,
          description: buildTemporalStageDescription(fallbackAssignment.label, windowMonths),
          descriptionEn: buildTemporalStageDescriptionEn(
            fallbackAssignment.labelEn,
            windowMonths,
          ),
          paperIds: [],
          nodeIds: [],
        },
      ],
      paperAssignments,
      nodeAssignments,
      fallbackAssignment,
    }
  }

  const assignmentByKey = new Map<string, TemporalStageAssignment>()
  const buckets = orderedBucketStarts.map((bucketStart, index) => {
    const assignment = buildAssignment(bucketStart, index + 1, windowMonths)
    assignmentByKey.set(assignment.bucketKey, assignment)
    return {
      ...assignment,
      description: buildTemporalStageDescription(assignment.label, windowMonths),
      descriptionEn: buildTemporalStageDescriptionEn(assignment.labelEn, windowMonths),
      paperIds: paperAssignmentsByBucket.get(assignment.bucketKey) ?? [],
      nodeIds: nodeAssignmentsByBucket.get(assignment.bucketKey) ?? [],
    } satisfies TemporalStageBucket
  })

  for (const [paperId, bucketStart] of paperBucketStarts.entries()) {
    const assignment = assignmentByKey.get(assignmentKey(bucketStart))
    if (assignment) {
      paperAssignments.set(paperId, assignment)
    }
  }

  for (const [nodeId, bucketStart] of nodeBucketStarts.entries()) {
    const assignment = assignmentByKey.get(assignmentKey(bucketStart))
    if (assignment) {
      nodeAssignments.set(nodeId, assignment)
    }
  }

  return {
    windowMonths,
    buckets,
    paperAssignments,
    nodeAssignments,
    fallbackAssignment: buckets[0] ?? null,
  }
}
