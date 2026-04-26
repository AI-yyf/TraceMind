import type { ReactNode } from 'react'
import { Bookmark, Download, ExternalLink, Sparkles, Trash2 } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { resolveLanguageLocale } from '@/i18n/locale'
import type { FavoriteExcerpt } from '@/types/tracker'
import {
  buildResearchNotePreview,
  formatResearchNoteDate,
  getResearchNoteKindLabel,
} from '@/utils/researchNotebook'

export function NotebookPanel({
  notes,
  hasSelectedEvidence,
  hasAssistantInsight,
  exportingDossier,
  dossierExportError,
  onCaptureSelectedEvidence,
  onCaptureAssistantInsight,
  onOpenNotebook,
  onOpenNote,
  onRemoveNote,
  onExportDossier,
  onExportHighlights,
  onExportMarkdown,
  onExportJson,
  onClearDossierError,
}: {
  notes: FavoriteExcerpt[]
  hasSelectedEvidence: boolean
  hasAssistantInsight: boolean
  exportingDossier: boolean
  dossierExportError: string | null
  onCaptureSelectedEvidence: () => void
  onCaptureAssistantInsight: () => void
  onOpenNotebook: () => void
  onOpenNote: (note: FavoriteExcerpt) => void
  onRemoveNote: (id: string) => void
  onExportDossier: () => void
  onExportHighlights: () => void
  onExportMarkdown: () => void
  onExportJson: () => void
  onClearDossierError: () => void
}) {
  const { copy } = useProductCopy()
  const { preference, t } = useI18n()
  const locale = resolveLanguageLocale(preference.primary)
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))
  const latestSavedAt = notes[0]?.savedAt

  return (
    <div data-testid="topic-notebook-panel" className="space-y-4">
      <section className="rounded-[22px] bg-[var(--surface-soft)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
              {workbenchText('assistant.notesTitle', 'workbench.notesTitle', 'Research Notebook')}
            </div>
            <p className="mt-3 text-[13px] leading-7 text-black/68">
              {workbenchText(
                'assistant.notesDescription',
                'workbench.notesDescription',
                'Save the key AI explanations, current evidence, and node threads so you can export, revisit, and continue from them later.',
              )}
            </p>
          </div>

          <div className="rounded-[18px] bg-white px-3 py-2 text-right shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
              {workbenchText('assistant.notesCount', 'workbench.notesCount', 'Entries')}
            </div>
            <div className="mt-1 text-[24px] font-semibold leading-none text-black">{notes.length}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <QuickActionButton
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label={workbenchText('assistant.captureAnswer', 'workbench.captureAnswer', 'Capture Latest Answer')}
            disabled={!hasAssistantInsight}
            onClick={onCaptureAssistantInsight}
          />
          <QuickActionButton
            icon={<Bookmark className="h-3.5 w-3.5" />}
            label={workbenchText(
              'assistant.captureEvidence',
              'workbench.captureEvidence',
              'Capture Current Evidence',
            )}
            disabled={!hasSelectedEvidence}
            onClick={onCaptureSelectedEvidence}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <QuickActionButton
            icon={<Download className="h-3.5 w-3.5" />}
            label={
              exportingDossier
                ? t('workbench.exportDossierLoading', 'Exporting Dossier...')
                : workbenchText('assistant.exportDossier', 'workbench.exportDossier', 'Export Research Dossier')
            }
            onClick={onExportDossier}
            disabled={exportingDossier}
          />
          <QuickActionButton
            icon={<Download className="h-3.5 w-3.5" />}
            label={workbenchText('assistant.exportHighlights', 'workbench.exportHighlights', 'Export Highlights')}
            onClick={onExportHighlights}
          />
          <QuickActionButton
            icon={<Download className="h-3.5 w-3.5" />}
            label={workbenchText('assistant.exportMarkdown', 'workbench.exportMarkdown', 'Export Markdown')}
            onClick={onExportMarkdown}
          />
          <QuickActionButton
            icon={<Download className="h-3.5 w-3.5" />}
            label={workbenchText('assistant.exportJson', 'workbench.exportJson', 'Export JSON')}
            onClick={onExportJson}
          />
          <QuickActionButton
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label={workbenchText('assistant.openNotebook', 'workbench.openNotebook', 'Open All Notes')}
            onClick={onOpenNotebook}
          />
        </div>

        {dossierExportError && (
          <div className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] leading-5 text-red-700">{dossierExportError}</p>
              <button
                type="button"
                onClick={onClearDossierError}
                className="text-[11px] text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {latestSavedAt ? (
          <p className="mt-4 text-[11px] leading-6 text-black/46">
            {workbenchText('assistant.notesLastSaved', 'workbench.notesLastSaved', 'Last Saved')}:
            {' '}
            {formatResearchNoteDate(latestSavedAt, locale)}
          </p>
        ) : null}
      </section>

      <section className="rounded-[22px] bg-[var(--surface-soft)] p-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
          {workbenchText('assistant.notesRecent', 'workbench.notesRecent', 'Saved In This Topic')}
        </div>

        {notes.length === 0 ? (
          <p className="mt-3 text-[13px] leading-7 text-black/56">
            {workbenchText(
              'assistant.notesEmpty',
              'workbench.notesEmpty',
              'Saved answers, evidence, and decisive threads for this topic appear here. Capture one first, then let the assistant continue from it.',
            )}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {notes.slice(0, 8).map((note) => (
              <article
                key={note.id}
                className="rounded-[18px] border border-black/6 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                      {getResearchNoteKindLabel(note.kind, locale)}
                    </div>
                    <h3 className="mt-1 text-[14px] font-semibold leading-6 text-black">
                      {note.excerptTitle}
                    </h3>
                    <div className="mt-1 text-[12px] text-black/42">
                      {note.sourceLabel ||
                        note.paperTitleZh ||
                        workbenchText('assistant.notesUntitled', 'workbench.notesUntitled', 'Research Note')}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveNote(note.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/8 px-2.5 py-1 text-[10px] text-black/48 transition hover:border-black/16 hover:text-black"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('common.delete', 'Delete')}
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {buildResearchNotePreview(note).map((paragraph) => (
                    <p key={paragraph} className="text-[13px] leading-7 text-black/66">
                      {paragraph}
                    </p>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-black/40">
                    {formatResearchNoteDate(note.savedAt, locale)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenNote(note)}
                    className="inline-flex items-center gap-1.5 text-[11px] text-black/62 transition hover:text-black"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {workbenchText('assistant.openNoteSource', 'workbench.openNoteSource', 'Open Source')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function QuickActionButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-3 py-2 text-[11px] text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
    >
      {icon}
      {label}
    </button>
  )
}
