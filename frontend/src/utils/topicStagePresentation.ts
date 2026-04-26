type StageChronology = {
  dateLabel?: string | null
  timeLabel?: string | null
  yearLabel?: string | null
}

type StageBadgeLabelInput = StageChronology & {
  title?: string | null
  fallbackLabel?: string | null
}

const STAGE_DATE_RANGE_RE = /^(?:\d{4}\.\d{2})(?:\s*[-–]\s*\d{4}\.\d{2})?$/u

const MECHANICAL_STAGE_PATTERNS = [
  /^\s*stage\s*[-:]?\s*(?:\d+|[ivx]+)\s*$/iu,
  /^\s*(?:etapa|etape|étape|stufe|этап)\s*[-:]?\s*(?:\d+|[ivx]+)\s*$/iu,
  /^\s*阶段\s*[-:]?\s*(?:\d+|[ivx]+)\s*$/u,
  /^\s*第\s*\d+\s*阶段\s*$/u,
  /^\s*(?:ステージ|段階|단계)\s*[-:]?\s*(?:\d+|[ivx]+)\s*$/u,
]

export function isMechanicalStageTitle(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return true

  return MECHANICAL_STAGE_PATTERNS.some((pattern) => pattern.test(text))
}

export function looksLikeStageDateRange(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return false
  return STAGE_DATE_RANGE_RE.test(text)
}

export function pickStageChronologyLabel(stage: StageChronology) {
  return [stage.dateLabel, stage.timeLabel, stage.yearLabel]
    .map((value) => value?.trim() ?? '')
    .find(Boolean) ?? ''
}

export function pickStageNarrativeTitle(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text || isMechanicalStageTitle(text) || looksLikeStageDateRange(text)) return ''
  return text
}

export function pickStageBadgeLabel({
  title,
  fallbackLabel,
  ...chronology
}: StageBadgeLabelInput) {
  const chronologyLabel = pickStageChronologyLabel(chronology)
  if (chronologyLabel) return chronologyLabel

  const narrativeTitle = pickStageNarrativeTitle(title)
  if (narrativeTitle) return narrativeTitle

  return fallbackLabel?.trim() ?? ''
}

/**
 * Format stage time label based on date range span
 * Supports formats: "23/01", "23/01-03", "23/01/15-03/20" (slash-separated per user spec)
 */
export function formatStageTimeLabel(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  options?: {
    format?: 'year' | 'year-month' | 'month' | 'month-range' | 'date-range'
    separator?: string
    yearPrefix?: boolean
  }
): { label: string; format: 'year' | 'year-month' | 'month' | 'month-range' | 'date-range' } {
  const opts = {
    separator: '-',
    yearPrefix: true,
    ...options,
  }

  const parseDate = (d: Date | string | null | undefined): Date | null => {
    if (!d) return null
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d
    const parsed = new Date(d)
    return isNaN(parsed.getTime()) ? null : parsed
  }

  const start = parseDate(startDate)
  const end = parseDate(endDate)

  if (!start && !end) {
    return { label: '', format: 'month' }
  }

  // Format using slash separator: YY/MM or YY/MM/DD
  const formatDate = (date: Date, format: 'year' | 'month' | 'day'): string => {
    const year = String(date.getFullYear() % 100).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    switch (format) {
      case 'year':
        return year
      case 'month':
        return opts.yearPrefix ? `${year}/${month}` : month
      case 'day':
        return opts.yearPrefix ? `${year}/${month}/${day}` : `${month}/${day}`
      default:
        return ''
    }
  }

  // Determine format based on date span
  let detectedFormat = opts.format

  if (!detectedFormat && start && end) {
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())

    if (daysDiff <= 31 && start.getMonth() === end.getMonth()) {
      detectedFormat = 'date-range'
    } else if (monthsDiff <= 3 && start.getFullYear() === end.getFullYear()) {
      detectedFormat = 'month-range'
    } else if (start.getFullYear() !== end.getFullYear()) {
      detectedFormat = 'year-month'
    } else {
      detectedFormat = 'month'
    }
  } else if (!detectedFormat) {
    detectedFormat = 'month'
  }

  // Generate label based on format
  let label = ''

  switch (detectedFormat) {
    case 'year':
      label = start ? formatDate(start, 'year') : formatDate(end!, 'year')
      break
    case 'year-month':
      if (start && end) {
        const startLabel = formatDate(start, 'month')
        const endLabel = formatDate(end, 'month')
        label = startLabel === endLabel ? startLabel : `${startLabel}${opts.separator}${endLabel}`
      } else {
        label = start ? formatDate(start, 'month') : formatDate(end!, 'month')
      }
      break
    case 'month':
      label = start ? formatDate(start, 'month') : formatDate(end!, 'month')
      break
    case 'month-range':
      if (start && end) {
        const startMonth = String(start.getMonth() + 1).padStart(2, '0')
        const endMonth = String(end.getMonth() + 1).padStart(2, '0')
        const year = formatDate(start, 'year')
        label = `${year}/${startMonth}${opts.separator}${endMonth}`
      } else {
        label = start ? formatDate(start, 'month') : formatDate(end!, 'month')
      }
      break
    case 'date-range':
      if (start && end) {
        const startLabel = formatDate(start, 'day')
        const endLabel = formatDate(end, 'day')
        // End label: if same year, omit year prefix -> MM/DD
        const endParts = endLabel.split('/')
        const sameYear = start.getFullYear() === end.getFullYear()
        const endDisplay = sameYear ? endParts.slice(1).join('/') : endLabel
        label = `${startLabel}${opts.separator}${endDisplay}`
      } else {
        label = start ? formatDate(start, 'day') : formatDate(end!, 'day')
      }
      break
  }

  return { label, format: detectedFormat }
}

/**
 * Infer the appropriate time label format from stage metadata
 */
export function inferStageTimeLabelFormat(stages: Array<{ startDate?: string; endDate?: string }>): 'year' | 'year-month' | 'month' | 'month-range' | 'date-range' {
  if (!stages || stages.length === 0) return 'month'

  let hasDateRange = false
  let hasMonthRange = false
  let hasYearSpan = false

  for (const stage of stages) {
    if (!stage.startDate || !stage.endDate) continue

    const start = new Date(stage.startDate)
    const end = new Date(stage.endDate)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue

    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())

    if (daysDiff <= 31 && start.getMonth() === end.getMonth()) {
      hasDateRange = true
    } else if (monthsDiff <= 3) {
      hasMonthRange = true
    } else if (start.getFullYear() !== end.getFullYear()) {
      hasYearSpan = true
    }
  }

  if (hasDateRange) return 'date-range'
  if (hasMonthRange) return 'month-range'
  if (hasYearSpan) return 'year-month'
  return 'month'
}
