import { resolveLanguageLocale } from '@/i18n/locale'

export const DEFAULT_RESEARCH_DURATION_DAYS = 30
export const MIN_RESEARCH_DURATION_DAYS = 7
export const MAX_RESEARCH_DURATION_DAYS = 365
export const RESEARCH_DURATION_DAY_PRESETS = [7, 14, 30, 90, 180, 365] as const

type DurationLanguage = Parameters<typeof resolveLanguageLocale>[0]
type UnitDisplay = 'long' | 'short'

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function formatUnit(
  value: number,
  unit: Intl.NumberFormatOptions['unit'],
  language: DurationLanguage,
  unitDisplay: UnitDisplay,
) {
  return new Intl.NumberFormat(resolveLanguageLocale(language), {
    style: 'unit',
    unit,
    unitDisplay,
  }).format(value)
}

function normalizeDaysForDisplay(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_RESEARCH_DURATION_DAYS
  return Math.max(1, Math.round(value))
}

export function clampResearchDurationDays(value: number) {
  return clampInt(value, MIN_RESEARCH_DURATION_DAYS, MAX_RESEARCH_DURATION_DAYS)
}

export function durationDaysToHours(days: number) {
  return clampResearchDurationDays(days) * 24
}

export function durationHoursToResearchDays(hours: number) {
  if (!Number.isFinite(hours)) return DEFAULT_RESEARCH_DURATION_DAYS
  return clampResearchDurationDays(Math.ceil(hours / 24))
}

export function formatResearchDurationDays(
  days: number,
  language: DurationLanguage,
  unitDisplay: UnitDisplay = 'short',
) {
  const normalizedDays = normalizeDaysForDisplay(days)

  if (normalizedDays >= 365 && normalizedDays % 365 === 0) {
    return formatUnit(Math.max(1, Math.round(normalizedDays / 365)), 'year', language, unitDisplay)
  }

  if (normalizedDays >= 30 && normalizedDays % 30 === 0) {
    return formatUnit(Math.max(1, Math.round(normalizedDays / 30)), 'month', language, unitDisplay)
  }

  if (normalizedDays >= 7 && normalizedDays % 7 === 0) {
    return formatUnit(Math.max(1, Math.round(normalizedDays / 7)), 'week', language, unitDisplay)
  }

  return formatUnit(normalizedDays, 'day', language, unitDisplay)
}

export function formatResearchDurationHours(
  hours: number,
  language: DurationLanguage,
  unitDisplay: UnitDisplay = 'short',
) {
  if (!Number.isFinite(hours)) {
    return formatResearchDurationDays(DEFAULT_RESEARCH_DURATION_DAYS, language, unitDisplay)
  }

  return formatResearchDurationDays(Math.ceil(hours / 24), language, unitDisplay)
}
