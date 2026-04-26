type RealFormulaSource = {
  id: string
  number?: number | string | null
  latex?: string | null
  rawText?: string | null
  page?: number | null
}

type TableFormulaSource = {
  id: string
  number?: number | string | null
  caption?: string | null
  rawText?: string | null
  page?: number | null
}

type SectionFormulaSource = {
  id: string
  editorialTitle?: string | null
  sourceSectionTitle?: string | null
  paragraphs?: string | null
}

export type PaperFormulaArtifact = {
  id: string
  number: number | string | null
  latex: string | null
  rawText: string
  page: number | null
  synthetic: boolean
  sourceKind: 'formula' | 'table' | 'section'
  sourceId: string
}

type FormulaCarrierPaper = {
  formulas?: RealFormulaSource[] | null
  tables?: TableFormulaSource[] | null
  paper_sections?: SectionFormulaSource[] | null
}

const FORMULA_CACHE = new WeakMap<object, PaperFormulaArtifact[]>()
const FORMULA_ID_RE = /^synthetic-(table|section)-([A-Za-z0-9_-]+)-(\d+)$/u
const FORMULA_ASSIGNMENT_RE = /(?:<=|>=|!=|:=|->|=>|=)/u
const FUNCTION_CALL_RE = /\b([A-Za-z][A-Za-z0-9_]*)\([^)]{1,80}\)/u
const LATEX_SIGNAL_RE =
  /\\(?:frac|sum|prod|min|max|argmax|argmin|theta|lambda|sigma|alpha|beta|gamma|mathbb|mathbf|mathcal|left|right|log|exp)/u
const MATH_GLYPH_RE = /[θλσμβγαδωπκρτυφψω∥≤≥≈≠∈∑∏√∞⊤⊥ˆ∗−]/u
const KEYWORD_SIGNAL_RE =
  /\b(?:loss|objective|constraint|likelihood|maximize|minimize|regulari[sz]ation|argmax|argmin)\b/iu
const FORMULA_NOISE_RE =
  /\b(?:table|figure|results?|benchmark|appendix|copyright|personal use|navigation|acknowledg(?:e)?ments?|topic placement|node placement|currently grouped into|same stage|timeline|branch|merge|paper cards?|reviewer note)\b/iu

function normalizeFormulaText(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\r\n/gu, '\n')
    .replaceAll('\0', ' ')
    .replace(/\uFFFD/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function cleanCandidate(value: string) {
  return normalizeFormulaText(
    value
      .replace(/^[`"'“”‘’]+/u, '')
      .replace(/[.,;:]+$/u, ''),
  )
}

function hasAlphaNumericSignal(value: string) {
  const alphaCount = value.match(/[A-Za-z]/gu)?.length ?? 0
  const digitCount = value.match(/\d/gu)?.length ?? 0
  return alphaCount + digitCount >= 2
}

function hasMeaningfulFunctionSignal(value: string) {
  const match = FUNCTION_CALL_RE.exec(value)
  if (!match) return false

  const functionName = match[1] ?? ''
  if (functionName.length <= 2) return true
  if (/^[A-Z][A-Za-z0-9_]*$/u.test(functionName)) return true
  if (/\b(?:softmax|sigmoid|tanh|relu|exp|log|min|max|argmax|argmin)\b/iu.test(functionName)) {
    return true
  }

  return false
}

function hasExplicitMathStructure(value: string) {
  return FORMULA_ASSIGNMENT_RE.test(value) || LATEX_SIGNAL_RE.test(value) || MATH_GLYPH_RE.test(value)
}

function hasFormulaSignals(value: string) {
  const normalized = cleanCandidate(value)
  if (normalized.length < 5 || normalized.length > 180) return false
  if (FORMULA_NOISE_RE.test(normalized)) return false

  const hasAssignment = FORMULA_ASSIGNMENT_RE.test(normalized)
  const hasLatex = LATEX_SIGNAL_RE.test(normalized)
  const hasMathGlyph = MATH_GLYPH_RE.test(normalized)
  const hasKeyword = KEYWORD_SIGNAL_RE.test(normalized)
  const hasFunctionSignal = hasMeaningfulFunctionSignal(normalized)
  const hasStructure =
    hasAssignment ||
    hasLatex ||
    hasMathGlyph ||
    (hasFunctionSignal && (hasAssignment || hasLatex || hasMathGlyph || hasKeyword))
  const isolatedSymbolTokenCount = normalized.match(/\b[A-Za-z]\b/gu)?.length ?? 0

  if (!hasStructure) return false
  if (!hasAlphaNumericSignal(normalized) && !hasMathGlyph) return false
  if (isolatedSymbolTokenCount >= 4 && !hasLatex && !hasMathGlyph && !hasFunctionSignal) return false

  const wordCount = normalized.split(/\s+/u).filter(Boolean).length
  const naturalWordCount = normalized.match(/\b[A-Za-z]{3,}\b/gu)?.length ?? 0
  if (wordCount > 16 && !hasExplicitMathStructure(normalized)) return false
  if (naturalWordCount > 10 && !hasExplicitMathStructure(normalized)) return false

  return true
}

function scoreFormulaCandidate(value: string) {
  const normalized = cleanCandidate(value)
  let score = 0

  if (LATEX_SIGNAL_RE.test(normalized)) score += 6
  if (MATH_GLYPH_RE.test(normalized)) score += 5
  if (hasMeaningfulFunctionSignal(normalized)) score += 3
  if (/(?:<=|>=|:=|->|=>)/u.test(normalized)) score += 4
  if (/=/u.test(normalized)) score += 3
  if (KEYWORD_SIGNAL_RE.test(normalized)) score += 2
  if ((normalized.match(/[A-Za-z]/gu)?.length ?? 0) >= 3) score += 2
  if ((normalized.match(/\d/gu)?.length ?? 0) >= 1) score += 1
  if (FORMULA_NOISE_RE.test(normalized)) score -= 4
  if ((normalized.match(/\b[A-Za-z]\b/gu)?.length ?? 0) >= 4) score -= 4
  if ((normalized.match(/\b[A-Za-z]{3,}\b/gu)?.length ?? 0) > 8) score -= 4
  if (normalized.split(/\s+/u).length > 14) score -= 2

  return score
}

function collectCandidateWindows(text: string) {
  const lines = text
    .replace(/\r\n/gu, '\n')
    .split(/\n+/u)
    .map((line) => cleanCandidate(line))
    .filter(Boolean)
  const windows: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line) windows.push(line)

    const next = lines[index + 1]
    if (
      line &&
      next &&
      line.length <= 96 &&
      next.length <= 96 &&
      !hasExplicitMathStructure(line) &&
      !hasExplicitMathStructure(next)
    ) {
      windows.push(cleanCandidate(`${line} ${next}`))
    }
  }

  return windows
}

function extractFormulaCandidates(text: string, limit = 2) {
  const normalized = normalizeFormulaText(text)
  if (!normalized) return []

  const windows = collectCandidateWindows(text)
  const regexMatches: string[] = []
  const patterns = [
    /\\(?:frac|sum|prod|min|max|argmax|argmin|theta|lambda|sigma|alpha|beta|gamma|mathbb|mathbf|mathcal|left|right|log|exp)[^.;]{0,120}/gu,
    /\b[A-Za-z][A-Za-z0-9_]*(?:\([^)]{1,80}\))\s*(?:<=|>=|:=|->|=>|=)\s*[^.;]{1,120}/gu,
    /\b[A-Za-z][A-Za-z0-9_]*(?:_[A-Za-z0-9]+)?\s*(?:<=|>=|:=|->|=>|=)\s*[^.;]{1,120}/gu,
  ]

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      regexMatches.push(cleanCandidate(match[0]))
    }
  }

  const ranked = Array.from(new Set([...regexMatches, ...windows].filter(Boolean)))
    .filter(hasFormulaSignals)
    .map((candidate) => ({ candidate, score: scoreFormulaCandidate(candidate) }))
    .filter((entry) => entry.score >= 6)
    .sort((left, right) => right.score - left.score || left.candidate.length - right.candidate.length)

  return ranked.slice(0, limit).map((entry) => entry.candidate)
}

function collectRealFormulaArtifacts(paper: FormulaCarrierPaper) {
  const artifacts: PaperFormulaArtifact[] = []

  for (const formula of paper.formulas ?? []) {
    const latex = cleanCandidate(formula.latex ?? '')
    const rawText = cleanCandidate(formula.rawText ?? '')
    const fallbackText = cleanCandidate(`Formula ${formula.number ?? formula.id}`)
    const primary = latex || rawText || fallbackText

    artifacts.push({
      id: formula.id,
      number: formula.number ?? null,
      latex: hasFormulaSignals(latex) ? latex : null,
      rawText: rawText || primary,
      page: formula.page ?? null,
      synthetic: false,
      sourceKind: 'formula',
      sourceId: formula.id,
    })
  }

  return artifacts
}

function buildSyntheticFormulaId(sourceKind: 'table' | 'section', sourceId: string, ordinal: number) {
  return `synthetic-${sourceKind}-${sourceId}-${ordinal}`
}

function collectSyntheticTableFormulaArtifacts(paper: FormulaCarrierPaper) {
  const artifacts: PaperFormulaArtifact[] = []

  for (const table of paper.tables ?? []) {
    const candidates = extractFormulaCandidates(
      [table.caption ?? '', table.rawText ?? ''].filter(Boolean).join('\n'),
      2,
    )

    candidates.forEach((candidate, index) => {
      artifacts.push({
        id: buildSyntheticFormulaId('table', table.id, index + 1),
        number: `T${table.number ?? index + 1}`,
        latex: candidate,
        rawText: candidate,
        page: table.page ?? null,
        synthetic: true,
        sourceKind: 'table',
        sourceId: table.id,
      })
    })
  }

  return artifacts
}

function collectSyntheticSectionFormulaArtifacts(paper: FormulaCarrierPaper) {
  const artifacts: PaperFormulaArtifact[] = []

  for (const section of paper.paper_sections ?? []) {
    const candidates = extractFormulaCandidates(
      [section.editorialTitle ?? '', section.sourceSectionTitle ?? '', section.paragraphs ?? ''].join('\n'),
      1,
    ).filter((candidate) => hasExplicitMathStructure(candidate))

    candidates.forEach((candidate, index) => {
      artifacts.push({
        id: buildSyntheticFormulaId('section', section.id, index + 1),
        number: `S${index + 1}`,
        latex: candidate,
        rawText: candidate,
        page: null,
        synthetic: true,
        sourceKind: 'section',
        sourceId: section.id,
      })
    })
  }

  return artifacts
}

export function collectPaperFormulaArtifacts(paper: FormulaCarrierPaper) {
  if (paper && typeof paper === 'object') {
    const cached = FORMULA_CACHE.get(paper as object)
    if (cached) return cached
  }

  const realArtifacts = collectRealFormulaArtifacts(paper)
  const artifacts =
    realArtifacts.length > 0
      ? realArtifacts
      : [...collectSyntheticTableFormulaArtifacts(paper), ...collectSyntheticSectionFormulaArtifacts(paper)].slice(
          0,
          6,
        )

  if (paper && typeof paper === 'object') {
    FORMULA_CACHE.set(paper as object, artifacts)
  }

  return artifacts
}

export function countPaperFormulaArtifacts(paper: FormulaCarrierPaper) {
  return collectPaperFormulaArtifacts(paper).length
}

export function findPaperFormulaArtifactById(paper: FormulaCarrierPaper, artifactId: string) {
  return collectPaperFormulaArtifacts(paper).find((artifact) => artifact.id === artifactId) ?? null
}

export function parseSyntheticFormulaId(artifactId: string) {
  const match = FORMULA_ID_RE.exec(artifactId)
  if (!match) return null

  return {
    sourceKind: match[1] as 'table' | 'section',
    sourceId: match[2],
    ordinal: Number.parseInt(match[3], 10),
  }
}
