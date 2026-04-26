/**
 * Stage window configuration - using DAYS as the canonical unit
 * Aligns with .env configuration: STAGE_DURATION_DAYS_MIN=7, MAX=365, DEFAULT=30
 * User requirement: 1 week (7 days) to 1 year (365 days), default 1 month (30 days)
 */
export const DEFAULT_STAGE_WINDOW_DAYS = 30
export const MIN_STAGE_WINDOW_DAYS = 7
export const MAX_STAGE_WINDOW_DAYS = 365

// Conversion constants for backward compatibility
export const DAYS_TO_MONTHS_APPROX = 30.44 // Average days per month (365.25 / 12)
export const WEEKS_TO_DAYS = 7

/**
 * Convert weeks to days
 */
export function weeksToDays(weeks: number): number {
  return weeks * WEEKS_TO_DAYS
}

/**
 * Convert days to weeks (rounded)
 */
export function daysToWeeks(days: number): number {
  return Math.round(days / WEEKS_TO_DAYS)
}

/**
 * Convert days to approximate months (for display purposes)
 */
export function daysToMonths(days: number): number {
  return days / DAYS_TO_MONTHS_APPROX
}

/**
 * Convert months to days (for input conversion)
 */
export function monthsToDays(months: number): number {
  return Math.round(months * DAYS_TO_MONTHS_APPROX)
}

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
  /** Stage window size in days */
  windowDays: number
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

/**
 * Get the start of the UTC day (midnight)
 */
function startOfUtcDay(value: DateLike) {
  const parsed = parseDate(value)
  if (!parsed) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

/**
 * Add days to a UTC date
 */
function addUtcDays(value: Date, days: number) {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/**
 * Calculate difference in days between two UTC dates
 */
function differenceInUtcDays(left: Date, right: Date) {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((left.getTime() - right.getTime()) / msPerDay)
}

/**
 * @deprecated Use startOfUtcDay instead
 */
function startOfUtcMonth(value: DateLike) {
  const parsed = parseDate(value)
  if (!parsed) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1))
}

/**
 * @deprecated Use addUtcDays instead
 */
function addUtcMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1))
}

/**
 * @deprecated Use differenceInUtcDays instead
 */
function differenceInUtcMonths(left: Date, right: Date) {
  return (
    (left.getUTCFullYear() - right.getUTCFullYear()) * 12 +
    (left.getUTCMonth() - right.getUTCMonth())
  )
}

/**
 * Format date as YYYY.MM for stable monthly stage labels.
 */
function formatUtcYearMonth(value: Date) {
  const yyyy = String(value.getUTCFullYear())
  const mm = String(value.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}.${mm}`
}

/**
 * Format date as YYYY.MM.DD for short-range buckets.
 */
function formatUtcYearMonthDay(value: Date) {
  const yyyy = String(value.getUTCFullYear())
  const mm = String(value.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(value.getUTCDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

function formatUtcYear(value: Date) {
  return String(value.getUTCFullYear())
}

/**
 * Format month only (MM) for range end
 */
function formatUtcMonth(value: Date) {
  return String(value.getUTCMonth() + 1).padStart(2, '0')
}

/**
 * Generate a unique key for a bucket based on its start date
 * Uses full date (YYYY-MM-DD) for day-based buckets
 */
function assignmentKey(start: Date) {
  return `${start.getUTCFullYear()}-${`${start.getUTCMonth() + 1}`.padStart(2, '0')}-${`${start.getUTCDate()}`.padStart(2, '0')}`
}

function formatTemporalStageLabel(start: Date, windowDays: number) {
  const bucketStart =
    startOfUtcDay(start) ??
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
  const bucketEnd = addUtcDays(bucketStart, Math.max(1, windowDays) - 1)

  // For short windows (<= 7 days), show a compact dotted day range.
  if (windowDays <= 7) {
    if (bucketStart.getUTCDate() === bucketEnd.getUTCDate()) {
      return formatUtcYearMonthDay(bucketStart)
    }
    if (
      bucketStart.getUTCMonth() === bucketEnd.getUTCMonth() &&
      bucketStart.getUTCFullYear() === bucketEnd.getUTCFullYear()
    ) {
      return `${formatUtcYearMonthDay(bucketStart)}-${String(bucketEnd.getUTCDate()).padStart(2, '0')}`
    }
    if (bucketStart.getUTCFullYear() === bucketEnd.getUTCFullYear()) {
      return `${formatUtcYearMonthDay(bucketStart)}-${formatUtcMonth(bucketEnd)}.${String(bucketEnd.getUTCDate()).padStart(2, '0')}`
    }
    return `${formatUtcYearMonthDay(bucketStart)}-${formatUtcYearMonthDay(bucketEnd)}`
  }

  // For medium windows (<= 31 days), keep a stable monthly label.
  if (windowDays <= 31) {
    if (bucketStart.getUTCMonth() === bucketEnd.getUTCMonth() &&
        bucketStart.getUTCFullYear() === bucketEnd.getUTCFullYear()) {
      return formatUtcYearMonth(bucketStart)
    }
    return `${formatUtcYearMonth(bucketStart)}-${formatUtcYearMonth(bucketEnd)}`
  }

  // For longer windows, always render full start/end month labels.
  return `${formatUtcYearMonth(bucketStart)}-${formatUtcYearMonth(bucketEnd)}`
}

function formatCalendarStageLabel(start: Date, windowMonths: number) {
  const bucketStart = startOfUtcMonth(start) ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const bucketEndInclusive = addUtcMonths(bucketStart, Math.max(1, windowMonths) - 1)

  if (windowMonths <= 1) {
    return formatUtcYearMonth(bucketStart)
  }

  return `${formatUtcYearMonth(bucketStart)}-${formatUtcYearMonth(bucketEndInclusive)}`
}

function buildTemporalStageDescription(label: string, windowDays: number) {
  if (windowDays <= 7) {
    return `Collect the papers and nodes that entered the mainline in ${label} so the topic can be reread on a weekly timeline.`
  }
  if (windowDays <= 31) {
    return `Collect the papers and nodes that entered the mainline in ${label} so the topic can be reread on a monthly timeline.`
  }

  return `Collect the papers and nodes that entered the mainline during ${label} so the topic can be regrouped with a stable time bucket.`
}

function buildTemporalStageDescriptionEn(label: string, windowDays: number) {
  if (windowDays <= 7) {
    return `Collect the papers and nodes that entered the mainline in ${label} so the topic can be reread on a weekly time axis.`
  }
  if (windowDays <= 31) {
    return `Collect the papers and nodes that entered the mainline in ${label} so the topic can be reread on a monthly time axis.`
  }

  return `Collect the papers and nodes that entered the mainline during ${label} so the topic can be regrouped with an adjustable time bucket.`
}

function buildAssignment(
  start: Date,
  stageIndex: number,
  windowDays: number,
): TemporalStageAssignment {
  const bucketStart =
    startOfUtcDay(start) ??
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
  const bucketEndExclusive = addUtcDays(bucketStart, windowDays)
  const label = formatTemporalStageLabel(bucketStart, windowDays)

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

function buildCalendarAssignment(
  start: Date,
  stageIndex: number,
  windowMonths: number,
): TemporalStageAssignment {
  const bucketStart =
    startOfUtcMonth(start) ??
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const bucketEndExclusive = addUtcMonths(bucketStart, Math.max(1, windowMonths))
  const label = formatCalendarStageLabel(bucketStart, windowMonths)

  return {
    stageIndex,
    bucketKey: assignmentKey(bucketStart),
    label,
    labelEn: label,
    yearLabel: String(bucketStart.getUTCFullYear()),
    dateLabel: label,
    timeLabel: label,
    bucketStart,
    bucketEndExclusive,
  }
}

/**
 * Normalize stage window days to valid range [MIN_STAGE_WINDOW_DAYS, MAX_STAGE_WINDOW_DAYS]
 * Accepts days as input (consistent with .env STAGE_DURATION_DAYS_*)
 */
export function normalizeStageWindowDays(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_STAGE_WINDOW_DAYS
  }

  return Math.min(
    MAX_STAGE_WINDOW_DAYS,
    Math.max(MIN_STAGE_WINDOW_DAYS, Math.trunc(value)),
  )
}

/**
 * Normalize stage window months to valid range [MIN_STAGE_WINDOW_MONTHS, MAX_STAGE_WINDOW_MONTHS]
 * Returns months for backward compatibility with existing database entries and API contracts.
 * Use normalizeStageWindowDays() for new day-based logic.
 */
export function normalizeStageWindowMonths(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.ceil(daysToMonths(DEFAULT_STAGE_WINDOW_DAYS))
  }

  const minMonths = Math.ceil(daysToMonths(MIN_STAGE_WINDOW_DAYS)) // ~1 month
  const maxMonths = Math.floor(daysToMonths(MAX_STAGE_WINDOW_DAYS)) // ~12 months

  return Math.min(
    maxMonths,
    Math.max(minMonths, Math.trunc(value)),
  )
}

// Backward-compatible constants (in months, derived from days)
/** @deprecated Use DEFAULT_STAGE_WINDOW_DAYS instead */
export const DEFAULT_STAGE_WINDOW_MONTHS = Math.ceil(daysToMonths(DEFAULT_STAGE_WINDOW_DAYS))
/** @deprecated Use MIN_STAGE_WINDOW_DAYS instead */
export const MIN_STAGE_WINDOW_MONTHS = Math.ceil(daysToMonths(MIN_STAGE_WINDOW_DAYS))
/** @deprecated Use MAX_STAGE_WINDOW_DAYS instead */
export const MAX_STAGE_WINDOW_MONTHS = Math.floor(daysToMonths(MAX_STAGE_WINDOW_DAYS))

export function deriveTemporalStageBuckets(args: {
  papers: PaperLike[]
  nodes?: NodeLike[]
  /** Stage window size in days (7-365, default 30) */
  windowDays?: number | null
  /** @deprecated Use windowDays instead */
  windowMonths?: number | null
  fallbackDate?: DateLike
}): TemporalStageBucketResult {
  const hasWindowMonths = typeof args.windowMonths === 'number' && Number.isFinite(args.windowMonths)
  const normalizedWindowMonths = hasWindowMonths ? normalizeStageWindowMonths(args.windowMonths) : null
  const windowDays = args.windowDays
    ? normalizeStageWindowDays(args.windowDays)
    : normalizedWindowMonths
      ? normalizeStageWindowDays(monthsToDays(normalizedWindowMonths))
      : normalizeStageWindowDays(null)
  const useCalendarMonthBuckets = hasWindowMonths || windowDays >= 28
  const calendarWindowMonths =
    normalizedWindowMonths ??
    Math.max(1, Math.round(daysToMonths(windowDays)))

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
  const anchorDay =
    useCalendarMonthBuckets
      ? (
          startOfUtcMonth(earliestPaperDate) ??
          startOfUtcMonth(anchorDate) ??
          new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
        )
      : (
          startOfUtcDay(earliestPaperDate) ??
          startOfUtcDay(anchorDate) ??
          new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
        )
  const paperById = new Map(paperDates.map((paper) => [paper.id, paper.published]))
  const paperAssignmentsByBucket = new Map<string, string[]>()
  const nodeAssignmentsByBucket = new Map<string, string[]>()
  const paperAssignments = new Map<string, TemporalStageAssignment>()
  const nodeAssignments = new Map<string, TemporalStageAssignment>()

  const resolveBucketStart = (value: Date) => {
    if (useCalendarMonthBuckets) {
      const normalized = startOfUtcMonth(value) ?? anchorDay
      const monthOffset = differenceInUtcMonths(normalized, anchorDay)
      const bucketOffset = Math.max(0, Math.floor(monthOffset / calendarWindowMonths))
      return addUtcMonths(anchorDay, bucketOffset * calendarWindowMonths)
    }

    const normalized = startOfUtcDay(value) ?? anchorDay
    const dayOffset = differenceInUtcDays(normalized, anchorDay)
    const bucketOffset = Math.max(0, Math.floor(dayOffset / windowDays))
    return addUtcDays(anchorDay, bucketOffset * windowDays)
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
        ...(node.papers ?? []).map((entry) => entry.paperId),
      ]),
    )
      .map((paperId) => paperById.get(paperId) ?? paperBucketStarts.get(paperId) ?? null)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => +left - +right)

    const sourceDate =
      linkedPaperDates[0] ??
      parseDate(node.updatedAt) ??
      parseDate(node.createdAt) ??
      anchorDay
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
    return {
      windowDays,
      buckets: [],
      paperAssignments,
      nodeAssignments,
      fallbackAssignment: null,
    }
  }

  const assignmentByKey = new Map<string, TemporalStageAssignment>()
  const buckets = orderedBucketStarts.map((bucketStart, index) => {
    const assignment = useCalendarMonthBuckets
      ? buildCalendarAssignment(bucketStart, index + 1, calendarWindowMonths)
      : buildAssignment(bucketStart, index + 1, windowDays)
    assignmentByKey.set(assignment.bucketKey, assignment)
    return {
      ...assignment,
      description: buildTemporalStageDescription(assignment.label, windowDays),
      descriptionEn: buildTemporalStageDescriptionEn(assignment.labelEn, windowDays),
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
    windowDays,
    buckets,
    paperAssignments,
    nodeAssignments,
    fallbackAssignment: buckets[0] ?? null,
  }
}
