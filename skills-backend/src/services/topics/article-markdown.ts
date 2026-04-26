import type { NodeArticleFlowBlock } from './deep-article-generator'

type SupportedLanguage = 'zh' | 'en'

type MarkdownEvidence = {
  anchorId: string
  type: 'section' | 'figure' | 'table' | 'formula' | 'figureGroup'
  route: string
  title: string
  label: string
  quote: string
  content: string
  page: number | null
  sourcePaperId?: string
  sourcePaperTitle?: string
  imagePath?: string | null
  thumbnailPath?: string | null
  whyItMatters?: string
  formulaLatex?: string | null
  tableHeaders?: string[]
  tableRows?: unknown[]
}

type MarkdownPaperRole = {
  paperId: string
  title: string
  route: string
  contribution: string
  summary?: string
  publishedAt?: string
  citationCount?: number | null
  originalUrl?: string
  pdfUrl?: string
}

type MarkdownArticleSection = {
  title: string
  body: string[]
  paperId?: string
  paperTitle?: string
}

type MarkdownCritique = {
  summary: string
  bullets: string[]
}

type MarkdownClosing = {
  title: string
  paragraphs: string[]
  reviewerNote?: string
}

type TopicStageDigest = {
  stageIndex: number
  title: string
  summary: string
  stageThesis?: string
}

type TopicNodeDigest = {
  title: string
  route: string
  summary: string
}

type TopicArticleMarkdownInput = {
  language?: string | null
  standfirst: string
  thesis: string
  narrativeSegments: string[]
  stages: TopicStageDigest[]
  nodes: TopicNodeDigest[]
  evidence: MarkdownEvidence[]
  closing: MarkdownClosing
}

type NodeArticleMarkdownInput = {
  language?: string | null
  standfirst: string
  summary: string
  explanation: string
  paperRoles: MarkdownPaperRole[]
  articleSections: MarkdownArticleSection[]
  closing: string[]
  critique: MarkdownCritique
  evidence: MarkdownEvidence[]
  evidenceAudit?: {
    status: 'complete' | 'needs_vlm_audit'
    warnings: Array<{ code: string; message: string; severity: 'warning' | 'critical' }>
    requiredAction: string | null
  }
  coreJudgment?: {
    content: string
    contentEn?: string
  } | null
  enhancedArticleFlow?: NodeArticleFlowBlock[]
}

type EnhancedPaperDigest = {
  paperId: string
  title: string
  lines: string[]
}

const COPY = {
  zh: {
    currentJudgment: '\u5f53\u524d\u5224\u65ad',
    stageLine: '\u7814\u7a76\u4e3b\u7ebf\u5982\u4f55\u5c55\u5f00',
    keyNodes: '\u503c\u5f97\u7ee7\u7eed\u9605\u8bfb\u7684\u8282\u70b9',
    evidence: '\u5173\u952e\u8bc1\u636e',
    unresolved: '\u4ecd\u5f85\u89e3\u51b3\u7684\u95ee\u9898',
    imageFallback: '\u56fe\u50cf\u672a\u80fd\u5b8c\u6574\u63d0\u53d6\uff0c\u5148\u4fdd\u7559\u56fe\u6ce8\u4e0e\u89e3\u91ca\u3002',
    tableFallback: '\u8868\u683c\u7ed3\u6784\u672a\u5b8c\u6574\u6062\u590d\uff0c\u5148\u4fdd\u7559\u6587\u5b57\u89e3\u8bfb\u3002',
    formulaFallback: '\u516c\u5f0f\u672a\u80fd\u5b8c\u6574\u6807\u51c6\u5316\uff0c\u5148\u4fdd\u7559\u539f\u59cb\u8868\u8fbe\u4e0e\u89e3\u91ca\u3002',
    readPaper: '\u9605\u8bfb\u8bba\u6587',
    source: '\u539f\u59cb\u6765\u6e90',
    pdf: 'PDF',
    stagePrefix: '\u9636\u6bb5',
    citations: '\u5f15\u7528',
    paperEvidence: '\u8bba\u6587\u8bc1\u636e',
    crossPaper: '\u8de8\u8bba\u6587\u5bf9\u8bfb',
    evidenceAudit: '\u8bc1\u636e\u5b8c\u6574\u6027\u95e8\u7981',
    evidenceAuditAction: '\u5fc5\u8981\u52a8\u4f5c',
  },
  en: {
    currentJudgment: 'Current judgment',
    stageLine: 'How the research line unfolds',
    keyNodes: 'Nodes worth reading next',
    evidence: 'Key evidence',
    unresolved: 'What remains unresolved',
    imageFallback: 'Image extraction did not survive, so only the caption and interpretation are kept.',
    tableFallback: 'The table structure could not be recovered cleanly, so the textual reading is kept instead.',
    formulaFallback: 'The formula could not be normalized cleanly, so the raw expression and explanation are kept instead.',
    readPaper: 'Read paper',
    source: 'Source',
    pdf: 'PDF',
    stagePrefix: 'Stage',
    citations: 'citations',
    paperEvidence: 'Paper evidence',
    crossPaper: 'Cross-paper reading',
    evidenceAudit: 'Evidence completeness gate',
    evidenceAuditAction: 'Required action',
  },
} as const

function pickLanguage(language?: string | null): SupportedLanguage {
  const normalized = (language ?? '').trim().toLowerCase()
  return normalized.startsWith('en') ? 'en' : 'zh'
}

function normalizeText(value?: string | null) {
  return (value ?? '')
    .replace(/\r\n/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function normalizeKey(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[`*_#[\]()]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function dedupeStrings(values: Array<string | null | undefined>, limit = Number.MAX_SAFE_INTEGER) {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized) continue

    const key = normalizeKey(normalized)
    if (!key || seen.has(key)) continue

    seen.add(key)
    result.push(normalized)

    if (result.length >= limit) break
  }

  return result
}

function clipText(value: string, maxLength = 280) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`
}

function ensureSentence(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (/[.!?。！？]$/u.test(normalized)) return normalized
  return `${normalized}.`
}

function markdownLink(label: string, href?: string | null) {
  const normalizedLabel = normalizeText(label)
  const normalizedHref = normalizeText(href)
  if (!normalizedLabel) return ''
  if (!normalizedHref) return normalizedLabel
  return `[${normalizedLabel}](${normalizedHref})`
}

function escapeTableCell(value: unknown) {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : value == null
          ? ''
          : JSON.stringify(value)
  return normalizeText(text).replace(/\|/gu, '\\|')
}

function toMarkdownTable(headers?: string[], rows?: unknown[]) {
  if (!Array.isArray(headers) || headers.length === 0) return ''
  if (!Array.isArray(rows) || rows.length === 0) return ''

  const normalizedHeaders = headers.map((header) => escapeTableCell(header || 'Column'))
  const renderedRows = rows
    .map((row) => {
      if (Array.isArray(row)) {
        return row.map((cell) => escapeTableCell(cell))
      }

      if (row && typeof row === 'object') {
        const record = row as Record<string, unknown>
        return headers.map((header) => escapeTableCell(record[header]))
      }

      return [escapeTableCell(row)]
    })
    .filter((row) => row.length > 0)

  if (renderedRows.length === 0) return ''

  const width = Math.max(
    normalizedHeaders.length,
    ...renderedRows.map((row) => row.length),
  )
  const headerLine = `| ${Array.from({ length: width }, (_, index) => normalizedHeaders[index] ?? `Column ${index + 1}`).join(' | ')} |`
  const dividerLine = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
  const rowLines = renderedRows.map(
    (row) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`,
  )

  return [headerLine, dividerLine, ...rowLines].join('\n')
}

function formatYear(value?: string | null) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.valueOf())) return ''
  return String(parsed.getUTCFullYear())
}

function pickEvidenceByPriority(evidence: MarkdownEvidence[]) {
  const typeRank: Record<MarkdownEvidence['type'], number> = {
    figure: 0,
    figureGroup: 1,
    table: 2,
    formula: 3,
    section: 4,
  }

  return [...evidence].sort((left, right) => {
    const rankDelta = typeRank[left.type] - typeRank[right.type]
    if (rankDelta !== 0) return rankDelta
    return (left.page ?? Number.MAX_SAFE_INTEGER) - (right.page ?? Number.MAX_SAFE_INTEGER)
  })
}

function selectRepresentativeEvidence(evidence: MarkdownEvidence[], limit: number) {
  const selected: MarkdownEvidence[] = []
  const seenAnchors = new Set<string>()
  const seenPapers = new Set<string>()

  for (const item of pickEvidenceByPriority(evidence)) {
    if (seenAnchors.has(item.anchorId)) continue

    const paperKey = normalizeText(item.sourcePaperId)
    if (paperKey && seenPapers.has(paperKey) && item.type === 'figure') continue

    seenAnchors.add(item.anchorId)
    if (paperKey) seenPapers.add(paperKey)
    selected.push(item)

    if (selected.length >= limit) break
  }

  return selected
}

function renderEvidenceMarkdown(
  evidence: MarkdownEvidence,
  language: SupportedLanguage,
) {
  const copy = COPY[language]
  const label = clipText(evidence.label || evidence.title || evidence.anchorId, 120)
  const quote = clipText(evidence.quote, 180)
  const interpretation = clipText(evidence.whyItMatters || evidence.content, 240)
  const evidenceLink = markdownLink(label, evidence.route)
  const sourceLine = evidenceLink ? `${copy.source}: ${evidenceLink}` : ''

  if (evidence.type === 'figure') {
    const imagePath = normalizeText(evidence.imagePath || evidence.thumbnailPath)
    if (imagePath) {
      return dedupeStrings(
        [
          `![${label}](${imagePath})`,
          quote ? `_${label}. ${quote}_` : `_${label}_`,
          interpretation,
          sourceLine,
        ],
        4,
      ).join('\n\n')
    }

    return dedupeStrings(
      [
        `> ${copy.imageFallback}`,
        quote ? `> ${quote}` : '',
        interpretation,
        sourceLine,
      ],
      4,
    ).join('\n\n')
  }

  if (evidence.type === 'table') {
    const table = toMarkdownTable(evidence.tableHeaders, evidence.tableRows)
    return dedupeStrings(
      [
        quote ? `**${label}.** ${quote}` : `**${label}.**`,
        table || `> ${copy.tableFallback}`,
        interpretation,
        sourceLine,
      ],
      4,
    ).join('\n\n')
  }

  if (evidence.type === 'formula') {
    const formula = normalizeText(evidence.formulaLatex)
    return dedupeStrings(
      [
        `**${label}.**`,
        formula ? `$$\n${formula}\n$$` : `> ${copy.formulaFallback}`,
        quote,
        interpretation,
        sourceLine,
      ],
      5,
    ).join('\n\n')
  }

  return dedupeStrings(
    [
      quote ? `> ${quote}` : '',
      interpretation,
      sourceLine,
    ],
    3,
  ).join('\n\n')
}

function buildPaperMetaLine(paper: MarkdownPaperRole, language: SupportedLanguage) {
  const copy = COPY[language]
  const parts = [
    formatYear(paper.publishedAt),
    typeof paper.citationCount === 'number' ? `${paper.citationCount} ${copy.citations}` : '',
  ].filter(Boolean)

  const links = [
    markdownLink(copy.readPaper, paper.route),
    markdownLink(copy.source, paper.originalUrl),
    markdownLink(copy.pdf, paper.pdfUrl),
  ].filter(Boolean)

  return [...parts, ...links].join(' · ')
}

function buildNodePaperDigests(args: {
  language: SupportedLanguage
  paperRoles: MarkdownPaperRole[]
  articleSections: MarkdownArticleSection[]
  enhancedArticleFlow?: NodeArticleFlowBlock[]
}) {
  const { language, paperRoles, articleSections, enhancedArticleFlow } = args
  const digests = new Map<string, EnhancedPaperDigest>()

  if (Array.isArray(enhancedArticleFlow) && enhancedArticleFlow.length > 0) {
    for (const block of enhancedArticleFlow) {
      if (block.type !== 'paper-article') continue

      const role = paperRoles.find((item) => item.paperId === block.paperId)
      const lines = dedupeStrings(
        [
          block.coreThesis,
          ...(block.paragraphs ?? []).map((paragraph) => paragraph.content),
          block.introduction,
          ...(block.subsections ?? []).map((section) => section.content),
          block.closingInsight,
          block.conclusion,
          role?.contribution,
          role?.summary,
        ],
        5,
      ).map((line) => ensureSentence(clipText(line, 260)))

      digests.set(block.paperId, {
        paperId: block.paperId,
        title: block.title,
        lines,
      })
    }
  }

  for (const paper of paperRoles) {
    if (digests.has(paper.paperId)) continue

    const sectionLines = articleSections
      .filter((section) => section.paperId === paper.paperId)
      .flatMap((section) => section.body)

    digests.set(paper.paperId, {
      paperId: paper.paperId,
      title: paper.title,
      lines: dedupeStrings(
        [paper.contribution, paper.summary, ...sectionLines],
        4,
      ).map((line) => ensureSentence(clipText(line, 260))),
    })
  }

  return paperRoles
    .map((paper) => {
      const digest = digests.get(paper.paperId)
      if (!digest) return null

      const metaLine = buildPaperMetaLine(paper, language)
      const blocks = dedupeStrings(
        [
          `**${digest.title}.**`,
          metaLine,
          ...digest.lines,
        ],
        7,
      )

      return blocks.join('\n\n')
    })
    .filter((entry): entry is string => Boolean(entry))
}

export function buildNodeArticleMarkdown(input: NodeArticleMarkdownInput) {
  const language = pickLanguage(input.language)
  const copy = COPY[language]
  const sections: string[] = []

  const introduction = dedupeStrings(
    [input.standfirst, input.summary, input.explanation],
    3,
  ).map((line) => ensureSentence(clipText(line, 280)))

  if (introduction.length > 0) {
    sections.push(introduction.join('\n\n'))
  }

  const judgment = dedupeStrings(
    [input.coreJudgment?.content, input.summary],
    1,
  )
  if (judgment.length > 0) {
    sections.push(`## ${copy.currentJudgment}\n\n${ensureSentence(clipText(judgment[0]!, 260))}`)
  }

  const paperDigests = buildNodePaperDigests({
    language,
    paperRoles: input.paperRoles,
    articleSections: input.articleSections,
    enhancedArticleFlow: input.enhancedArticleFlow,
  })
  if (paperDigests.length > 0) {
    sections.push(`## ${copy.paperEvidence}\n\n${paperDigests.join('\n\n')}`)
  }

  const synthesisBlock = input.enhancedArticleFlow?.find(
    (block): block is Extract<NodeArticleFlowBlock, { type: 'synthesis' }> => block.type === 'synthesis',
  )
  const synthesisLines = dedupeStrings(
    [
      synthesisBlock?.content,
      input.critique.summary,
      ...(synthesisBlock?.insights ?? []),
    ],
    4,
  )
  if (synthesisLines.length > 0) {
    const bulletLines = synthesisLines.slice(1).map((line) => `- ${clipText(line, 180)}`)
    sections.push(
      `## ${copy.crossPaper}\n\n${ensureSentence(clipText(synthesisLines[0]!, 260))}${bulletLines.length > 0 ? `\n\n${bulletLines.join('\n')}` : ''}`,
    )
  }

  const evidenceBlocks = selectRepresentativeEvidence(
    input.evidence.filter((item) => item.type !== 'section'),
    4,
  ).map((item) => renderEvidenceMarkdown(item, language))
  if (evidenceBlocks.length > 0) {
    sections.push(`## ${copy.evidence}\n\n${evidenceBlocks.join('\n\n')}`)
  }

  if (input.evidenceAudit?.status === 'needs_vlm_audit' && input.evidenceAudit.warnings.length > 0) {
    const warningLines = input.evidenceAudit.warnings.map((warning) =>
      `- **${warning.severity.toUpperCase()} / ${warning.code}**: ${clipText(warning.message, 220)}`,
    )
    const action = input.evidenceAudit.requiredAction
      ? `\n\n**${copy.evidenceAuditAction}:** ${clipText(input.evidenceAudit.requiredAction, 260)}`
      : ''
    sections.push(`## ${copy.evidenceAudit}\n\n${warningLines.join('\n')}${action}`)
  }

  const unresolvedLines = dedupeStrings(
    [...input.closing, input.critique.summary, ...input.critique.bullets],
    5,
  ).map((line) => ensureSentence(clipText(line, 220)))
  if (unresolvedLines.length > 0) {
    const lead = unresolvedLines[0] ?? ''
    const bullets = unresolvedLines.slice(1).map((line) => `- ${clipText(line, 180)}`)
    sections.push(
      `## ${copy.unresolved}\n\n${lead}${bullets.length > 0 ? `\n\n${bullets.join('\n')}` : ''}`,
    )
  }

  return sections.filter(Boolean).join('\n\n')
}

export function buildTopicArticleMarkdown(input: TopicArticleMarkdownInput) {
  const language = pickLanguage(input.language)
  const copy = COPY[language]
  const sections: string[] = []

  const introLines = dedupeStrings(
    [input.standfirst, ...input.narrativeSegments],
    4,
  ).map((line) => ensureSentence(clipText(line, 300)))
  if (introLines.length > 0) {
    sections.push(introLines.join('\n\n'))
  }

  const thesis = dedupeStrings([input.thesis], 1)
  if (thesis.length > 0) {
    sections.push(`## ${copy.currentJudgment}\n\n${ensureSentence(clipText(thesis[0]!, 260))}`)
  }

  if (input.stages.length > 0) {
    const stageLines = input.stages.slice(0, 6).map((stage) => {
      const summary = clipText(stage.stageThesis || stage.summary, 180)
      return `- **${copy.stagePrefix} ${stage.stageIndex}: ${stage.title}** — ${summary}`
    })
    sections.push(`## ${copy.stageLine}\n\n${stageLines.join('\n')}`)
  }

  if (input.nodes.length > 0) {
    const nodeLines = input.nodes.slice(0, 6).map((node) => {
      const linkedTitle = markdownLink(node.title, node.route)
      return `- **${linkedTitle}** — ${clipText(node.summary, 180)}`
    })
    sections.push(`## ${copy.keyNodes}\n\n${nodeLines.join('\n')}`)
  }

  const evidenceBlocks = selectRepresentativeEvidence(
    input.evidence.filter((item) => item.type !== 'section'),
    3,
  ).map((item) => renderEvidenceMarkdown(item, language))
  if (evidenceBlocks.length > 0) {
    sections.push(`## ${copy.evidence}\n\n${evidenceBlocks.join('\n\n')}`)
  }

  const unresolvedLines = dedupeStrings(
    [...input.closing.paragraphs, input.closing.reviewerNote],
    4,
  ).map((line) => ensureSentence(clipText(line, 240)))
  if (unresolvedLines.length > 0) {
    const lead = unresolvedLines[0] ?? ''
    const rest = unresolvedLines.slice(1).map((line) => `- ${clipText(line, 180)}`)
    sections.push(
      `## ${copy.unresolved}\n\n${lead}${rest.length > 0 ? `\n\n${rest.join('\n')}` : ''}`,
    )
  }

  return sections.filter(Boolean).join('\n\n')
}
