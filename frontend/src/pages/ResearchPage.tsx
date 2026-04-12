import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import type { LanguagePreference } from '@/i18n/types'
import { formatDateTimeByLanguage } from '@/i18n/locale'
import type { StageLocaleMap, TopicLocalizationPayload } from '@/types/alpha'
import { apiGet, buildApiUrl } from '@/utils/api'
import { getStageLocalizedPair, getTopicLocalizedPair } from '@/utils/topicLocalization'
import { compactTopicSurfaceTitle, isRegressionSeedTopic } from '@/utils/topicPresentation'

type TopicRecord = {
  id: string
  nameZh: string
  nameEn?: string | null
  localization?: TopicLocalizationPayload | null
}

type StageRecord = {
  id: string
  order: number
  name: string
  nameEn?: string | null
  localization?: {
    locales: StageLocaleMap
  } | null
}

type TaskProgress = {
  taskId: string
  topicId: string
  topicName: string
  researchMode: 'stage-rounds' | 'duration'
  durationHours: number | null
  currentStage: number
  totalStages: number
  stageProgress: number
  currentStageRuns: number
  currentStageTargetRuns: number
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt: string | null
  lastRunResult: 'success' | 'failed' | 'partial' | null
  discoveredPapers: number
  admittedPapers: number
  generatedContents: number
  startedAt: string | null
  deadlineAt: string | null
  currentStageStalls: number
  status: 'active' | 'paused' | 'completed' | 'failed'
}

type TaskConfig = {
  id: string
  name: string
  cronExpression: string
  enabled: boolean
  topicId?: string
  action: 'discover' | 'refresh' | 'sync'
  researchMode?: 'stage-rounds' | 'duration'
  options?: {
    maxResults?: number
    stageIndex?: number
    maxIterations?: number
    durationHours?: number
    cycleDelayMs?: number
    stageRounds?: Array<{ stageIndex: number; rounds: number }>
  }
  progress?: TaskProgress | null
}

type TaskDetailResponse = {
  task: TaskConfig
  progress: TaskProgress | null
  history: Array<{
    id: string
    taskId: string
    runAt: string
    duration: number
    status: 'success' | 'failed' | 'partial'
    stageIndex: number
    papersDiscovered: number
    papersAdmitted: number
    contentsGenerated: number
    error?: string
    summary: string
  }>
}

type CronPreset = {
  label: string
  value: string
  description: string
}

type UiLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'
type Translate = (key: string, fallback?: string) => string
type TaskQueueFilter = 'all' | 'running' | 'selected'
type TaskWorkbenchPanel = 'queue' | 'detail'
type ResearchPageCreateForm = {
  cronExpression: string
  action: TaskConfig['action']
  researchMode: 'duration' | 'stage-rounds'
  durationHours: number
  cycleDelaySeconds: number
  enabled: boolean
}

const defaultStageRounds = Array.from({ length: 5 }, (_, index) => ({
  stageIndex: index + 1,
  rounds: 2,
}))
const TASK_ARCHIVE_AFTER_MS = 1000 * 60 * 60 * 48

function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

function renderTranslationTemplate(
  t: Translate,
  key: string,
  variables: Record<string, string | number>,
  fallback: string,
) {
  return renderTemplate(t(key, fallback), variables)
}

function formatDurationCompact(
  t: Translate,
  hours: number | string,
  seconds: number | string,
) {
  return renderTranslationTemplate(
    t,
    'research.durationCompact',
    { hours, seconds },
    '{hours}h / {seconds}s',
  )
}

function formatHistoryStatus(
  status: TaskDetailResponse['history'][number]['status'],
  t: Translate,
) {
  if (status === 'success') return t('research.historyStatusSuccess', 'Success')
  if (status === 'failed') return t('research.historyStatusFailed', 'Failed')
  return t('research.historyStatusPartial', 'Partial')
}

function formatTaskMoment(
  value: string | null | undefined,
  language: UiLanguage,
) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return formatDateTimeByLanguage(timestamp, language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTaskStatusMeta(
  task: TaskConfig,
  t: (key: string, fallback?: string) => string,
) {
  const status = getTaskLifecycleStatus(task)

  if (status === 'active') {
    return {
      label: t('research.statusRunning'),
      tone: 'bg-[#f4eee3] text-[#8a5a12]',
    }
  }

  if (status === 'completed') {
    return {
      label: t('research.statusCompleted', 'Completed'),
      tone: 'bg-emerald-50 text-emerald-700',
    }
  }

  if (status === 'failed') {
    return {
      label: t('research.statusFailed', 'Failed'),
      tone: 'bg-red-50 text-red-700',
    }
  }

  return {
    label: t('research.statusPaused'),
    tone: 'bg-[var(--surface-soft)] text-black/58',
  }
}

function getTaskLifecycleStatus(task: TaskConfig) {
  return task.progress?.status ?? (task.enabled ? 'active' : 'paused')
}

function getTaskDisplayModeLabel(
  task: TaskConfig,
  t: Translate,
  compact = false,
) {
  if (task.action !== 'discover') {
    return t(task.action === 'refresh' ? 'research.actionRefresh' : 'research.actionSync')
  }

  if (task.researchMode === 'duration') {
    return compact
      ? t('research.modeDurationShort', 'Continuous research')
      : t('research.modeDuration')
  }

  return compact
    ? t('research.modeStageRoundsShort', 'Stage rounds')
    : t('research.modeStageRounds')
}

function formatTaskDisplayName(
  task: TaskConfig,
  topicLabel: string,
  t: Translate,
) {
  const safeTopic = compactTopicSurfaceTitle(
    topicLabel || task.progress?.topicName || task.name,
    t('research.untitledTopic', 'Untitled topic'),
    30,
  )

  if (task.action === 'discover') {
    return renderTemplate(
      task.researchMode === 'duration'
        ? t('research.taskDisplayDuration', '{topic} · Continuous research')
        : t('research.taskDisplayStageRounds', '{topic} · Stage rounds'),
      { topic: safeTopic },
    )
  }

  return renderTemplate(
    task.action === 'refresh'
      ? t('research.taskDisplayRefresh', '{topic} · Refresh content')
      : t('research.taskDisplaySync', '{topic} · Sync status'),
    { topic: safeTopic },
  )
}

function isTaskDormant(task: TaskConfig) {
  const status = getTaskLifecycleStatus(task)
  if (status === 'active' || task.enabled) return false
  if (!task.topicId) return true

  const activityTimestamp = Date.parse(task.progress?.lastRunAt ?? task.progress?.startedAt ?? '')
  if (Number.isNaN(activityTimestamp)) return true

  return Date.now() - activityTimestamp > TASK_ARCHIVE_AFTER_MS
}

export function ResearchPage() {
  const { t, preference } = useI18n()
  const [searchParams] = useSearchParams()
  const presetTopicId = searchParams.get('topic') ?? ''
  const [topics, setTopics] = useState<TopicRecord[]>([])
  const [tasks, setTasks] = useState<TaskConfig[]>([])
  const [cronPresets, setCronPresets] = useState<CronPreset[]>([])
  const [stageMap, setStageMap] = useState<Record<string, StageRecord[]>>({})
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(
    presetTopicId ? [presetTopicId] : [],
  )
  const [stageRounds, setStageRounds] =
    useState<Array<{ stageIndex: number; rounds: number }>>(defaultStageRounds)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [taskDetail, setTaskDetail] = useState<TaskDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [topicQuery, setTopicQuery] = useState('')
  const [taskQuery, setTaskQuery] = useState('')
  const [taskFilter, setTaskFilter] = useState<TaskQueueFilter>('all')
  const [taskWorkbenchPanel, setTaskWorkbenchPanel] =
    useState<TaskWorkbenchPanel>('queue')
  const [createForm, setCreateForm] = useState({
    cronExpression: '0 20 * * *',
    action: 'discover' as TaskConfig['action'],
    researchMode: 'duration' as 'duration' | 'stage-rounds',
    durationHours: 8,
    cycleDelaySeconds: 2,
    enabled: true,
  })

  useDocumentTitle(t('research.title'))

  useEffect(() => {
    void loadWorkspace()
  }, [])

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskDetail(null)
      return
    }
    void loadTaskDetail(selectedTaskId)
  }, [selectedTaskId])

  useEffect(() => {
    if (selectedTopicIds.length === 0) {
      setStageRounds(defaultStageRounds)
      return
    }

    Promise.all(
      selectedTopicIds.map(async (topicId) => {
        if (stageMap[topicId]) return stageMap[topicId]
        const stages = await apiGet<StageRecord[]>(`/api/tasks/topics/${topicId}/stages`)
        setStageMap((current) => ({ ...current, [topicId]: stages }))
        return stages
      }),
    )
      .then((lists) => {
        const maxStageCount = Math.max(1, ...lists.map((list) => list.length || 1))
        setStageRounds((current) =>
          Array.from({ length: maxStageCount }, (_, index) => ({
            stageIndex: index + 1,
            rounds: current.find((item) => item.stageIndex === index + 1)?.rounds ?? 2,
          })),
        )
      })
      .catch(() => undefined)
  }, [selectedTopicIds, stageMap])

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  )

  const topicLabelById = useMemo(
    () =>
      new Map(
        topics.map((topic) => [
          topic.id,
          getTopicLocalizedPair(
            topic.localization,
            'name',
            preference,
            topic.nameZh,
            topic.nameEn ?? topic.nameZh,
          ).primary,
        ]),
      ),
    [preference, topics],
  )

  const formatTaskLabel = useCallback(
    (task: TaskConfig) =>
      formatTaskDisplayName(task, (task.topicId ? topicLabelById.get(task.topicId) : '') ?? '', t),
    [t, topicLabelById],
  )

  const visibleTasks = useMemo(() => {
    let filtered =
      selectedTopicIds.length > 0
        ? tasks.filter((task) => task.topicId && selectedTopicIds.includes(task.topicId))
        : tasks

    if (taskFilter === 'running') {
      filtered = filtered.filter((task) => (task.progress?.status ?? (task.enabled ? 'active' : 'paused')) === 'active')
    }

    if (taskFilter === 'selected' && selectedTopicIds.length === 0) {
      filtered = []
    }

    const normalizedTaskQuery = taskQuery.trim().toLowerCase()
    if (normalizedTaskQuery) {
      filtered = filtered.filter((task) => {
        const topicName = (task.topicId ? topicLabelById.get(task.topicId) : '') ?? task.progress?.topicName ?? ''
        const haystack = [
          task.name,
          formatTaskLabel(task),
          topicName,
          task.progress?.topicName ?? '',
          task.cronExpression,
          task.action,
          task.researchMode ?? '',
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(normalizedTaskQuery)
      })
    }

    return [...filtered].sort((left, right) => {
      const leftPriority =
        getTaskLifecycleStatus(left) === 'active' ? 0 : left.enabled ? 1 : 2
      const rightPriority =
        getTaskLifecycleStatus(right) === 'active' ? 0 : right.enabled ? 1 : 2

      if (leftPriority !== rightPriority) return leftPriority - rightPriority

      const leftTimestamp = Date.parse(
        left.progress?.lastRunAt ?? left.progress?.startedAt ?? '',
      )
      const rightTimestamp = Date.parse(
        right.progress?.lastRunAt ?? right.progress?.startedAt ?? '',
      )

      if (!Number.isNaN(leftTimestamp) || !Number.isNaN(rightTimestamp)) {
        return (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp) - (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp)
      }

      return right.id.localeCompare(left.id)
    })
  }, [formatTaskLabel, selectedTopicIds, taskFilter, taskQuery, tasks, topicLabelById])

  const stats = useMemo(
    () => ({
      taskCount: tasks.length,
      activeCount: tasks.filter((task) => getTaskLifecycleStatus(task) === 'active').length,
      topicCount: new Set(tasks.map((task) => task.topicId).filter(Boolean)).size,
    }),
    [tasks],
  )

  const selectedTopicLabels = useMemo(
    () =>
      selectedTopicIds
        .map((topicId) => topicLabelById.get(topicId) ?? '')
        .filter(Boolean),
    [selectedTopicIds, topicLabelById],
  )

  useEffect(() => {
    if (visibleTasks.length === 0) {
      setSelectedTaskId('')
      setTaskWorkbenchPanel('queue')
      return
    }

    setSelectedTaskId((current) =>
      visibleTasks.some((task) => task.id === current) ? current : visibleTasks[0]?.id ?? '',
    )
  }, [visibleTasks])

  async function loadWorkspace() {
    setLoading(true)
    try {
      const [topicList, taskList, presets] = await Promise.all([
        apiGet<TopicRecord[]>('/api/tasks/topics'),
        apiGet<TaskConfig[]>('/api/tasks'),
        apiGet<CronPreset[]>('/api/tasks/cron-expressions'),
      ])
      setTopics(topicList.filter((topic) => !isRegressionSeedTopic(topic)))
      setTasks(taskList)
      setCronPresets(presets)
      setSelectedTaskId((current) =>
        taskList.some((task) => task.id === current) ? current : taskList[0]?.id ?? '',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadTaskDetail(taskId: string) {
    setDetailLoading(true)
    try {
      const detail = await apiGet<TaskDetailResponse>(`/api/tasks/${taskId}`)
      setTaskDetail(detail)
    } finally {
      setDetailLoading(false)
    }
  }

  async function createTasks() {
    if (selectedTopicIds.length === 0) {
      setNotice(t('research.noticeSelectTopic'))
      return
    }

    setSubmitting(true)
    setNotice(null)

    try {
      await Promise.all(
        selectedTopicIds.map(async (topicId) => {
          const topic = topics.find((item) => item.id === topicId)
          const topicName = getTopicLocalizedPair(
            topic?.localization,
            'name',
            preference,
            topic?.nameZh ?? topicId,
            topic?.nameEn ?? topic?.nameZh ?? topicId,
          ).primary
          const body = {
            id: `task-${topicId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: renderTranslationTemplate(
              t,
              'research.taskNameTemplate',
              { topic: topicName },
              '{topic} Research Orchestration',
            ),
            cronExpression: createForm.cronExpression,
            enabled: createForm.enabled,
            topicId,
            action: createForm.action,
            researchMode:
              createForm.action === 'discover' ? createForm.researchMode : undefined,
            options:
              createForm.action === 'discover' && createForm.researchMode === 'duration'
                ? {
                    durationHours: Math.max(1, Math.min(48, Math.round(createForm.durationHours))),
                    cycleDelayMs: Math.max(250, Math.round(createForm.cycleDelaySeconds * 1000)),
                  }
                : {
                    stageIndex: 1,
                    maxIterations: stageRounds[0]?.rounds ?? 1,
                    stageRounds,
                  },
          }

          const response = await fetch(buildApiUrl('/api/tasks'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

          if (!response.ok) throw new Error('create_failed')
        }),
      )

      await loadWorkspace()
      setNotice(t('research.noticeCreated'))
    } catch {
      setNotice(t('research.noticeCreateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function runTask(taskId: string) {
    setBusyAction(`run:${taskId}`)
    try {
      await fetch(buildApiUrl(`/api/tasks/${taskId}/run`), { method: 'POST' })
      await Promise.all([loadWorkspace(), loadTaskDetail(taskId)])
    } finally {
      setBusyAction(null)
    }
  }

  async function toggleTask(task: TaskConfig) {
    setBusyAction(`toggle:${task.id}`)
    try {
      await fetch(buildApiUrl(`/api/tasks/${task.id}/toggle`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !task.enabled }),
      })
      await Promise.all([loadWorkspace(), loadTaskDetail(task.id)])
    } finally {
      setBusyAction(null)
    }
  }

  async function resetTask(taskId: string) {
    setBusyAction(`reset:${taskId}`)
    try {
      await fetch(buildApiUrl(`/api/tasks/${taskId}/reset`), { method: 'POST' })
      await Promise.all([loadWorkspace(), loadTaskDetail(taskId)])
    } finally {
      setBusyAction(null)
    }
  }

  async function deleteTask(taskId: string) {
    setBusyAction(`delete:${taskId}`)
    try {
      await fetch(buildApiUrl(`/api/tasks/${taskId}`), { method: 'DELETE' })
      await loadWorkspace()
      if (selectedTaskId === taskId) setSelectedTaskId('')
    } finally {
      setBusyAction(null)
    }
  }

  function getStageRoundLabel(stageIndex: number) {
    const names = selectedTopicIds
      .map((topicId) => {
        const stage = stageMap[topicId]?.find((item) => item.order === stageIndex)
        return getStageLocalizedPair(
          stage?.localization?.locales,
          'name',
          preference,
          stage?.name ?? '',
          stage?.nameEn ?? stage?.name ?? '',
        ).primary
      })
      .filter((value): value is string => Boolean(value))
    const unique = [...new Set(names)]
    return (
      unique[0] ??
      renderTemplate(t('research.stageLabelTemplate'), {
        stage: stageIndex,
      })
    )
  }

  function formatTaskProgress(task: TaskConfig) {
    const progress = task.progress
    if (!progress) return t('research.waitingFirstRun')

    if (progress.researchMode === 'duration') {
      return renderTemplate(
        t(
          'research.progressDurationSummary',
          'XX-hour research / {durationHours}h / Stage {currentStage}/{totalStages} / Current stalls {stageStalls}',
        ),
        {
          durationHours:
            progress.durationHours ??
            task.options?.durationHours ??
            0,
          currentStage: progress.currentStage,
          totalStages: progress.totalStages,
          stageStalls: progress.currentStageStalls,
        },
      )
    }

    return renderTemplate(
      t('research.progressSummary'),
      {
        currentStage: progress.currentStage,
        totalStages: progress.totalStages,
        currentRuns: progress.currentStageRuns,
        targetRuns: progress.currentStageTargetRuns,
      },
    )
  }

  function formatRunSummary(record: TaskDetailResponse['history'][number]) {
    return renderTemplate(
      t('research.runSummary'),
      {
        stage: record.stageIndex,
        discovered: record.papersDiscovered,
        admitted: record.papersAdmitted,
        generated: record.contentsGenerated,
      },
    )
  }

  if (loading) {
    return (
      <main className="h-[calc(100vh-16px)] overflow-hidden px-4 pb-4 pt-4 md:px-6 xl:px-8">
        <div className="mx-auto max-w-[1240px] py-16 text-center text-sm text-black/56">
          {t('research.loading')}
        </div>
      </main>
    )
  }

  return (
    <main
      className="h-[calc(100vh-16px)] overflow-hidden px-4 pb-4 pt-4 md:px-6 xl:px-8"
      data-testid="research-workbench"
    >
      <div className="mx-auto flex h-full max-w-[2160px] flex-col gap-4">
        <header className="shrink-0 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[980px]">
            <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">
              {t('research.windowEyebrow')}
            </div>
            <h1 className="mt-2 font-display text-[28px] leading-[1.04] text-black md:text-[38px]">
              {t('research.title')}
            </h1>
            <p className="mt-2.5 max-w-[820px] text-[13px] leading-6 text-black/58">
              {t('research.description')}
            </p>
          </div>

          <div className="grid min-w-[320px] gap-3 sm:grid-cols-3 xl:w-[560px]">
            <StatCard label={t('research.taskCountLabel')} value={stats.taskCount} compact />
            <StatCard label={t('research.activeCountLabel')} value={stats.activeCount} compact />
            <StatCard label={t('research.topicCountLabel')} value={stats.topicCount} compact />
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[34px] border border-black/8 bg-white px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)] md:px-5 md:py-5">
          <div className="shrink-0 flex flex-wrap items-center gap-3 rounded-[22px] bg-[var(--surface-soft)] px-4 py-3">
            <div className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black/68">
              {renderTemplate(
                t('research.selectionCompactCount', '{count} topics are now in this workbench'),
                { count: selectedTopicIds.length },
              )}
            </div>
            <div className="min-w-[220px] flex-1 text-[12px] leading-6 text-black/56">
              {selectedTopicIds.length > 0
                ? t(
                    'research.selectionCompactReady',
                    'Finish topic selection and scheduling on the left, then switch between the task queue and live run detail on the right without leaving this workbench.',
                  )
                : t(
                    'research.selectionCompactEmpty',
                    'Pick topics on the left first, then inspect the queue, receipts, and stage progress on the right.',
                  )}
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-2">
              {selectedTopicLabels.slice(0, 5).map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-black/62"
                >
                  {label}
                </span>
              ))}
              {selectedTopicLabels.length > 5 ? (
                <span className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-black/46">
                  +{selectedTopicLabels.length - 5}
                </span>
              ) : null}
            </div>
          </div>

          {notice ? (
            <div className="mt-4 shrink-0 rounded-[20px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black/66">
              {notice}
            </div>
          ) : null}

          <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(680px,0.92fr)_minmax(1180px,1.08fr)] 2xl:grid-cols-[minmax(760px,0.92fr)_minmax(1280px,1.08fr)]">
            <ResearchComposerCard
              t={t}
              preference={preference}
              topics={topics}
              selectedTopicIds={selectedTopicIds}
              selectedTopicLabels={selectedTopicLabels}
              topicQuery={topicQuery}
              setTopicQuery={setTopicQuery}
              setSelectedTopicIds={setSelectedTopicIds}
              cronPresets={cronPresets}
              createForm={createForm}
              setCreateForm={setCreateForm}
              stageRounds={stageRounds}
              setStageRounds={setStageRounds}
              getStageRoundLabel={getStageRoundLabel}
              onCreateTasks={createTasks}
              submitting={submitting}
            />

            <ResearchTaskWorkbenchCard
              t={t}
              language={preference.primary}
              panel={taskWorkbenchPanel}
              onPanelChange={setTaskWorkbenchPanel}
              tasks={visibleTasks}
              totalTasks={tasks.length}
              taskQuery={taskQuery}
              setTaskQuery={setTaskQuery}
              taskFilter={taskFilter}
              setTaskFilter={setTaskFilter}
              selectedTopicIds={selectedTopicIds}
              selectedTask={selectedTask}
              busyAction={busyAction}
              setSelectedTaskId={setSelectedTaskId}
              onRunTask={runTask}
              onToggleTask={toggleTask}
              onResetTask={resetTask}
              onDeleteTask={deleteTask}
              taskDetail={taskDetail}
              detailLoading={detailLoading}
              formatTaskLabel={formatTaskLabel}
              formatTaskProgress={formatTaskProgress}
              formatRunSummary={formatRunSummary}
            />
          </div>
        </section>
      </div>
    </main>
  )
}

function ResearchComposerCard({
  t,
  preference,
  topics,
  selectedTopicIds,
  selectedTopicLabels,
  topicQuery,
  setTopicQuery,
  setSelectedTopicIds,
  cronPresets,
  createForm,
  setCreateForm,
  stageRounds,
  setStageRounds,
  getStageRoundLabel,
  onCreateTasks,
  submitting,
}: {
  t: Translate
  preference: LanguagePreference
  topics: TopicRecord[]
  selectedTopicIds: string[]
  selectedTopicLabels: string[]
  topicQuery: string
  setTopicQuery: Dispatch<SetStateAction<string>>
  setSelectedTopicIds: Dispatch<SetStateAction<string[]>>
  cronPresets: CronPreset[]
  createForm: ResearchPageCreateForm
  setCreateForm: Dispatch<SetStateAction<ResearchPageCreateForm>>
  stageRounds: Array<{ stageIndex: number; rounds: number }>
  setStageRounds: Dispatch<SetStateAction<Array<{ stageIndex: number; rounds: number }>>>
  getStageRoundLabel: (stageIndex: number) => string
  onCreateTasks: () => Promise<void>
  submitting: boolean
}) {
  const orderedTopics = useMemo(
    () =>
      [...topics].sort((left, right) => {
        const leftLabel = getTopicLocalizedPair(
          left.localization,
          'name',
          preference,
          left.nameZh,
          left.nameEn ?? left.nameZh,
        ).primary
        const rightLabel = getTopicLocalizedPair(
          right.localization,
          'name',
          preference,
          right.nameZh,
          right.nameEn ?? right.nameZh,
        ).primary
        return leftLabel.localeCompare(rightLabel)
      }),
    [preference, topics],
  )

  const visibleTopics = useMemo(() => {
    const query = topicQuery.trim().toLowerCase()
    if (!query) return orderedTopics

    return orderedTopics.filter((topic) => {
      const localized = getTopicLocalizedPair(
        topic.localization,
        'name',
        preference,
        topic.nameZh,
        topic.nameEn ?? topic.nameZh,
      ).primary

      return [localized, topic.nameZh, topic.nameEn ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [orderedTopics, preference, topicQuery])

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((current) =>
      current.includes(topicId)
        ? current.filter((value) => value !== topicId)
        : [...current, topicId],
    )
  }

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-black/8 bg-[linear-gradient(180deg,#ffffff_0%,#fcfbf9_100%)] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">
            {t('research.windowEyebrow')}
          </div>
          <h3 className="mt-2 text-[22px] font-semibold text-black">{t('research.createTitle')}</h3>
          <p className="mt-2 max-w-[560px] text-[12px] leading-6 text-black/58">
            {selectedTopicIds.length > 0
              ? t('research.selectionReady')
              : t('research.selectionEmpty')}
          </p>
        </div>

        <Link
          to="/settings?tab=pipeline"
          className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-[12px] text-black/64 transition hover:border-black/16 hover:text-black"
        >
          {t('research.settingsButton')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 rounded-[20px] bg-[var(--surface-soft)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] font-medium text-black">
            {t('research.selectedSummary', 'Selected topics')}
          </div>
          {selectedTopicIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedTopicIds([])}
              className="text-[12px] text-black/48 transition hover:text-black"
            >
              {t('research.clearSelection', 'Clear selection')}
            </button>
          ) : null}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {selectedTopicLabels.length > 0 ? (
            <>
              {selectedTopicLabels.slice(0, 6).map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-black/66"
                >
                  {label}
                </span>
              ))}
              {selectedTopicLabels.length > 6 ? (
                <span className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-black/44">
                  +{selectedTopicLabels.length - 6}
                </span>
              ) : null}
            </>
          ) : (
            <div className="text-[12px] leading-6 text-black/48">
              {t(
                'research.topicPoolHint',
                'Choose one or more topics below to schedule and launch them from the same workbench.',
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(360px,0.74fr)_minmax(0,1.26fr)] 2xl:grid-cols-[minmax(400px,0.72fr)_minmax(0,1.28fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-black/8 bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
                {renderTranslationTemplate(t, 'research.stepLabel', { step: 1 }, 'Step {step}')}
              </div>
              <div className="mt-1 text-[15px] font-semibold text-black">
                {t('research.stepTopicsTitle', 'Choose the topics for this orchestration run')}
              </div>
              <div className="mt-1 text-[14px] text-black/62">
                {renderTranslationTemplate(
                  t,
                  'research.topicPoolCount',
                  { count: topics.length },
                  '{count} topics',
                )}
              </div>
            </div>
            <div className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/58">
              {selectedTopicIds.length}
            </div>
          </div>

          <input
            value={topicQuery}
            onChange={(event) => setTopicQuery(event.target.value)}
            placeholder={t('research.topicSearchPlaceholder', 'Search topics')}
            className="mt-4 w-full rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-black outline-none placeholder:text-black/28"
          />

          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {visibleTopics.map((topic) => {
              const label = getTopicLocalizedPair(
                topic.localization,
                'name',
                preference,
                topic.nameZh,
                topic.nameEn ?? topic.nameZh,
              ).primary
              const selected = selectedTopicIds.includes(topic.id)

              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => toggleTopic(topic.id)}
                  className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
                    selected
                      ? 'border-black bg-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.08)]'
                      : 'border-black/8 bg-[var(--surface-soft)] text-black/72 hover:border-black/14 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium">{label}</div>
                      {(topic.nameEn ?? '') && topic.nameEn !== topic.nameZh ? (
                        <div
                          className={`mt-1 truncate text-[11px] ${
                            selected ? 'text-white/74' : 'text-black/40'
                          }`}
                        >
                          {topic.nameEn}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={`mt-0.5 h-4 w-4 rounded-full border ${
                        selected ? 'border-white/70 bg-white/18' : 'border-black/14 bg-white'
                      }`}
                    />
                  </div>
                </button>
              )
            })}
            {visibleTopics.length === 0 ? (
              <div className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-4 text-[12px] text-black/46">
                {t('research.topicSearchEmpty', 'No topics matched this query. Try another keyword.')}
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <article className="rounded-[24px] border border-black/8 bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
                    {renderTranslationTemplate(t, 'research.stepLabel', { step: 2 }, 'Step {step}')}
                  </div>
                  <div className="mt-1 text-[15px] font-semibold text-black">
                    {t('research.stepScheduleTitle', 'Set the schedule cadence')}
                  </div>
                  <p className="mt-1 text-[12px] leading-6 text-black/54">
                    {t(
                      'research.stepScheduleDescription',
                      'Choose a common cadence directly, and expand the advanced section only when you need to edit the raw expression.',
                    )}
                  </p>
                </div>
                <div className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/54">
                  {renderTranslationTemplate(
                    t,
                    'research.presetCount',
                    { count: cronPresets.length },
                    '{count} presets',
                  )}
                </div>
              </div>

            <div className="mt-4 grid gap-4">
              <label className="block">
                <div className="mb-2 text-[12px] text-black/56">{t('research.frequencyLabel')}</div>
                <div className="flex flex-wrap gap-2">
                  {cronPresets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() =>
                        setCreateForm((current) => ({
                          ...current,
                          cronExpression: preset.value,
                        }))
                      }
                      className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                        createForm.cronExpression === preset.value
                          ? 'bg-black text-white'
                          : 'bg-[var(--surface-soft)] text-black/58 hover:text-black'
                      }`}
                      title={preset.description}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <div className="mb-2 text-[12px] text-black/56">{t('research.actionLabel')}</div>
                  <select
                    value={createForm.action}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        action: event.target.value as TaskConfig['action'],
                      }))
                    }
                    className="w-full rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-black outline-none"
                  >
                    <option value="discover">{t('research.actionDiscover')}</option>
                    <option value="refresh">{t('research.actionRefresh')}</option>
                    <option value="sync">{t('research.actionSync')}</option>
                  </select>
                </label>

                <label className="block">
                  <div className="mb-2 text-[12px] text-black/56">{t('research.modeLabel')}</div>
                  <select
                    value={createForm.researchMode}
                    disabled={createForm.action !== 'discover'}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        researchMode: event.target.value as ResearchPageCreateForm['researchMode'],
                      }))
                    }
                    className="w-full rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-black outline-none disabled:cursor-not-allowed disabled:text-black/36"
                  >
                    <option value="duration">{t('research.modeDuration')}</option>
                    <option value="stage-rounds">{t('research.modeStageRounds')}</option>
                  </select>
                </label>
              </div>

              <details className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3">
                <summary className="cursor-pointer list-none text-[12px] font-medium text-black">
                  {t('research.advancedScheduleOptions', 'Open advanced scheduling options')}
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <label className="block">
                    <div className="mb-2 text-[12px] text-black/56">
                      {t('research.rawCronExpression', 'Raw cron expression')}
                    </div>
                    <input
                      value={createForm.cronExpression}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          cronExpression: event.target.value,
                        }))
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-[13px] text-black outline-none"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[12px] text-black/60">
                    <input
                      type="checkbox"
                      checked={createForm.enabled}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-black"
                    />
                    <span>
                      {createForm.enabled
                        ? t('research.enableOnCreate', 'Enable immediately after creation')
                        : t('research.createManualStart', 'Create now and enable manually later')}
                    </span>
                  </label>
                </div>
              </details>
            </div>
          </article>

          {createForm.action === 'discover' && createForm.researchMode === 'duration' ? (
            <article className="rounded-[24px] border border-black/8 bg-white px-4 py-4">
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
                  {renderTranslationTemplate(t, 'research.stepLabel', { step: 3 }, 'Step {step}')}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-black">
                  {t('research.durationSettingsTitle', 'Configure ongoing research mode')}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <div className="mb-2 text-[12px] text-black/56">{t('research.durationHoursLabel')}</div>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={createForm.durationHours}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        durationHours: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                    className="w-full rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-black outline-none"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-[12px] text-black/56">{t('research.cycleDelayLabel')}</div>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={createForm.cycleDelaySeconds}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        cycleDelaySeconds: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                    className="w-full rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-black outline-none"
                  />
                </label>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-black/48">
                {t('research.modeLegacyHint')}
              </p>
            </article>
          ) : null}

          {createForm.action === 'discover' && createForm.researchMode === 'stage-rounds' ? (
            <article className="rounded-[24px] border border-black/8 bg-white px-4 py-4">
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
                  {renderTranslationTemplate(t, 'research.stepLabel', { step: 3 }, 'Step {step}')}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-black">{t('research.stageRoundsLabel')}</div>
              </div>
              <div className="mt-3 max-h-[220px] space-y-3 overflow-y-auto pr-1">
                {stageRounds.map((item) => (
                  <label
                    key={item.stageIndex}
                    className="flex items-center justify-between gap-4 rounded-[18px] bg-[var(--surface-soft)] px-4 py-3"
                  >
                    <span className="text-[12px] text-black/66">
                      {getStageRoundLabel(item.stageIndex)}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={item.rounds}
                      onChange={(event) =>
                        setStageRounds((current) =>
                          current.map((round) =>
                            round.stageIndex === item.stageIndex
                              ? {
                                  ...round,
                                  rounds: Math.max(1, Number(event.target.value) || 1),
                                }
                              : round,
                          ),
                        )
                      }
                      className="h-9 w-16 rounded-full border border-black/10 bg-white px-3 text-center text-[13px] text-black outline-none"
                    />
                  </label>
                ))}
              </div>
            </article>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-black/6 pt-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-black/60">
                {renderTranslationTemplate(
                  t,
                  'research.summaryTopicsCount',
                  { count: selectedTopicIds.length },
                  '{count} topics',
                )}
              </span>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-black/60">
                {createForm.action === 'discover'
                  ? createForm.researchMode === 'duration'
                    ? formatDurationCompact(t, createForm.durationHours, createForm.cycleDelaySeconds)
                    : renderTranslationTemplate(
                        t,
                        'research.summaryStageRounds',
                        { count: stageRounds.reduce((sum, item) => sum + item.rounds, 0) },
                        'Stage rounds {count}',
                      )
                  : t(
                      createForm.action === 'refresh'
                        ? 'research.actionRefresh'
                        : 'research.actionSync',
                    )}
              </span>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-black/60">
                {createForm.enabled
                  ? t('research.summaryCreateEnabled', 'Create enabled')
                  : t('research.summaryCreatePaused', 'Create paused')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void onCreateTasks()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-[13px] font-medium text-white transition hover:bg-black/92 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t('research.createButton')}
            </button>
          </div>
        </section>
      </div>
    </article>
  )
}

function ResearchTaskWorkbenchCard({
  t,
  language,
  panel,
  onPanelChange,
  tasks,
  totalTasks,
  taskQuery,
  setTaskQuery,
  taskFilter,
  setTaskFilter,
  selectedTopicIds,
  selectedTask,
  busyAction,
  setSelectedTaskId,
  onRunTask,
  onToggleTask,
  onResetTask,
  onDeleteTask,
  taskDetail,
  detailLoading,
  formatTaskLabel,
  formatTaskProgress,
  formatRunSummary,
}: {
  t: Translate
  language: UiLanguage
  panel: TaskWorkbenchPanel
  onPanelChange: Dispatch<SetStateAction<TaskWorkbenchPanel>>
  tasks: TaskConfig[]
  totalTasks: number
  taskQuery: string
  setTaskQuery: Dispatch<SetStateAction<string>>
  taskFilter: TaskQueueFilter
  setTaskFilter: Dispatch<SetStateAction<TaskQueueFilter>>
  selectedTopicIds: string[]
  selectedTask: TaskConfig | null
  busyAction: string | null
  setSelectedTaskId: Dispatch<SetStateAction<string>>
  onRunTask: (taskId: string) => Promise<void>
  onToggleTask: (task: TaskConfig) => Promise<void>
  onResetTask: (taskId: string) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  taskDetail: TaskDetailResponse | null
  detailLoading: boolean
  formatTaskLabel: (task: TaskConfig) => string
  formatTaskProgress: (task: TaskConfig) => string
  formatRunSummary: (record: TaskDetailResponse['history'][number]) => string
}) {
  const tabs: Array<{ id: TaskWorkbenchPanel; label: string }> = [
    { id: 'queue', label: t('research.operationsQueueTab', 'Task queue') },
    { id: 'detail', label: t('research.operationsDetailTab', 'Current task') },
  ]

  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-black/8 bg-[linear-gradient(180deg,#ffffff_0%,#fcfbf9_100%)] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-[480px]">
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">
            {t('research.tasksEyebrow')}
          </div>
          <h3 className="mt-2 text-[22px] font-semibold text-black">
            {t('research.operationsTitle', 'Switch between queue and detail in one panel')}
          </h3>
          <p className="mt-2 text-[12px] leading-6 text-black/58">
            {panel === 'queue'
              ? t(
                  'research.operationsQueueDescription',
                  'Filter and run tasks first; once you open one, the same panel flips into its live detail view.',
                )
              : selectedTask
                ? formatTaskProgress(selectedTask)
                : t(
                    'research.operationsDetailDescription',
                    "This panel shows the selected task's research cadence, latest progress, and run receipts.",
                  )}
          </p>
        </div>

        <div className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/54">
          {panel === 'queue'
            ? tasks.length
            : selectedTask
              ? t('research.operationsDetailSelected', 'Task selected')
              : t('research.detailEmptyTitle')}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[22px] bg-[var(--surface-soft)] px-3 py-3">
        <div className="inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onPanelChange(tab.id)}
              className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                panel === tab.id
                  ? 'bg-black text-white'
                  : 'text-black/56 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {selectedTask ? (
          <button
            type="button"
            onClick={() => onPanelChange('detail')}
            className="max-w-full truncate rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-black/64 transition hover:border-black/16 hover:text-black"
            title={formatTaskLabel(selectedTask)}
          >
            {formatTaskLabel(selectedTask)}
          </button>
        ) : (
          <div className="text-[11px] text-black/46">
            {t('research.operationsSelectHint', 'Select a task from the queue to open its run detail here.')}
          </div>
        )}
      </div>

      <div className="mt-4 min-h-0 flex-1">
        {panel === 'queue' ? (
          <ResearchTaskQueueCard
            t={t}
            language={language}
            tasks={tasks}
            totalTasks={totalTasks}
            taskQuery={taskQuery}
            setTaskQuery={setTaskQuery}
            taskFilter={taskFilter}
            setTaskFilter={setTaskFilter}
            selectedTopicIds={selectedTopicIds}
            selectedTask={selectedTask}
            busyAction={busyAction}
            setSelectedTaskId={setSelectedTaskId}
            formatTaskLabel={formatTaskLabel}
            onInspectTask={() => onPanelChange('detail')}
            onRunTask={onRunTask}
            onToggleTask={onToggleTask}
            onResetTask={onResetTask}
            onDeleteTask={onDeleteTask}
            formatTaskProgress={formatTaskProgress}
            embedded
          />
        ) : (
          <ResearchTaskDetailCard
            t={t}
            language={language}
            selectedTask={selectedTask}
            taskDetail={taskDetail}
            detailLoading={detailLoading}
            formatTaskLabel={formatTaskLabel}
            formatTaskProgress={formatTaskProgress}
            formatRunSummary={formatRunSummary}
            embedded
          />
        )}
      </div>
    </article>
  )
}

function ResearchTaskQueueCard({
  t,
  language,
  tasks,
  totalTasks,
  taskQuery,
  setTaskQuery,
  taskFilter,
  setTaskFilter,
  selectedTopicIds,
  selectedTask,
  busyAction,
  setSelectedTaskId,
  formatTaskLabel,
  onInspectTask,
  onRunTask,
  onToggleTask,
  onResetTask,
  onDeleteTask,
  formatTaskProgress,
  embedded = false,
}: {
  t: Translate
  language: UiLanguage
  tasks: TaskConfig[]
  totalTasks: number
  taskQuery: string
  setTaskQuery: Dispatch<SetStateAction<string>>
  taskFilter: TaskQueueFilter
  setTaskFilter: Dispatch<SetStateAction<TaskQueueFilter>>
  selectedTopicIds: string[]
  selectedTask: TaskConfig | null
  busyAction: string | null
  setSelectedTaskId: Dispatch<SetStateAction<string>>
  formatTaskLabel: (task: TaskConfig) => string
  onInspectTask?: (taskId: string) => void
  onRunTask: (taskId: string) => Promise<void>
  onToggleTask: (task: TaskConfig) => Promise<void>
  onResetTask: (taskId: string) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  formatTaskProgress: (task: TaskConfig) => string
  embedded?: boolean
}) {
  const filters: Array<{ id: TaskQueueFilter; label: string }> = [
    { id: 'all', label: t('research.queueFilterAll', 'All') },
    { id: 'running', label: t('research.queueFilterRunning', 'Running') },
    { id: 'selected', label: t('research.queueFilterSelected', 'Selected topics') },
  ]
  const primaryTasks = tasks.filter((task) => !isTaskDormant(task) || task.id === selectedTask?.id)
  const archivedTasks = tasks.filter((task) => isTaskDormant(task) && task.id !== selectedTask?.id)
  const archiveOpen = primaryTasks.length === 0 || Boolean(taskQuery.trim()) || taskFilter !== 'all'

  const renderTaskCards = (taskList: TaskConfig[], archived = false) =>
    taskList.map((task) => {
      const statusMeta = getTaskStatusMeta(task, t)
      const selected = selectedTask?.id === task.id
      const lastRun = formatTaskMoment(
        task.progress?.lastRunAt ?? task.progress?.startedAt ?? null,
        language,
      )
      const modeLabel = getTaskDisplayModeLabel(task, t, true)
      const displayName = formatTaskLabel(task)

      return (
        <article
          key={task.id}
          className={`rounded-[24px] border px-4 py-4 transition ${
            selected
              ? 'border-black bg-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.10)]'
              : archived
                ? 'border-black/8 bg-white text-black'
                : 'border-black/8 bg-[var(--surface-soft)] text-black'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedTaskId(task.id)
              onInspectTask?.(task.id)
            }}
            className="block w-full text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{displayName}</div>
                <div
                  className={`mt-2 text-[12px] leading-6 ${
                    selected ? 'text-white/76' : 'text-black/56'
                  }`}
                >
                  {formatTaskProgress(task)}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] ${
                  selected ? 'bg-white/14 text-white' : statusMeta.tone
                }`}
              >
                {statusMeta.label}
              </span>
            </div>

            <div
              className={`mt-3 flex flex-wrap items-center gap-2 text-[11px] ${
                selected ? 'text-white/68' : 'text-black/42'
              }`}
            >
              <span className="rounded-full border border-current/15 px-2.5 py-1">
                {modeLabel}
              </span>
              <span className="rounded-full border border-current/15 px-2.5 py-1">
                {task.cronExpression}
              </span>
              <span>
                {t('research.lastRunLabel', 'Last run')}:
                {' '}
                {lastRun ?? t('research.waitingFirstRun')}
              </span>
            </div>
          </button>

          <div className="mt-3.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onRunTask(task.id)}
              disabled={busyAction === `run:${task.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] transition ${
                selected
                  ? 'bg-white text-black hover:bg-white/92'
                  : 'bg-white text-black/70 hover:text-black'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {busyAction === `run:${task.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              {t('research.runButton')}
            </button>

            <button
              type="button"
              onClick={() => void onToggleTask(task)}
              disabled={busyAction === `toggle:${task.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] transition ${
                selected
                  ? 'border-white/20 text-white hover:border-white/34'
                  : 'border-black/10 text-black/62 hover:text-black'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {busyAction === `toggle:${task.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PauseCircle className="h-3.5 w-3.5" />
              )}
              {task.enabled ? t('research.pauseButton') : t('research.resumeButton')}
            </button>

            <button
              type="button"
              onClick={() => void onResetTask(task.id)}
              disabled={busyAction === `reset:${task.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] transition ${
                selected
                  ? 'border-white/20 text-white hover:border-white/34'
                  : 'border-black/10 text-black/62 hover:text-black'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {busyAction === `reset:${task.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {t('research.resetButton')}
            </button>

            <button
              type="button"
              onClick={() => void onDeleteTask(task.id)}
              disabled={busyAction === `delete:${task.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] transition ${
                selected
                  ? 'border-white/20 text-white hover:border-white/34'
                  : 'border-black/10 text-black/62 hover:text-black'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {busyAction === `delete:${task.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {t('research.deleteButton')}
            </button>
          </div>
        </article>
      )
    })

  return (
    <article
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-black/8 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]'
          : 'flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-black/8 bg-white px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:px-5 md:py-5'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">
            {t('research.tasksEyebrow')}
          </div>
          <h3 className="mt-2 text-[20px] font-semibold text-black">{t('research.tasksTitle')}</h3>
          {tasks.length !== totalTasks ? (
            <div className="mt-1 text-[12px] text-black/46">
              {renderTemplate(t('research.filteredTasksLabel', 'Showing {visible}/{total} tasks'), {
                visible: tasks.length,
                total: totalTasks,
              })}
            </div>
          ) : null}
        </div>
        <div className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/54">
          {tasks.length}
        </div>
      </div>

      <div className="mt-4 rounded-[22px] bg-[var(--surface-soft)] px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setTaskFilter(filter.id)}
              className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                taskFilter === filter.id
                  ? 'bg-black text-white'
                  : 'bg-white text-black/58 hover:text-black'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-[18px] bg-white px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
          <Search className="h-4 w-4 text-black/38" />
          <input
            value={taskQuery}
            onChange={(event) => setTaskQuery(event.target.value)}
            placeholder={t('research.queueSearchPlaceholder', 'Search tasks, topics, or schedule cadence')}
            className="w-full bg-transparent text-[13px] text-black outline-none placeholder:text-black/28"
          />
        </label>

        {taskFilter === 'selected' && selectedTopicIds.length === 0 ? (
          <div className="mt-3 text-[11px] leading-5 text-black/46">
            {t(
              'research.queueSelectedFocusHint',
              'Select topics on the left first to show only their matching tasks here.',
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {tasks.length === 0 ? (
          <div className="rounded-[24px] bg-[var(--surface-soft)] px-4 py-5 text-[13px] leading-7 text-black/56">
            {taskQuery.trim() || taskFilter !== 'all'
              ? t(
                  'research.queueEmptyFiltered',
                  'No tasks match the current filters. Switch back to "All" or try another keyword.',
                )
              : t('research.empty')}
          </div>
        ) : (
          <>
            {primaryTasks.length > 0 ? (
              renderTaskCards(primaryTasks)
            ) : (
              <div className="rounded-[24px] bg-[var(--surface-soft)] px-4 py-5 text-[13px] leading-7 text-black/56">
                {t(
                  'research.queuePrimaryEmpty',
                  'No active or recent tasks are in the main queue right now. Expand the archived list below if you need older paused tasks.',
                )}
              </div>
            )}

            {archivedTasks.length > 0 ? (
              <details
                open={archiveOpen}
                className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4"
              >
                <summary className="cursor-pointer list-none text-[13px] font-medium text-black">
                  {renderTemplate(
                    t('research.archivedTasksTitle', 'Archived paused tasks ({count})'),
                    { count: archivedTasks.length },
                  )}
                </summary>
                <p className="mt-2 text-[12px] leading-6 text-black/50">
                  {t(
                    'research.archivedTasksHint',
                    'Older paused tasks are folded here so the main queue can stay focused on research that is still active or recently touched.',
                  )}
                </p>
                <div className="mt-3 space-y-3">{renderTaskCards(archivedTasks, true)}</div>
              </details>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}

function ResearchTaskDetailCard({
  t,
  language,
  selectedTask,
  taskDetail,
  detailLoading,
  formatTaskLabel,
  formatTaskProgress,
  formatRunSummary,
  embedded = false,
}: {
  t: Translate
  language: UiLanguage
  selectedTask: TaskConfig | null
  taskDetail: TaskDetailResponse | null
  detailLoading: boolean
  formatTaskLabel: (task: TaskConfig) => string
  formatTaskProgress: (task: TaskConfig) => string
  formatRunSummary: (record: TaskDetailResponse['history'][number]) => string
  embedded?: boolean
}) {
  const detail =
    selectedTask && taskDetail?.task.id === selectedTask.id ? taskDetail : null
  const progress = detail?.progress ?? selectedTask?.progress ?? null
  const statusMeta = selectedTask ? getTaskStatusMeta(selectedTask, t) : null
  const lastRun = formatTaskMoment(progress?.lastRunAt ?? progress?.startedAt ?? null, language)
  const stageValue =
    progress != null ? `${progress.currentStage} / ${progress.totalStages}` : '--'
  const progressValue =
    progress?.researchMode === 'duration'
      ? renderTranslationTemplate(
          t,
          'research.durationHoursCompact',
          { hours: progress.durationHours ?? selectedTask?.options?.durationHours ?? 0 },
          '{hours}h',
        )
      : progress != null
        ? `${progress.currentStageRuns} / ${progress.currentStageTargetRuns}`
        : '--'

  return (
    <article
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-black/8 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]'
          : 'flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-black/8 bg-white px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:px-5 md:py-5'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">
            {t('research.detailEyebrow')}
          </div>
          <h3 className="mt-2 text-[20px] font-semibold text-black">
            {selectedTask ? formatTaskLabel(selectedTask) : t('research.detailEmptyTitle')}
          </h3>
          <p className="mt-2 text-[13px] leading-7 text-black/56">
            {selectedTask
              ? formatTaskProgress(selectedTask)
              : t(
                  'research.detailEmpty',
                  'Select an orchestration task from the task queue to see its research cadence, run summary, and history receipts here.',
                )}
          </p>
        </div>
        {statusMeta ? (
          <span className={`rounded-full px-3 py-1.5 text-[11px] ${statusMeta.tone}`}>
            {statusMeta.label}
          </span>
        ) : null}
      </div>

      {!selectedTask ? (
        <div className="mt-5 flex-1 rounded-[24px] bg-[var(--surface-soft)] px-4 py-5 text-[13px] leading-7 text-black/56">
          {t(
            'research.detailEmpty',
            'Select an orchestration task from the task queue to see its research cadence, run summary, and history receipts here.',
          )}
        </div>
      ) : (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="grid gap-3 md:grid-cols-4">
            <InfoStat label={t('research.detailStageLabel')} value={stageValue} />
            <InfoStat label={t('research.detailProgressLabel')} value={progressValue} />
            <InfoStat
              label={t('research.detailDiscoveredLabel')}
              value={String(progress?.discoveredPapers ?? 0)}
            />
            <InfoStat
              label={t('research.detailGeneratedLabel')}
              value={String(progress?.generatedContents ?? 0)}
            />
          </div>

          <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.18fr)] 2xl:grid-cols-[minmax(380px,0.8fr)_minmax(0,1.2fr)]">
            <section className="rounded-[24px] bg-[var(--surface-soft)] px-4 py-4">
              <div className="grid gap-3">
                <MetaRow
                  label={t('research.frequencyLabel')}
                  value={selectedTask.cronExpression}
                />
                <MetaRow
                  label={t('research.actionLabel')}
                  value={
                    selectedTask.action === 'discover'
                      ? t('research.actionDiscover')
                      : selectedTask.action === 'refresh'
                        ? t('research.actionRefresh')
                        : t('research.actionSync')
                  }
                />
                <MetaRow
                  label={t('research.modeLabel')}
                  value={
                    selectedTask.action === 'discover'
                      ? getTaskDisplayModeLabel(selectedTask, t, true)
                      : '--'
                  }
                />
                <MetaRow
                  label={t('research.lastRunLabel', 'Last run')}
                  value={lastRun ?? t('research.waitingFirstRun')}
                />
              </div>

              <div className="mt-4 border-t border-black/6 pt-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">
                  {t('research.tasksEyebrow')}
                </div>
                <div className="mt-2 text-[13px] leading-7 text-black/60">
                  {selectedTask.researchMode === 'duration'
                    ? formatDurationCompact(
                        t,
                        selectedTask.options?.durationHours ?? 0,
                        Math.max(
                          1,
                          Math.round((selectedTask.options?.cycleDelayMs ?? 0) / 1000),
                        ),
                      )
                    : (selectedTask.options?.stageRounds ?? [])
                        .map(
                          (item) =>
                            `${renderTemplate(t('research.stageLabelTemplate'), {
                              stage: item.stageIndex,
                            })} x ${item.rounds}`,
                        )
                        .join(' / ') || '--'}
                </div>
              </div>
            </section>

            <section className="flex min-h-0 flex-col rounded-[24px] border border-black/8 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-medium text-black">{t('research.historyTitle')}</div>
                {detailLoading ? <Loader2 className="h-4 w-4 animate-spin text-black/42" /> : null}
              </div>
              <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {!detailLoading && (detail?.history.length ?? 0) === 0 ? (
                  <div className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-4 text-[12px] text-black/48">
                    {t('research.historyEmpty')}
                  </div>
                ) : (
                  detail?.history.map((record) => (
                    <article
                      key={record.id}
                      className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[12px] font-medium text-black">
                          {formatRunSummary(record)}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] ${
                            record.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700'
                              : record.status === 'failed'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {formatHistoryStatus(record.status, t)}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-black/42">
                        {formatTaskMoment(record.runAt, language)}
                      </div>
                      {record.summary ? (
                        <p className="mt-2 text-[12px] leading-6 text-black/56">{record.summary}</p>
                      ) : null}
                      {record.error ? (
                        <p className="mt-2 text-[12px] leading-6 text-red-600">{record.error}</p>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </article>
  )
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-black/34">{label}</div>
      <div className="mt-2 text-[18px] font-semibold text-black">{value}</div>
    </article>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <span className="text-black/42">{label}</span>
      <span className="text-right text-black/70">{value}</span>
    </div>
  )
}

function StatCard({
  label,
  value,
  compact = false,
}: {
  label: string
  value: number | string
  compact?: boolean
}) {
  return (
    <article className={`rounded-[24px] bg-[var(--surface-soft)] ${compact ? 'px-4 py-4' : 'px-5 py-5'}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">{label}</div>
      <div className={`font-semibold text-black ${compact ? 'mt-2 text-[22px]' : 'mt-3 text-[24px]'}`}>
        {value}
      </div>
    </article>
  )
}

export default ResearchPage
