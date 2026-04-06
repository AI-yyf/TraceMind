import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, ExternalLink, FileJson, Printer, Sparkles, Trash2 } from 'lucide-react'

import { MathText } from '@/components/MathFormula'
import { useFavorites } from '@/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { resolveLanguageLocale } from '@/i18n/locale'
import type { TopicResearchExportBatch, TopicResearchExportBundle } from '@/types/alpha'
import type { FavoriteExcerpt } from '@/types/tracker'
import { ApiError, apiGet, apiPost } from '@/utils/api'
import {
  buildBatchResearchDossierJson,
  buildBatchResearchDossierMarkdown,
  buildNotebookJson,
  buildNotebookMarkdown,
  buildResearchDossierJson,
  buildResearchDossierMarkdown,
  buildResearchHighlightsMarkdown,
  downloadNotebookTextFile,
  formatResearchNoteDate,
  getResearchNoteKindLabel,
  slugifyNotebookFilename,
} from '@/utils/researchNotebook'

type TopicLookup = Record<string, string>

type GroupedNotes = Array<{
  topicId: string
  topicName: string
  notes: FavoriteExcerpt[]
}>

export function FavoritesPage() {
  const { favorites, removeFavorite } = useFavorites()
  const { copy } = useProductCopy()
  const { preference, t } = useI18n()
  const locale = resolveLanguageLocale(preference.primary)
  const pageText = useCallback(
    (id: string, fallback: string) => copy(id, t(id, fallback)),
    [copy, t],
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const [topicLookup, setTopicLookup] = useState<TopicLookup>({})
  const [dossierExporting, setDossierExporting] = useState(false)
  const [batchExporting, setBatchExporting] = useState(false)
  const selectedTopicId = searchParams.get('topic')

  useDocumentTitle(pageText('favorites.title', 'Research Notebook'))

  useEffect(() => {
    let alive = true
    apiGet<Array<{ id: string; nameZh: string; nameEn?: string }>>('/api/topics')
      .then((topics) => {
        if (!alive) return
        setTopicLookup(
          topics.reduce<TopicLookup>((accumulator, topic) => {
            accumulator[topic.id] =
              preference.primary === 'en'
                ? topic.nameEn || topic.nameZh || topic.id
                : topic.nameZh || topic.nameEn || topic.id
            return accumulator
          }, {}),
        )
      })
      .catch(() => undefined)

    return () => {
      alive = false
    }
  }, [preference.primary])

  const visibleNotes = useMemo(
    () =>
      selectedTopicId
        ? favorites.filter((favorite) => favorite.topicId === selectedTopicId)
        : favorites,
    [favorites, selectedTopicId],
  )

  const exportableTopicIds = useMemo(
    () =>
      Array.from(
        new Set(visibleNotes.map((item) => item.topicId).filter((value): value is string => Boolean(value))),
      ),
    [visibleNotes],
  )

  const groupedNotes = useMemo<GroupedNotes>(() => {
    const buckets = visibleNotes.reduce<Record<string, FavoriteExcerpt[]>>((accumulator, note) => {
      const key = note.topicId ?? 'general'
      accumulator[key] = [...(accumulator[key] ?? []), note]
      return accumulator
    }, {})

    return Object.entries(buckets)
      .map(([topicId, notes]) => ({
        topicId,
        topicName:
          topicId === 'general'
            ? pageText('favorites.generalLabel', 'Unsorted Topic')
            : notes[0]?.topicTitle || topicLookup[topicId] || topicId,
        notes: notes.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)),
      }))
      .sort((left, right) => {
        const leftTime = Date.parse(left.notes[0]?.savedAt ?? '')
        const rightTime = Date.parse(right.notes[0]?.savedAt ?? '')
        return rightTime - leftTime
      })
  }, [pageText, topicLookup, visibleNotes])

  const latestSaved = visibleNotes[0]?.savedAt
  const trackedTopics = exportableTopicIds.length
  const selectedTopicName = selectedTopicId
    ? topicLookup[selectedTopicId] ||
      groupedNotes.find((group) => group.topicId === selectedTopicId)?.topicName ||
      selectedTopicId
    : null
  const notebookTitle = selectedTopicName
    ? `${selectedTopicName} ${pageText('favorites.title', 'Research Notebook')}`
    : pageText('favorites.title', 'Research Notebook')

  const exportMarkdown = () => {
    if (visibleNotes.length === 0) return
    const filename = `${slugifyNotebookFilename(notebookTitle)}.md`
    downloadNotebookTextFile(
      filename,
      buildNotebookMarkdown(visibleNotes, topicLookup, { title: notebookTitle, locale }),
      'text/markdown;charset=utf-8',
    )
  }

  const exportJson = () => {
    if (visibleNotes.length === 0) return
    const filename = `${slugifyNotebookFilename(notebookTitle)}.json`
    downloadNotebookTextFile(
      filename,
      buildNotebookJson(visibleNotes),
      'application/json;charset=utf-8',
    )
  }

  const exportHighlights = () => {
    if (visibleNotes.length === 0) return
    const title = selectedTopicName
      ? `${selectedTopicName} ${pageText('favorites.highlightsTitleSuffix', 'Highlights')}`
      : pageText('favorites.highlightsTitleSuffix', 'Highlights')
    const filename = `${slugifyNotebookFilename(title)}.md`
    downloadNotebookTextFile(
      filename,
      buildResearchHighlightsMarkdown(visibleNotes, topicLookup, { title, locale }),
      'text/markdown;charset=utf-8',
    )
  }

  const exportDossier = async (format: 'markdown' | 'json') => {
    if (!selectedTopicId || dossierExporting) return

    setDossierExporting(true)

    try {
      const bundle = await apiGet<TopicResearchExportBundle>(`/api/topics/${selectedTopicId}/export-bundle`)
      const dossierTitle = `${selectedTopicName || bundle.topic.title} ${pageText('favorites.exportDossier', 'Research Dossier')}`
      const stem = slugifyNotebookFilename(dossierTitle)
      const content =
        format === 'markdown'
          ? buildResearchDossierMarkdown(bundle, visibleNotes, { title: dossierTitle, locale })
          : buildResearchDossierJson(bundle, visibleNotes)

      downloadNotebookTextFile(
        `${stem}.${format === 'markdown' ? 'md' : 'json'}`,
        content,
        format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      )
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : pageText(
              'favorites.exportDossierFailed',
              'Failed to export the research dossier. Please try again later.',
            )
      window.alert(message)
    } finally {
      setDossierExporting(false)
    }
  }

  const exportBatchDossier = async (format: 'markdown' | 'json') => {
    if (selectedTopicId || batchExporting || exportableTopicIds.length === 0) return

    setBatchExporting(true)

    try {
      const batch = await apiPost<TopicResearchExportBatch, { topicIds: string[] }>(
        '/api/topics/export-bundles',
        {
          topicIds: exportableTopicIds,
        },
      )
      const title = pageText('favorites.batchDossierTitle', 'Multi-Topic Research Collection')
      const stem = slugifyNotebookFilename(title)
      const content =
        format === 'markdown'
          ? buildBatchResearchDossierMarkdown(batch, visibleNotes, { title, locale })
          : buildBatchResearchDossierJson(batch, visibleNotes)

      downloadNotebookTextFile(
        `${stem}.${format === 'markdown' ? 'md' : 'json'}`,
        content,
        format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      )
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : pageText(
              'favorites.exportBatchDossierFailed',
              'Failed to export the research collection. Please try again later.',
            )
      window.alert(message)
    } finally {
      setBatchExporting(false)
    }
  }

  return (
    <main className="px-4 pb-20 pt-8 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-black/56 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            {pageText('favorites.backHome', 'Back to Home')}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {selectedTopicId ? (
              <>
                <button
                  type="button"
                  onClick={() => void exportDossier('markdown')}
                  disabled={dossierExporting}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Download className="h-4 w-4" />
                  {dossierExporting
                    ? pageText('favorites.exportDossierLoading', 'Exporting Dossier...')
                    : pageText('favorites.exportDossier', 'Export Research Dossier')}
                </button>
                <button
                  type="button"
                  onClick={() => void exportDossier('json')}
                  disabled={dossierExporting}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <FileJson className="h-4 w-4" />
                  {pageText('favorites.exportDossierJson', 'Dossier JSON')}
                </button>
              </>
            ) : exportableTopicIds.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => void exportBatchDossier('markdown')}
                  disabled={batchExporting}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Download className="h-4 w-4" />
                  {batchExporting
                    ? pageText('favorites.exportBatchDossierLoading', 'Exporting Collection...')
                    : pageText('favorites.exportBatchDossier', 'Export Research Collection')}
                </button>
                <button
                  type="button"
                  onClick={() => void exportBatchDossier('json')}
                  disabled={batchExporting}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <FileJson className="h-4 w-4" />
                  {pageText('favorites.exportBatchDossierJson', 'Collection JSON')}
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={exportHighlights}
              disabled={visibleNotes.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-4 w-4" />
              {pageText('favorites.exportHighlights', 'Export Highlights')}
            </button>

            <button
              type="button"
              onClick={exportMarkdown}
              disabled={visibleNotes.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-4 w-4" />
              {pageText('favorites.exportMarkdown', 'Export Markdown')}
            </button>
            <button
              type="button"
              onClick={exportJson}
              disabled={visibleNotes.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-4 w-4" />
              {pageText('favorites.exportJson', 'Export JSON')}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 transition hover:border-black/16 hover:text-black"
            >
              <Printer className="h-4 w-4" />
              {pageText('favorites.exportPdf', 'Export PDF')}
            </button>
          </div>
        </div>

        <header className="mx-auto mt-10 max-w-[860px] text-center">
          <div
            data-testid="favorites-eyebrow"
            className="text-[11px] uppercase tracking-[0.3em] text-black/30"
          >
            {pageText('favorites.eyebrow', 'Research Notebook')}
          </div>
          <h1
            data-testid="favorites-heading"
            className="mt-4 font-display text-[38px] leading-[1.08] text-black md:text-[54px]"
          >
            {notebookTitle}
          </h1>
          <p className="mt-5 text-[16px] leading-9 text-black/62">
            {pageText(
              'favorites.description',
              'This is where the material worth keeping lives: AI explanations, decisive evidence, node threads, and paper excerpts you can revisit, organize, and export later.',
            )}
          </p>
        </header>

        <section className="mx-auto mt-8 grid max-w-[920px] gap-3 md:grid-cols-3">
          <StatCard
            label={pageText('favorites.statNotes', 'Entries')}
            value={String(visibleNotes.length)}
          />
          <StatCard
            label={pageText('favorites.statTopics', 'Topics')}
            value={String(trackedTopics)}
          />
          <StatCard
            label={pageText('favorites.statLatest', 'Latest Saved')}
            value={latestSaved ? formatResearchNoteDate(latestSaved, locale) : pageText('favorites.none', 'None')}
          />
        </section>

        {selectedTopicId ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams)
                next.delete('topic')
                setSearchParams(next, { replace: true })
              }}
              className="rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm text-black/60 transition hover:text-black"
            >
              {pageText('favorites.clearFilter', 'Show Notes From All Topics')}
            </button>
          </div>
        ) : null}

        <section className="mt-12 space-y-10">
          {groupedNotes.length === 0 ? (
            <div className="py-16 text-center text-sm leading-8 text-black/54">
              {pageText(
                'favorites.empty',
                'No research notes have been saved yet. Capture AI answers, current evidence, or paper excerpts from a topic workbench and they will collect here automatically.',
              )}
            </div>
          ) : (
            groupedNotes.map((group) => (
              <section key={group.topicId}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">
                      {pageText('favorites.topicSection', 'Topic')}
                    </div>
                    <h2 className="mt-2 font-display text-[30px] leading-[1.08] text-black">
                      {group.topicName}
                    </h2>
                  </div>
                  {group.topicId !== 'general' ? (
                    <Link
                      to={`/topic/${group.topicId}`}
                      className="inline-flex items-center gap-2 text-sm text-black/58 transition hover:text-black"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {pageText('favorites.openTopic', 'Open Topic')}
                    </Link>
                  ) : null}
                </div>

                <div className="mt-5 space-y-4">
                  {group.notes.map((favorite) => (
                    <FavoriteCard
                      key={favorite.id}
                      favorite={favorite}
                      locale={locale}
                      defaultSourceLabel={pageText('favorites.defaultSource', 'Research Note')}
                      openSourceLabel={pageText('favorites.openSource', 'Open Source')}
                      removeLabel={pageText('favorites.remove', 'Remove')}
                      onRemove={() => removeFavorite(favorite.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </section>
      </div>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-[var(--surface-soft)] px-5 py-4 text-center">
      <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">{label}</div>
      <div className="mt-2 text-[20px] font-semibold text-black">{value}</div>
    </div>
  )
}

function FavoriteCard({
  favorite,
  locale,
  defaultSourceLabel,
  openSourceLabel,
  removeLabel,
  onRemove,
}: {
  favorite: FavoriteExcerpt
  locale: string
  defaultSourceLabel: string
  openSourceLabel: string
  removeLabel: string
  onRemove: () => void
}) {
  const openRoute =
    favorite.route ||
    (favorite.paperId ? `/paper/${favorite.paperId}` : favorite.topicId ? `/topic/${favorite.topicId}` : undefined)

  return (
    <article className="rounded-[26px] border border-black/6 bg-white px-6 py-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">
            <span data-testid="favorite-note-kind">
              {getResearchNoteKindLabel(favorite.kind, locale) || defaultSourceLabel}
            </span>
          </div>
          <h3 className="mt-3 text-[24px] font-semibold leading-[1.2] text-black">
            {favorite.excerptTitle}
          </h3>
          <div className="mt-2 text-[13px] text-black/46">
            {favorite.sourceLabel || favorite.paperTitleZh || favorite.topicTitle || defaultSourceLabel}
          </div>
          <div className="mt-3 text-[12px] text-black/40">
            {formatResearchNoteDate(favorite.savedAt, locale)}
          </div>
          {favorite.summary ? (
            <p className="mt-4 text-[14px] leading-7 text-black/58">{favorite.summary}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {openRoute ? (
            <Link
              to={openRoute}
              className="inline-flex items-center gap-2 text-sm text-black/60 transition hover:text-black"
            >
              {openSourceLabel}
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-2 text-sm text-red-700 transition hover:text-red-800"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {removeLabel}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4 text-[15px] leading-8 text-black/72">
        {favorite.paragraphs.map((paragraph) => (
          <MathText key={paragraph} as="p" content={paragraph} />
        ))}
      </div>
    </article>
  )
}

export default FavoritesPage
