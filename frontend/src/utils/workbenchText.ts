const WORKBENCH_PROMPT_LEAK_PATTERNS = [
  /\bthe user wants\b/iu,
  /\bkey requirements?\b/iu,
  /\bstructure plan\b/iu,
  /\bsummary context\b/iu,
  /\breference paper\b/iu,
  /\brelated papers? to mention\b/iu,
  /\btone\s*:/iu,
  /\bcritical judgment\b/iu,
  /\bevidence awareness\b/iu,
  /\blet me (?:first|now)\b/iu,
  /\bi (?:will|should) (?:first|now|then)\b/iu,
]

const WORKBENCH_PROCESS_NOISE_PATTERNS = [
  /\bresearch run\b/iu,
  /\bcandidate papers?\b/iu,
  /\badmitted\b/iu,
  /\bdiscovered\b/iu,
  /\bgenerated\b/iu,
  /\bpaused\b/iu,
  /\bcompleted\b/iu,
  /\bdeadline\b/iu,
  /\bscheduler\b/iu,
]

const WORKBENCH_MOJIBAKE_PATTERNS = [
  /鐮旂┒/u,
  /褰撳墠/u,
  /鑺傜偣/u,
  /闂/u,
  /鎬荤粨/u,
  /涓栫晫/u,
  /銆\?/u,
  /锛\?/u,
]

const WORKBENCH_PLACEHOLDER_ONLY_RE = /^[?锛燂拷�\s._\-/:|()[\]{}<>]+$/u

export function normalizeWorkbenchText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function clipText(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

export function isWorkbenchNoiseText(value: string | null | undefined) {
  const normalized = normalizeWorkbenchText(value)
  if (!normalized) return true
  if (WORKBENCH_PLACEHOLDER_ONLY_RE.test(normalized)) return true
  if (WORKBENCH_PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  if (WORKBENCH_PROCESS_NOISE_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  if (WORKBENCH_MOJIBAKE_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  return false
}

export function hasMeaningfulWorkbenchText(value: string | null | undefined) {
  const normalized = normalizeWorkbenchText(value)
  if (!normalized) return false
  return !isWorkbenchNoiseText(normalized)
}

export function sanitizeWorkbenchText(
  value: string | null | undefined,
  maxLength = 220,
) {
  const normalized = normalizeWorkbenchText(value)
  if (!normalized || isWorkbenchNoiseText(normalized)) return ''
  return clipText(normalized, maxLength)
}

export function filterMeaningfulWorkbenchStrings(
  values: Array<string | null | undefined>,
  limit = 5,
  maxLength = 180,
) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const sanitized = sanitizeWorkbenchText(value, maxLength)
    if (!sanitized || seen.has(sanitized)) continue
    seen.add(sanitized)
    output.push(sanitized)
    if (output.length >= limit) break
  }

  return output
}
