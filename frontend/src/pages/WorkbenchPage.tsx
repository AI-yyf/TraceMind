import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, MessageSquare, Sparkles, BookOpen, Layers, AlertCircle } from 'lucide-react'

import { WorkbenchFullLayout } from '@/components/topic/WorkbenchFullLayout'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import type { TopicResearchBrief } from '@/types/alpha'
import { ApiError, apiGet } from '@/utils/api'
import {
  assertBackendTopicCollectionContract,
  assertTopicViewModelContract,
} from '@/utils/contracts'
import { getTopicLocalizedPair } from '@/utils/topicLocalization'
import { dedupeTopicPresentation } from '@/utils/topicPresentation'

type TopicOption = {
  id: string
  title: string
  titleSecondary?: string
  focusLabel?: string | null
  summary?: string | null
}

// Skeleton components for loading states
function TopicSelectorSkeleton() {
  return (
    <div className="inline-flex items-center gap-2 rounded-[12px] border border-black/10 bg-white px-3 py-2">
      <div className="h-4 w-24 animate-pulse rounded bg-black/10" />
      <ChevronDown className="h-4 w-4 text-black/30" />
    </div>
  )
}

function ContentSkeleton() {
  return (
    <div className="flex h-[calc(100vh-56px)] items-center justify-center">
      <div className="text-center max-w-sm">
        {/* Animated research icon */}
        <div className="relative mx-auto h-16 w-16">
          <div className="absolute inset-0 animate-pulse rounded-full bg-amber-100/50" />
          <div className="absolute inset-2 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
          <Sparkles className="absolute inset-4 h-8 w-8 text-amber-600 animate-pulse" />
        </div>
        <p className="mt-6 text-sm font-medium text-black/72">
          Preparing research workspace...
        </p>
        <p className="mt-2 text-xs text-black/48">
          Loading topic data and initializing assistants
        </p>
        {/* Progress bar */}
        <div className="mt-4 h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
          <div className="h-full w-1/2 animate-[shimmer_1.5s_infinite] rounded-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        </div>
      </div>
    </div>
  )
}

// Animation styles
const animationStyles = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes dropdownEnter {
    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .animate-dropdown-enter {
    animation: dropdownEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
`

export function WorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, preference } = useI18n()

  const [topics, setTopics] = useState<TopicOption[]>([])
  const [topicsLoading, setTopicsLoading] = useState(true)
  const [topicsError, setTopicsError] = useState<string | null>(null)

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(() => {
    return searchParams.get('topicId') || null
  })

  const [topicTitle, setTopicTitle] = useState<string>('')
  const [researchBrief, setResearchBrief] = useState<TopicResearchBrief | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // Inject animation styles
  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.textContent = animationStyles
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Load topics list
  const loadTopics = useCallback(async () => {
    setTopicsLoading(true)
    setTopicsError(null)

    try {
      const data = await apiGet<unknown>('/api/topics')
      assertBackendTopicCollectionContract(data)

      const visibleTopics = dedupeTopicPresentation(data)
      const topicOptions: TopicOption[] = visibleTopics.map((topic) => {
        const localizedTitle = getTopicLocalizedPair(
          topic.localization,
          'name',
          preference,
          topic.nameZh,
          topic.nameEn ?? topic.nameZh,
        )
        const localizedFocusLabel = getTopicLocalizedPair(
          topic.localization,
          'focusLabel',
          preference,
          topic.focusLabel ?? '',
          topic.focusLabel ?? '',
        )

        return {
          id: topic.id,
          title: localizedTitle.primary,
          titleSecondary: localizedTitle.secondary,
          focusLabel: localizedFocusLabel.primary || topic.focusLabel,
          summary: topic.summary,
        }
      })

      setTopics(topicOptions)

      // Auto-select first topic if none selected
      const selectedStillVisible = topicOptions.some((topic) => topic.id === selectedTopicId)

      if ((!selectedTopicId || !selectedStillVisible) && topicOptions.length > 0) {
        const firstTopicId = topicOptions[0].id
        setSelectedTopicId(firstTopicId)
        setSearchParams({ topicId: firstTopicId }, { replace: true })
      }
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.message
          : nextError instanceof Error
            ? nextError.message
            : t('workbench.topicsLoadError', 'Failed to load topics')
      setTopicsError(message)
      setTopics([])
    } finally {
      setTopicsLoading(false)
    }
  }, [preference, selectedTopicId, setSearchParams, t])

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  // Sync URL param with state
  useEffect(() => {
    const urlTopicId = searchParams.get('topicId')
    if (urlTopicId && urlTopicId !== selectedTopicId) {
      setSelectedTopicId(urlTopicId)
    }
  }, [searchParams, selectedTopicId])

  // Load topic details when selected
  useEffect(() => {
    if (!selectedTopicId) {
      setTopicTitle('')
      setResearchBrief(null)
      return
    }

    let alive = true
    setBriefLoading(true)
    setBriefError(null)

    const loadTopicData = async () => {
      try {
        const viewModel = await apiGet<unknown>(`/api/topics/${selectedTopicId}/view-model`)
        assertTopicViewModelContract(viewModel)

        const localizedTitle = getTopicLocalizedPair(
          viewModel.localization,
          'name',
          preference,
          viewModel.title,
          viewModel.titleEn ?? viewModel.title,
        )

        if (alive) {
          setTopicTitle(localizedTitle.primary)
        }

        const brief = await apiGet<TopicResearchBrief>(`/api/topics/${selectedTopicId}/research-brief`)
        if (alive) {
          setResearchBrief(brief)
        }
      } catch (nextError) {
        if (alive) {
          const message =
            nextError instanceof ApiError
              ? nextError.message
              : nextError instanceof Error
                ? nextError.message
                : t('workbench.topicLoadError', 'Failed to load topic data')
          setBriefError(message)
          setResearchBrief(null)
        }
      } finally {
        if (alive) {
          setBriefLoading(false)
        }
      }
    }

    void loadTopicData()

    return () => {
      alive = false
    }
  }, [selectedTopicId, preference, t])

  const handleTopicSelect = useCallback(
    (topicId: string) => {
      setSelectedTopicId(topicId)
      setDropdownOpen(false)
      setSearchParams({ topicId }, { replace: true })
    },
    [setSearchParams],
  )

  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || null,
    [topics, selectedTopicId],
  )
  const workbenchLabel = t('nav.workbench', '工作台')

  useDocumentTitle(
    selectedTopic
      ? `${workbenchLabel} - ${selectedTopic.title}`
      : workbenchLabel,
  )

  // Loading state for topics
  if (topicsLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#faf9f7] to-[#f5f4f2]">
        <header className="sticky top-0 z-50 border-b border-black/6 bg-white/96 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-3 md:px-6">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm text-black/54 transition-colors hover:text-black"
              >
                <ArrowLeft className="h-4 w-4 transition-transform hover:-translate-x-0.5" />
                <span className="hidden md:inline">{t('workbench.backHome', 'Back')}</span>
              </Link>
              <div className="h-5 w-px bg-black/12" />
              <h1 className="text-sm font-semibold text-black/72">
                {workbenchLabel}
              </h1>
            </div>
            <TopicSelectorSkeleton />
          </div>
        </header>
        <ContentSkeleton />
      </main>
    )
  }

  // Error state for topics
  if (topicsError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#faf9f7] to-[#f5f4f2] px-4">
        <div className="animate-[fadeSlideUp_0.3s_ease-out] max-w-md rounded-[28px] border border-red-100 bg-white p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-black">
            {t('workbench.loadErrorTitle', 'Unable to Load Topics')}
          </h2>
          <p className="mt-2 text-sm text-red-600/80">{topicsError}</p>
          <button
            type="button"
            onClick={() => void loadTopics()}
            className="mt-6 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-black/92 hover:shadow-lg active:scale-[0.98]"
          >
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </main>
    )
  }

  // No topics available
  if (topics.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#faf9f7] to-[#f5f4f2] px-4">
        <div className="animate-[fadeSlideUp_0.3s_ease-out] max-w-md rounded-[28px] border border-black/8 bg-white p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <BookOpen className="h-7 w-7 text-amber-600" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-black">
            {t('workbench.noTopics', 'No Topics Available')}
          </h2>
          <p className="mt-2 text-sm text-black/56">
            {t('workbench.createTopicHint', 'Create a research topic first to start using the workbench.')}
          </p>
          <Link
            to="/?create=1"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-black/92 hover:shadow-lg active:scale-[0.98]"
          >
            <Sparkles className="h-4 w-4" />
            {t('home.create', 'Create Topic')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#faf9f7] to-[#f5f4f2]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-black/6 bg-white/96 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-3 md:px-6">
          {/* Left: Navigation */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm text-black/54 transition-all hover:bg-black/[0.03] hover:text-black"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 hover:-translate-x-0.5" />
              <span className="hidden md:inline font-medium">{t('workbench.backHome', 'Back')}</span>
            </Link>

            <div className="h-5 w-px bg-black/12" />

            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-600" />
              <h1 className="text-sm font-semibold text-black">
                {workbenchLabel}
              </h1>
            </div>
          </div>

          {/* Right: Topic Selector */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-2.5 rounded-[14px] border border-black/10 bg-white px-3.5 py-2.5 text-sm transition-all duration-200 hover:border-amber-200 hover:bg-amber-50/30 hover:shadow-sm active:scale-[0.98]"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-600/70" />
                <span className="max-w-[200px] truncate font-medium text-black md:max-w-[320px]">
                  {selectedTopic?.title || t('workbench.selectTopic', 'Select Topic')}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-black/48 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown with animation */}
            {dropdownOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 bg-black/[0.02]"
                  onClick={() => setDropdownOpen(false)}
                  aria-label="Close dropdown"
                />
                <div
                  className="animate-dropdown-enter absolute right-0 top-full z-50 mt-2 max-h-[420px] w-[340px] overflow-y-auto rounded-[20px] border border-black/[0.06] bg-white py-3 shadow-[0_16px_48px_rgba(15,23,42,0.16)] backdrop-blur-sm"
                  role="listbox"
                >
                  {/* Header */}
                  <div className="px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-black/32 font-medium">
                    {t('workbench.topicsList', 'Research Topics')}
                    <span className="ml-2 rounded-full bg-black/10 px-1.5 py-0.5 text-black/50">
                      {topics.length}
                    </span>
                  </div>

                  {/* Topic Items */}
                  {topics.map((topic, index) => {
                    const isSelected = topic.id === selectedTopicId
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => handleTopicSelect(topic.id)}
                        className={`group w-full px-4 py-3 text-left transition-all duration-150 ${
                          isSelected
                            ? 'bg-gradient-to-r from-amber-50/80 to-amber-100/40'
                            : 'hover:bg-black/[0.02]'
                        }`}
                        role="option"
                        aria-selected={isSelected}
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        {/* Focus Label */}
                        <div className="text-[10px] uppercase tracking-[0.18em] text-black/30 font-medium">
                          {topic.focusLabel || 'General'}
                        </div>

                        {/* Title */}
                        <div
                          className={`mt-1.5 text-[13px] font-medium transition-colors ${
                            isSelected ? 'text-amber-700' : 'text-black group-hover:text-black/80'
                          }`}
                        >
                          {topic.title}
                        </div>

                        {/* Secondary Title (Bilingual) */}
                        {topic.titleSecondary && topic.titleSecondary !== topic.title ? (
                          <div className="mt-0.5 text-[11px] text-black/40">
                            {topic.titleSecondary}
                          </div>
                        ) : null}

                        {/* Selected Indicator */}
                        {isSelected && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600/70">
                            <Sparkles className="h-3 w-3" />
                            <span>Active</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="animate-[fadeSlideUp_0.25s_ease-out]">
        {selectedTopicId ? (
          briefLoading ? (
            <ContentSkeleton />
          ) : briefError ? (
            <div className="flex h-[calc(100vh-56px)] items-center justify-center px-4">
              <div className="max-w-md rounded-[28px] border border-red-100 bg-white p-8 text-center shadow-lg">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                  <AlertCircle className="h-7 w-7 text-red-500" />
                </div>
                <p className="mt-4 text-sm text-red-700">{briefError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setBriefError(null)
                    setSelectedTopicId(selectedTopicId)
                  }}
                  className="mt-6 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-black/92 hover:shadow-lg active:scale-[0.98]"
                >
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            </div>
          ) : (
            <WorkbenchFullLayout
              topicId={selectedTopicId}
              topicTitle={topicTitle}
              researchBrief={researchBrief}
              suggestedQuestions={[]}
              contextSuggestions={[]}
              resources={[]}
              references={[]}
              searchStageWindowMonths={1}
              onOpenCitation={() => {}}
              onAction={() => {}}
              onOpenSearchResult={() => {}}
            />
          )
        ) : (
          <div className="flex h-[calc(100vh-56px)] items-center justify-center px-4">
            <div className="max-w-md rounded-[28px] border border-black/8 bg-white p-8 text-center shadow-lg">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-soft)]">
                <MessageSquare className="h-7 w-7 text-black/32" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-black">
                {t('workbench.selectTopicPrompt', 'Select a Topic')}
              </h2>
              <p className="mt-2 text-sm text-black/56">
                {t('workbench.selectTopicHint', 'Choose a research topic from the dropdown above to start exploring.')}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default WorkbenchPage
