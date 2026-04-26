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

function stringifyStructuredCell(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return ''

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseStructuredTable(evidence: EvidenceExplanation): ParsedTable | null {
  if (evidence.type !== 'table') return null

  const headers = (evidence.tableHeaders ?? [])
    .map((header: string) => header.trim())
    .filter(Boolean)
  const rawRows = Array.isArray(evidence.tableRows) ? evidence.tableRows : []
  const rows = rawRows
    .map((row: unknown) => {
      if (Array.isArray(row)) {
        return row.map((cell) => stringifyStructuredCell(cell)).filter((cell) => cell.length > 0)
      }

      if (row && typeof row === 'object') {
        const record = row as Record<string, unknown>
        if (headers.length > 0) {
          return headers.map((header: string) => stringifyStructuredCell(record[header]))
        }

        return Object.values(record).map((cell) => stringifyStructuredCell(cell))
      }

      const cell = stringifyStructuredCell(row)
      return cell ? [cell] : []
    })
    .filter((row) => row.length > 0)

  const width = Math.max(headers.length, ...rows.map((row) => row.length), 0)
  if (width < 2 || rows.length === 0) return null

  const normalizedHeaders =
    headers.length > 0
      ? Array.from({ length: width }, (_: unknown, index: number) => headers[index] ?? `Column ${index + 1}`)
      : rows[0]?.map((_, index) => `Column ${index + 1}`) ?? []
  const normalizedRows = rows.map((row: string[]) =>
    Array.from({ length: width }, (_, index) => row[index] ?? ''),
  )

  return {
    headers: normalizedHeaders,
    rows: normalizedRows,
  }
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
  if (/^[\d.%+\-闂傚倸鍊烽懗鍫曞磻閵娾晛纾块柡灞诲劚缁犱即鏌熺紒銏犳灈闁?=:;,()]+(?:\s+[\d.%+\-闂傚倸鍊烽懗鍫曞磻閵娾晛纾块柡灞诲劚缁犱即鏌熺紒銏犳灈闁?=:;,()]+)*$/u.test(normalized)) return false
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

function shouldHideWhyItMatters(
  evidence: EvidenceExplanation,
  whyItMatters: string,
  isInline: boolean,
) {
  const normalized = normalizeEvidenceSentence(whyItMatters)
  if (!normalized) return true

  const lowSignalPatterns = [
    /read the original figure directly/iu,
    /used for result comparison/iu,
    /gives the key result/iu,
    /provides the method constraint/iu,
    /suggestion to inspect the original figure/iu,
  ]

  if (lowSignalPatterns.some((pattern) => pattern.test(normalized))) {
    return true
  }

  if (isInline && normalized.length > 64) return true
  if (evidence.type === 'figure' && normalized.length > 56) return true
  return false
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
    if (/visual checkpoint|comparison into a table|objective, constraint, or update rule/i.test(explanation)) {
      return ''
    }
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
  const isInline = variant === 'article-inline'
  const imageUrl = resolveApiAssetUrl(
    isInline ? evidence.imagePath ?? evidence.thumbnailPath : evidence.thumbnailPath ?? evidence.imagePath,
  )
  const tableSource =
    evidence.type === 'table' ? extractTableSource(evidence.content, evidence.quote) : ''
  const structuredTable = evidence.type === 'table' ? parseStructuredTable(evidence) : null
  const parsedTable =
    evidence.type === 'table'
      ? structuredTable ?? parseEvidenceTable(evidence.content, evidence.quote)
      : null
  const recoveredTable =
    evidence.type === 'table' && !parsedTable
      ? recoverLinearizedTable(evidence.content, evidence.quote)
      : null
  const bodyText =
    evidence.type === 'table'
      ? clipEvidenceText(stripEvidenceBody(evidence.content, evidence.quote, tableSource))
      : clipEvidenceText(evidence.content)
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
            ? 'scroll-mt-24 my-10 border-l-2 border-black/18 pl-4 py-2'
            : 'my-10 py-2'
          : highlighted
            ? 'scroll-mt-20 rounded-[28px] border border-[#d1aa5c]/65 bg-[#fff8ec] px-5 py-5 shadow-[0_18px_38px_rgba(15,23,42,0.10)]'
            : 'rounded-[28px] border border-black/8 bg-[var(--surface-soft)]/55 px-5 py-5'
      }`}
    >
      <div
        className={`text-[11px] uppercase tracking-[0.22em] text-black/38 ${
          isInline ? 'px-1 text-center' : ''
        }`}
      >
        {evidence.label}
      </div>
      <h3
        className={`mt-2 font-semibold text-black ${
          isInline ? 'px-1 text-center text-[13px] leading-6' : 'text-[20px] leading-7'
        }`}
      >
        {evidence.title}
      </h3>

      {imageUrl && evidence.type === 'figure' ? (
        <img
          src={imageUrl}
          alt={evidence.title}
          className={`mt-5 block max-w-full object-contain bg-white ${
            isInline
              ? 'mx-auto max-h-[360px] max-w-[72%] rounded-[4px]'
              : 'w-full max-h-[460px] rounded-[24px] p-4'
          }`}
          loading="lazy"
        />
      ) : null}

      {evidence.type === 'formula' && evidence.formulaLatex ? (
        <MathFormula
          expression={evidence.formulaLatex}
          className={`mt-5 overflow-x-auto bg-white ${
            isInline
              ? 'mx-auto max-w-[76%] px-0 py-3 text-center'
              : 'rounded-[24px] px-5 py-5'
          }`}
        />
      ) : null}

      {evidence.type === 'table' ? (
        <div
          className={`mt-5 overflow-hidden border border-black/8 bg-white ${
            isInline ? 'mx-auto max-w-[82%] rounded-[6px]' : 'rounded-[24px]'
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
              {recoveredTable.entries.map((entry, index) => (
                <div
                  key={`${evidence.anchorId}-${entry.label}-${entry.value}-${index}`}
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
        <figcaption
          className={`mt-4 text-[13px] leading-7 text-black/56 ${
            isInline ? 'mx-auto max-w-[640px] px-1 text-center italic text-black/46' : ''
          }`}
        >
          {evidence.quote}
        </figcaption>
      ) : null}

      {visibleBodyText ? (
        <div
          className={`mt-3 whitespace-pre-line text-[14px] leading-7 text-black/62 ${
            isInline ? 'mx-auto max-w-[640px] px-1 text-left' : ''
          }`}
        >
          {visibleBodyText}
        </div>
      ) : null}

      {evidence.whyItMatters && !shouldHideWhyItMatters(evidence, evidence.whyItMatters, isInline) ? (
        <p
          className={`mt-3 text-[13px] leading-7 text-black/58 ${
            isInline ? 'mx-auto max-w-[640px] px-1 text-left' : ''
          }`}
        >
          <strong className="font-medium text-black">{whyItMattersLabel}</strong>
          {evidence.whyItMatters}
        </p>
      ) : null}
    </figure>
  )
}
