import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { WorkbenchReferenceEntry } from '@/types/alpha'

function formatReferenceAuthors(authors?: string[]) {
  if (!authors || authors.length === 0) return ''
  if (authors.length <= 4) return authors.join(', ')
  return `${authors.slice(0, 4).join(', ')}, et al.`
}

function formatReferenceYear(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(+date)) return ''
  return String(date.getFullYear())
}

function buildEnglishCitation(entry: WorkbenchReferenceEntry) {
  const authors = formatReferenceAuthors(entry.authors)
  const year = formatReferenceYear(entry.publishedAt)
  const title = entry.titleEn || entry.title
  const parts = [
    authors && year ? `${authors} (${year}).` : authors ? `${authors}.` : year ? `(${year}).` : '',
    title ? `${title}.` : '',
    entry.journal ? `${entry.journal}.` : '',
  ].filter(Boolean)

  return parts.join(' ')
}

function clipText(value?: string, maxLength = 180) {
  const normalized = value?.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

export function ReferencesPanel({
  references,
  selectedPaperIds = [],
  onTogglePaperSelection,
  onSelectAllPapers,
  onClearPaperSelection,
  onDownloadSelected,
  isDownloading = false,
  downloadProgress = 0,
  contextLabel,
}: {
  references: WorkbenchReferenceEntry[]
  selectedPaperIds?: string[]
  onTogglePaperSelection?: (paperId: string) => void
  onSelectAllPapers?: () => void
  onClearPaperSelection?: () => void
  onDownloadSelected?: () => void
  isDownloading?: boolean
  downloadProgress?: number
  contextLabel?: string
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))
  const downloadableReferences = references.filter((entry) => Boolean(entry.pdfUrl))
  const selectedCount = selectedPaperIds.filter((paperId) =>
    downloadableReferences.some((entry) => entry.paperId === paperId),
  ).length

  if (references.length === 0) {
    return (
      <section
        data-testid="workbench-references-panel"
        className="rounded-[12px] bg-[var(--surface-soft)] p-3"
      >
        <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
          {workbenchText('assistant.referencesTitle', 'workbench.referencesTitle', 'References')}
        </div>
        <p className="mt-2 text-[12px] leading-5 text-black/56">
          {workbenchText(
            'assistant.referencesEmpty',
            'workbench.referencesEmpty',
            'No paper references are available in the current research context yet.',
          )}
        </p>
      </section>
    )
  }

  return (
    <div data-testid="workbench-references-panel" className="space-y-3">
      <section className="rounded-[12px] bg-[var(--surface-soft)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
              {workbenchText('assistant.referencesTitle', 'workbench.referencesTitle', 'References')}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-black/56">
              {contextLabel ||
                workbenchText(
                  'assistant.referencesSummary',
                  'workbench.referencesSummary',
                  'Use the same reference workspace across the topic map and node article without switching surfaces.',
                )}
            </p>
          </div>
          <span className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/56">
            {references.length}
          </span>
        </div>

        {downloadableReferences.length > 0 && (onSelectAllPapers || onClearPaperSelection || onDownloadSelected) ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {onSelectAllPapers ? (
                <button
                  type="button"
                  onClick={onSelectAllPapers}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/62 transition hover:border-black/18 hover:text-black"
                >
                  {workbenchText('assistant.selectAllPapers', 'node.selectAllPapers', 'Select all papers')}
                </button>
              ) : null}
              {onClearPaperSelection ? (
                <button
                  type="button"
                  onClick={onClearPaperSelection}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/62 transition hover:border-black/18 hover:text-black"
                >
                  {workbenchText('assistant.clearPaperSelection', 'node.clearPaperSelection', 'Clear selection')}
                </button>
              ) : null}
              {onDownloadSelected ? (
                <button
                  type="button"
                  onClick={onDownloadSelected}
                  disabled={selectedCount === 0 || isDownloading}
                  className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-[11px] text-white transition hover:bg-black/92 disabled:cursor-not-allowed disabled:bg-black/25"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isDownloading
                    ? `${downloadProgress}%`
                    : `${workbenchText('assistant.downloadSelectedPdfs', 'node.downloadSelectedPdfs', 'Download')} ${selectedCount} PDFs`}
                </button>
              ) : null}
            </div>
            <div className="text-[11px] text-black/48">
              {selectedCount} selected · {downloadableReferences.length} PDFs ready
            </div>
          </div>
        ) : null}
      </section>

      <div className="space-y-2">
        {references.map((entry, index) => {
          const citation = buildEnglishCitation(entry)
          const selected = selectedPaperIds.includes(entry.paperId)
          const displayTitle = entry.titleEn || entry.title
          const summary = clipText(entry.explanation || entry.summary, 200)
          const hasDownload = Boolean(entry.pdfUrl)

          return (
            <article
              key={`${entry.paperId}:${index}`}
              className="rounded-[14px] border border-black/6 bg-white px-3 py-3"
            >
              <div className="flex gap-3">
                {hasDownload && onTogglePaperSelection ? (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-black/18 accent-black"
                    checked={selected}
                    onChange={() => onTogglePaperSelection(entry.paperId)}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-black/34">[{index + 1}]</div>
                  <div className="mt-1 text-[13px] leading-6 text-black/68">{citation}</div>
                  {summary ? (
                    <p className="mt-2 text-[12px] leading-5 text-black/56">{summary}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.route ? (
                      <Link
                        to={entry.route}
                        className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] leading-5 text-black/58 transition hover:border-black/18 hover:text-black"
                      >
                        {workbenchText('assistant.openReference', 'workbench.openReference', 'Open article')}
                      </Link>
                    ) : null}
                    {entry.originalUrl ? (
                      <a
                        href={entry.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] leading-5 text-black/58 transition hover:border-black/18 hover:text-black"
                      >
                        {workbenchText('assistant.openSource', 'node.openSource', 'Original source')}
                      </a>
                    ) : null}
                    {entry.pdfUrl ? (
                      <a
                        href={entry.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] leading-5 text-black/58 transition hover:border-black/18 hover:text-black"
                      >
                        {workbenchText('assistant.downloadPdf', 'node.downloadPdf', 'Download PDF')}
                      </a>
                    ) : null}
                    {entry.doi ? (
                      <a
                        href={`https://doi.org/${entry.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] leading-5 text-black/58 transition hover:border-black/18 hover:text-black"
                      >
                        DOI
                      </a>
                    ) : null}
                  </div>
                  {entry.citationCount !== null && entry.citationCount !== undefined ? (
                    <div className="mt-2 text-[11px] text-black/42">
                      Cited {entry.citationCount} times
                    </div>
                  ) : null}
                  {displayTitle && displayTitle !== citation ? (
                    <div className="sr-only">{displayTitle}</div>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
