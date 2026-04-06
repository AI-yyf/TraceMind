export const DEFAULT_STAGE_WINDOW_MONTHS = 1
export const MIN_STAGE_WINDOW_MONTHS = 1
export const MAX_STAGE_WINDOW_MONTHS = 24
export const STAGE_WINDOW_PRESETS = [1, 3, 6, 12, 24]

export function normalizeStageWindowMonths(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_STAGE_WINDOW_MONTHS
  }

  return Math.min(
    MAX_STAGE_WINDOW_MONTHS,
    Math.max(MIN_STAGE_WINDOW_MONTHS, Math.trunc(value)),
  )
}

export function withStageWindowRoute(route: string, stageWindowMonths: number) {
  const [pathname, search = ''] = route.split('?')
  const params = new URLSearchParams(search)
  params.set('stageMonths', String(stageWindowMonths))
  const next = params.toString()
  return next ? `${pathname}?${next}` : pathname
}

export function readStageWindowSearchParam(searchParams: URLSearchParams) {
  const raw = searchParams.get('stageMonths')
  if (!raw?.trim()) return undefined

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return undefined

  return normalizeStageWindowMonths(parsed)
}

export function withOptionalStageWindowQuery(
  route: string,
  stageWindowMonths?: number | null,
) {
  if (typeof stageWindowMonths !== 'number' || !Number.isFinite(stageWindowMonths)) {
    return route
  }

  return withStageWindowRoute(route, normalizeStageWindowMonths(stageWindowMonths))
}

export function resolveStageWindowPresets(
  currentValue: number,
  extras: number[] = [],
) {
  return Array.from(
    new Set([...STAGE_WINDOW_PRESETS, ...extras, normalizeStageWindowMonths(currentValue)]),
  ).sort((left, right) => left - right)
}
