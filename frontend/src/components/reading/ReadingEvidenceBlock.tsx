import { MathFormula } from '@/components/MathFormula'
import type { EvidenceExplanation } from '@/types/alpha'
import { resolveApiAssetUrl } from '@/utils/api'

type ParsedTable = {
  headers: string[]
  rows: string[][]
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
    const trailing = blocks[blocks.length - 1] ?? ''
    const leading = blocks[0]?.replace(/\s+/gu, ' ').trim() ?? ''
    if (normalizedQuote && leading === normalizedQuote) {
      return trailing
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

export function ReadingEvidenceBlock({
  anchorId,
  evidence,
  highlighted,
  whyItMattersLabel,
}: {
  anchorId: string
  evidence: EvidenceExplanation
  highlighted: boolean
  whyItMattersLabel: string
}) {
  const imageUrl = resolveApiAssetUrl(evidence.thumbnailPath ?? evidence.imagePath)
  const tableSource =
    evidence.type === 'table' ? extractTableSource(evidence.content, evidence.quote) : ''
  const parsedTable =
    evidence.type === 'table' ? parseEvidenceTable(evidence.content, evidence.quote) : null
  const bodyText =
    evidence.type === 'table'
      ? clipEvidenceText(stripEvidenceBody(evidence.content, evidence.quote, tableSource))
      : clipEvidenceText(evidence.content)

  return (
    <figure
      id={anchorId}
      className={`rounded-[28px] border px-5 py-5 transition ${
        highlighted
          ? 'scroll-mt-20 border-[#d1aa5c]/65 bg-[#fff8ec] shadow-[0_18px_38px_rgba(15,23,42,0.10)]'
          : 'border-black/8 bg-[var(--surface-soft)]/55'
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.22em] text-black/38">{evidence.label}</div>
      <h3 className="mt-2 text-[20px] font-semibold leading-7 text-black">{evidence.title}</h3>

      {imageUrl && evidence.type === 'figure' ? (
        <img
          src={imageUrl}
          alt={evidence.title}
          className="mt-5 max-h-[460px] w-full rounded-[24px] object-contain bg-white p-4"
          loading="lazy"
        />
      ) : null}

      {evidence.type === 'formula' && evidence.formulaLatex ? (
        <MathFormula
          expression={evidence.formulaLatex}
          className="mt-5 overflow-x-auto rounded-[24px] bg-white px-5 py-5"
        />
      ) : null}

      {evidence.type === 'table' ? (
        <div className="mt-5 overflow-hidden rounded-[24px] border border-black/8 bg-white">
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
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-4 text-[12px] leading-6 text-black/66">
              {clipEvidenceText(tableSource || evidence.content)}
            </pre>
          )}
        </div>
      ) : null}

      <figcaption className="mt-4 text-[14px] leading-7 text-black/58">{evidence.quote}</figcaption>

      {bodyText ? (
        <div className="mt-4 whitespace-pre-line text-[15px] leading-8 text-black/68">{bodyText}</div>
      ) : null}

      {evidence.whyItMatters ? (
        <p className="mt-4 text-[14px] leading-7 text-black/62">
          <strong className="font-medium text-black">{whyItMattersLabel}</strong>
          {evidence.whyItMatters}
        </p>
      ) : null}
    </figure>
  )
}
