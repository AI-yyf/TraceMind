const PLACEHOLDER_ONLY_RE = /^[?？�\s._\-/:|()[\]{}<>]+$/u

export function hasMeaningfulDisplayText(value: string | null | undefined) {
  if (typeof value !== 'string') return false

  const trimmed = value.trim()
  if (!trimmed) return false
  if (PLACEHOLDER_ONLY_RE.test(trimmed)) return false

  const compact = trimmed.replace(/\s+/gu, '')
  if (!compact) return false

  const placeholderCount = Array.from(compact).reduce(
    (count, character) => (
      character === '?' || character === '？' || character === '�'
        ? count + 1
        : count
    ),
    0,
  )

  return placeholderCount / compact.length < 0.3
}

export function pickMeaningfulDisplayText(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    if (hasMeaningfulDisplayText(candidate)) {
      return candidate!.trim()
    }
  }

  const fallback = candidates.find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
  )
  return fallback?.trim() ?? ''
}
