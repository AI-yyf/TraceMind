import { MathFormula } from '@/components/MathFormula'
import type { EvidenceExplanation } from '@/types/alpha'
import { resolveApiAssetUrl } from '@/utils/api'

type ParsedTable = {
  headers: string[]
  rows: string[][]
}

type RecoveredTable =
  | {
      kind: 'pairs'
      entries: Array<{
        label: string
        value: string
      }>
    }
  | {
      kind: 'grid'
      columns: number
      cells: string[]
    }

function extractTableSource(content: string, quote: string) {
  const normalized = content.replace(/\r\n/gu, '\n').trim()
  if (!normalized) return ''

  const blocks = normalized
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean)
  const normalizedQuote = quote.replace(/\s+/gu, ' ').trim()

  if (blocks.length > 1) {
    const leading = blocks[0]?.replace(/\s+/gu, ' ').trim() ?? ''
    if (normalizedQuote && leading === normalizedQuote) {
      return blocks.slice(1).join('\n\n').trim()
    }
  }

  return normalized
}

function splitTableRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return []

  if (trimmed.includes('|')) {
    return trimmed
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
  }

  if (trimmed.includes('\t')) {
    return trimmed
      .split('\t')
      .map((cell) => cell.trim())
      .filter(Boolean)
  }

  return trimmed
    .split(/\s{2,}/u)
    .map((cell) => cell.trim())
    .filter(Boolean)
}

function isMarkdownDivider(line: string) {
  return /^[\s|:-]+$/u.test(line.trim())
}

function normalizeTableBlock(block: string) {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function extractTableBlocks(tableSource: string) {
  return tableSource
    .replace(/\r\n/gu, '\n')
    .split(/\n{2,}/u)
    .map(normalizeTableBlock)
    .filter(Boolean)
}

function looksLikeTextualTableLabel(block: string) {
  const normalized = block.trim()
  if (!normalized) return false
  if (/^[\d.%+\-–—/=:;,()]+(?:\s+[\d.%+\-–—/=:;,()]+)*$/u.test(normalized)) return false
  return /[A-Za-z\u4E00-\u9FFF]/u.test(normalized)
}

function inferRecoveredTableColumns(cells: string[]) {
  if (cells.length >= 12) {
    if (cells.length % 4 === 0) return 4
    if (cells.length % 3 === 0) return 3
    return 4
  }

  if (cells.length >= 9 && cells.length % 3 === 0) return 3
  if (cells.length >= 6) return 3
  return 2
}

function recoverLinearizedTable(content: string, quote: string): RecoveredTable | null {
  const tableSource = extractTableSource(content, quote)
  const blocks = extractTableBlocks(tableSource)
  if (blocks.length < 4) return null

  const normalizedLines = tableSource
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const multiCellLineCount = normalizedLines.filter((line) => splitTableRow(line).length > 1).length
  if (multiCellLineCount >= 2) return null

  const entries: Array<{ label: string; values: string[] }> = []
  let current: { label: string; values: string[] } | null = null

  for (const block of blocks) {
    if (looksLikeTextualTableLabel(block)) {
      if (current && (current.label || current.values.length > 0)) {
        entries.push(current)
      }
      current = { label: block, values: [] }
      continue
    }

    if (!current) {
      current = { label: '', values: [block] }
      continue
    }

    current.values.push(block)
  }

  if (current && (current.label || current.values.length > 0)) {
    entries.push(current)
  }

  const pairEntries = entries
    .map((entry) => ({
      label: entry.label.trim(),
      value: entry.values.join(' · ').replace(/\s+/gu, ' ').trim(),
    }))
    .filter((entry) => entry.label && entry.value)

  if (pairEntries.length >= 2) {
    return {
      kind: 'pairs',
      entries: pairEntries,
    }
  }

  return {
    kind: 'grid',
    columns: inferRecoveredTableColumns(blocks),
    cells: blocks,
  }
}

function parseEvidenceTable(content: string, quote: string): ParsedTable | null {
  const tableSource = extractTableSource(content, quote)
  const lines = tableSource
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) return null

  const rows = lines
    .filter((line, index) => index === 0 || !isMarkdownDivider(line))
    .map(splitTableRow)
    .filter((row) => row.length > 1)

  if (rows.length < 2) return null

  const width = Math.max(...rows.map((row) => row.length))
  if (width < 2) return null

  const normalizedRows = rows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? ''),
  )

  return {
    headers: normalizedRows[0] ?? [],
    rows: normalizedRows.slice(1),
  }
}

function stripEvidenceBody(content: string, quote: string, tableSource: string) {
  let body = content.replace(/\r\n/gu, '\n').trim()
  if (!body) return ''

  if (quote) {
    body = body.replace(quote, '').trim()
  }

  if (tableSource) {
    body = body.replace(tableSource, '').trim()
  }

  return body.replace(/\n{3,}/gu, '\n\n').trim()
}

function clipEvidenceText(content: string, maxLength = 1600) {
  const normalized = content.replace(/\r\n/gu, '\n').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function normalizeEvidenceSentence(value: string) {
  return value.replace(/\s+/gu, ' ').trim()
}

function buildVisibleEvidenceBody(args: {
  evidence: EvidenceExplanation
  bodyText: string
  parsedTable: ParsedTable | null
  recoveredTable: RecoveredTable | null
  isInline: boolean
}) {
  const explanation = normalizeEvidenceSentence(args.evidence.explanation ?? '')
  if (explanation) {
    return clipEvidenceText(explanation, args.isInline ? 320 : 420)
  }

  const body = normalizeEvidenceSentence(args.bodyText)
  const quote = normalizeEvidenceSentence(args.evidence.quote)
  if (!body || body === quote) return ''

  if (args.evidence.type === 'figure') {
    if (body.length > 360) return ''
    return clipEvidenceText(body, 320)
  }

  if (args.evidence.type === 'table') {
    if (args.parsedTable || args.recoveredTable) return ''
    if (body.length > (args.isInline ? 220 : 360)) return ''
    if ((body.match(/\d/gu)?.length ?? 0) > Math.max(12, Math.floor(body.length * 0.35))) return ''
    return clipEvidenceText(body, args.isInline ? 220 : 320)
  }

  if (args.evidence.type === 'formula') {
    if (/[?]|[\uFFFD\u02C6\u02DC]/u.test(body)) return ''
    if (body.length > 220) return ''
    return clipEvidenceText(body, 220)
  }

  return clipEvidenceText(body, 260)
}

export function ReadingEvidenceBlock({
  anchorId,
  evidence,
  highlighted,
  whyItMattersLabel,
  variant = 'panel',
}: {
  anchorId: string
  evidence: EvidenceExplanation
  highlighted: boolean
  whyItMattersLabel: string
  variant?: 'panel' | 'article-inline'
}) {
  const imageUrl = resolveApiAssetUrl(evidence.thumbnailPath ?? evidence.imagePath)
  const tableSource =
    evidence.type === 'table' ? extractTableSource(evidence.content, evidence.quote) : ''
  const parsedTable =
    evidence.type === 'table' ? parseEvidenceTable(evidence.content, evidence.quote) : null
  const recoveredTable =
    evidence.type === 'table' && !parsedTable
      ? recoverLinearizedTable(evidence.content, evidence.quote)
      : null
  const bodyText =
    evidence.type === 'table'
      ? clipEvidenceText(stripEvidenceBody(evidence.content, evidence.quote, tableSource))
      : clipEvidenceText(evidence.content)
  const isInline = variant === 'article-inline'
  const visibleBodyText = buildVisibleEvidenceBody({
    evidence,
    bodyText,
    parsedTable,
    recoveredTable,
    isInline,
  })

  return (
    <figure
      id={anchorId}
      className={`transition ${
        isInline
          ? highlighted
            ? 'scroll-mt-24 border-y border-[#d1aa5c]/55 bg-[#fff8ec]/70 px-0 py-6'
            : 'border-y border-black/8 px-0 py-6'
          : highlighted
            ? 'scroll-mt-20 rounded-[28px] border border-[#d1aa5c]/65 bg-[#fff8ec] px-5 py-5 shadow-[0_18px_38px_rgba(15,23,42,0.10)]'
            : 'rounded-[28px] border border-black/8 bg-[var(--surface-soft)]/55 px-5 py-5'
      }`}
    >
      <div className={`text-[11px] uppercase tracking-[0.22em] text-black/38 ${isInline ? 'px-1' : ''}`}>
        {evidence.label}
      </div>
      <h3 className={`mt-2 font-semibold text-black ${isInline ? 'px-1 text-[18px] leading-8' : 'text-[20px] leading-7'}`}>
        {evidence.title}
      </h3>

      {imageUrl && evidence.type === 'figure' ? (
        <img
          src={imageUrl}
          alt={evidence.title}
          className={`mt-5 w-full object-contain bg-white ${
            isInline ? 'max-h-[520px] rounded-[20px] border border-black/8 p-3' : 'max-h-[460px] rounded-[24px] p-4'
          }`}
          loading="lazy"
        />
      ) : null}

      {evidence.type === 'formula' && evidence.formulaLatex ? (
        <MathFormula
          expression={evidence.formulaLatex}
          className={`mt-5 overflow-x-auto bg-white ${
            isInline ? 'rounded-[18px] border border-black/8 px-4 py-4' : 'rounded-[24px] px-5 py-5'
          }`}
        />
      ) : null}

      {evidence.type === 'table' ? (
        <div
          className={`mt-5 overflow-hidden border border-black/8 bg-white ${
            isInline ? 'rounded-[18px]' : 'rounded-[24px]'
          }`}
        >
          {parsedTable ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[13px] leading-6 text-black/72">
                <thead className="bg-black/[0.03]">
                  <tr>
                    {parsedTable.headers.map((header, index) => (
                      <th
                        key={`${evidence.anchorId}-header-${index}`}
                        className="border-b border-black/8 px-4 py-3 font-medium text-black"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedTable.rows.map((row, rowIndex) => (
                    <tr
                      key={`${evidence.anchorId}-row-${rowIndex}`}
                      className="odd:bg-white even:bg-black/[0.01]"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${evidence.anchorId}-${rowIndex}-${cellIndex}`}
                          className="border-t border-black/6 px-4 py-3 align-top"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : recoveredTable?.kind === 'pairs' ? (
            <dl className="divide-y divide-black/6">
              {recoveredTable.entries.map((entry) => (
                <div
                  key={`${evidence.anchorId}-${entry.label}-${entry.value}`}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)] md:items-start"
                >
                  <dt className="text-[12px] font-medium leading-6 text-black">{entry.label}</dt>
                  <dd className="text-[12px] leading-6 text-black/68">{entry.value}</dd>
                </div>
              ))}
            </dl>
          ) : recoveredTable?.kind === 'grid' ? (
            <div
              className="grid gap-px bg-black/6 p-px"
              style={{
                gridTemplateColumns: `repeat(${Math.max(2, recoveredTable.columns)}, minmax(0, 1fr))`,
              }}
            >
              {recoveredTable.cells.map((cell, index) => (
                <div
                  key={`${evidence.anchorId}-cell-${index}`}
                  className="bg-white px-3 py-3 text-[12px] leading-6 text-black/68"
                >
                  {cell}
                </div>
              ))}
            </div>
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-4 text-[12px] leading-6 text-black/66">
              {clipEvidenceText(tableSource || evidence.content)}
            </pre>
          )}
        </div>
      ) : null}

      {evidence.quote ? (
        <figcaption className={`mt-4 text-[14px] leading-7 text-black/58 ${isInline ? 'px-1' : ''}`}>
          {evidence.quote}
        </figcaption>
      ) : null}

      {visibleBodyText ? (
        <div className={`mt-4 whitespace-pre-line text-[15px] leading-8 text-black/68 ${isInline ? 'px-1' : ''}`}>
          {visibleBodyText}
        </div>
      ) : null}

      {evidence.whyItMatters ? (
        <p className={`mt-4 text-[14px] leading-7 text-black/62 ${isInline ? 'px-1' : ''}`}>
          <strong className="font-medium text-black">{whyItMattersLabel}</strong>
          {evidence.whyItMatters}
        </p>
      ) : null}
    </figure>
  )
}
