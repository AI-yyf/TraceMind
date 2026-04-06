type StageChronology = {
  dateLabel?: string | null
  timeLabel?: string | null
  yearLabel?: string | null
}

type StageBadgeLabelInput = StageChronology & {
  title?: string | null
  fallbackLabel?: string | null
}

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

export function pickStageChronologyLabel(stage: StageChronology) {
  return [stage.dateLabel, stage.timeLabel, stage.yearLabel]
    .map((value) => value?.trim() ?? '')
    .find(Boolean) ?? ''
}

export function pickStageNarrativeTitle(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text || isMechanicalStageTitle(text)) return ''
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
