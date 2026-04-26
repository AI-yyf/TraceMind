import { useCallback, useEffect, useState } from 'react'
import { BarChart3, CheckCircle, Clock, Loader2, Pause, Play, RotateCcw, Target, Trash2, XCircle } from 'lucide-react'

import { ConfirmDialog } from '@/components/UI'
import { apiGet, buildApiUrl } from '@/utils/api'
import {
  assertTaskCronPresetsContract,
  assertTaskDetailResponseContract,
  assertTaskListContract,
  assertTaskTopicsContract,
} from '@/utils/contracts'

interface StageProgress {
  taskId: string
  topicId: string
  topicName: string
  currentStage: number
  totalStages: number
  stageProgress: number
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt: string | null
  lastRunResult: 'success' | 'failed' | 'partial' | null
  discoveredPapers: number
  promotedPapers: number
  pendingPapers: number
  status: 'active' | 'paused' | 'completed' | 'failed'
}

interface Task {
  id: string
  name: string
  cronExpression: string
  enabled: boolean
  topicId?: string
  action: 'discover' | 'refresh' | 'sync'
  options?: {
    maxResults?: number
    stageIndex?: number
    maxIterations?: number
  }
  progress?: StageProgress | null
}

interface ExecutionRecord {
  id: string
  taskId: string
  runAt: string
  duration: number
  status: 'success' | 'failed' | 'partial'
  stageIndex: number
  papersDiscovered: number
  papersPromoted: number
  papersMerged: number
  error?: string
  summary: string
}

interface CronPreset {
  label: string
  value: string
  description: string
}

type TaskApiResponse = {
  id: string
  name: string
  cronExpression: string
  enabled: boolean
  topicId?: string
  action: 'discover' | 'refresh' | 'sync'
  options?: {
    maxResults?: number
    stageIndex?: number
    maxIterations?: number
    durationHours?: number
    cycleDelayMs?: number
    stageRounds?: Array<{ stageIndex: number; rounds: number }>
  }
  progress?: {
    taskId: string
    topicId: string
    topicName: string
    currentStage: number
    totalStages: number
    stageProgress: number
    totalRuns: number
    successfulRuns: number
    failedRuns: number
    lastRunAt: string | null
    lastRunResult: 'success' | 'failed' | 'partial' | null
    discoveredPapers: number
    admittedPapers: number
    status: 'active' | 'paused' | 'completed' | 'failed'
  } | null
}

type TaskDetailApiResponse = {
  task: TaskApiResponse
  progress: TaskApiResponse['progress']
  history: Array<{
    id: string
    taskId: string
    runAt: string
    duration: number
    status: 'success' | 'failed' | 'partial'
    stageIndex: number
    papersDiscovered: number
    papersPromoted?: number
    papersAdmitted?: number
    papersMerged?: number
    error?: string
    summary: string
  }>
}

function mapStageProgress(progress: TaskApiResponse['progress']): StageProgress | null {
  if (!progress) return null
  return {
    taskId: progress.taskId,
    topicId: progress.topicId,
    topicName: progress.topicName,
    currentStage: progress.currentStage,
    totalStages: progress.totalStages,
    stageProgress: progress.stageProgress,
    totalRuns: progress.totalRuns,
    successfulRuns: progress.successfulRuns,
    failedRuns: progress.failedRuns,
    lastRunAt: progress.lastRunAt,
    lastRunResult: progress.lastRunResult,
    discoveredPapers: progress.discoveredPapers,
    promotedPapers: progress.admittedPapers,
    pendingPapers: 0,
    status: progress.status,
  }
}

function mapTask(task: TaskApiResponse): Task {
  return {
    id: task.id,
    name: task.name,
    cronExpression: task.cronExpression,
    enabled: task.enabled,
    topicId: task.topicId,
    action: task.action,
    options: task.options,
    progress: mapStageProgress(task.progress),
  }
}

function mapExecutionRecord(record: TaskDetailApiResponse['history'][number]): ExecutionRecord {
  return {
    id: record.id,
    taskId: record.taskId,
    runAt: record.runAt,
    duration: record.duration,
    status: record.status,
    stageIndex: record.stageIndex,
    papersDiscovered: record.papersDiscovered,
    papersPromoted: record.papersPromoted ?? record.papersAdmitted ?? 0,
    papersMerged: record.papersMerged ?? 0,
    error: record.error,
    summary: record.summary,
  }
}

const actionLabels = {
  discover: '论文发现',
  refresh: '数据刷新',
  sync: '数据同步',
}

const actionColors = {
  discover: 'bg-blue-100 text-blue-700',
  refresh: 'bg-green-100 text-green-700',
  sync: 'bg-amber-100 text-amber-700',
}

const statusColors = {
  active: 'text-green-600',
  paused: 'text-gray-400',
  completed: 'text-amber-600',
  failed: 'text-red-600',
}

export function TaskScheduler() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [topics, setTopics] = useState<{ id: string; nameZh: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runningTask, setRunningTask] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [cronPresets, setCronPresets] = useState<CronPreset[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskDetail, setTaskDetail] = useState<{ progress?: StageProgress; history?: ExecutionRecord[] } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [newTask, setNewTask] = useState<Partial<Task>>({
    name: '',
    cronExpression: '0 8 * * *',
    enabled: true,
    action: 'discover',
    topicId: undefined,
    options: {},
  })
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apiGet<unknown>('/api/tasks')
      assertTaskListContract(data)
      setTasks(data.map(mapTask))
    } catch {
      setError('获取任务列表失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTopics = useCallback(async () => {
    try {
      const data = await apiGet<unknown>('/api/tasks/topics')
      assertTaskTopicsContract(data)
      setTopics(data)
    } catch {
      // Topics fetch failed - silently continue
    }
  }, [])

  const fetchCronPresets = useCallback(async () => {
    try {
      const data = await apiGet<unknown>('/api/tasks/cron-expressions')
      assertTaskCronPresetsContract(data)
      setCronPresets(data)
    } catch {
      // Cron presets fetch failed - silently continue
    }
  }, [])

  const fetchTaskDetail = useCallback(async (taskId: string) => {
    setLoadingDetail(true)
    try {
      const data = await apiGet<unknown>(`/api/tasks/${taskId}`)
      assertTaskDetailResponseContract(data)
      setTaskDetail({
        progress: mapStageProgress(data.progress) ?? undefined,
        history: data.history.map(mapExecutionRecord),
      })
    } catch {
      // Task detail fetch failed - silently continue
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    void fetchTasks()
    void fetchTopics()
    void fetchCronPresets()
  }, [fetchCronPresets, fetchTasks, fetchTopics])

  async function handleCreateTask() {
    if (!newTask.name || !newTask.cronExpression) {
      setError('请填写任务名称和调度节奏。')
      return
    }

    try {
      const response = await fetch(buildApiUrl('/api/tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `task-${Date.now()}`,
          name: newTask.name,
          cronExpression: newTask.cronExpression,
          enabled: newTask.enabled ?? true,
          action: newTask.action ?? 'discover',
          topicId: newTask.topicId,
          options: newTask.options ?? {},
        }),
      })

      if (!response.ok) throw new Error('create_failed')

      await fetchTasks()
      setShowModal(false)
      setNewTask({
        name: '',
        cronExpression: '0 8 * * *',
        enabled: true,
        action: 'discover',
      })
      setError(null)
    } catch {
      setError('创建任务失败。')
    }
  }

  async function handleToggleTask(taskId: string, enabled: boolean) {
    try {
      const response = await fetch(buildApiUrl(`/api/tasks/${taskId}/toggle`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!response.ok) throw new Error('toggle_failed')
      await fetchTasks()
    } catch {
      setError('切换任务状态失败。')
    }
  }

  async function handleDeleteTask(taskId: string) {
    setConfirmState({
      isOpen: true,
      title: '删除确认',
      message: '确定要删除这个任务吗？此操作无法撤销。',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }))
        try {
          const response = await fetch(buildApiUrl(`/api/tasks/${taskId}`), { method: 'DELETE' })
          if (!response.ok) throw new Error('delete_failed')
          setTasks((current) => current.filter((task) => task.id !== taskId))
          if (selectedTask?.id === taskId) {
            setSelectedTask(null)
            setTaskDetail(null)
          }
        } catch {
          setError('删除任务失败。')
        }
      },
    })
  }

  async function handleRunTask(taskId: string, options?: { forceStage?: number }) {
    setRunningTask(taskId)
    try {
      const response = await fetch(buildApiUrl(`/api/tasks/${taskId}/run`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      })
      if (!response.ok) throw new Error('run_failed')
      await fetchTasks()
      await fetchTaskDetail(taskId)
    } catch {
      setError('执行任务失败。')
    } finally {
      setRunningTask(null)
    }
  }

  async function handleResetTask(taskId: string) {
    setConfirmState({
      isOpen: true,
      title: '重置确认',
      message: '确定要重置任务进度吗？此操作无法撤销。',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }))
        try {
          const response = await fetch(buildApiUrl(`/api/tasks/${taskId}/reset`), { method: 'POST' })
          if (!response.ok) throw new Error('reset_failed')
          await fetchTasks()
          await fetchTaskDetail(taskId)
        } catch {
          setError('重置任务失败。')
        }
      },
    })
  }

  async function handleJumpToStage(taskId: string, stageIndex: number) {
    try {
      const response = await fetch(buildApiUrl(`/api/tasks/${taskId}/jump`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageIndex }),
      })
      if (!response.ok) throw new Error('jump_failed')
      await fetchTasks()
      await fetchTaskDetail(taskId)
    } catch {
      setError('跳转阶段失败。')
    }
  }

  function parseCron(expression: string) {
    return cronPresets.find((preset) => preset.value === expression)?.description ?? expression
  }

  function formatDuration(ms: number) {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60_000).toFixed(1)}m`
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString(
      typeof navigator !== 'undefined' ? navigator.language : undefined,
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-black/45" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile value={tasks.length} label="总任务数" />
        <StatTile value={tasks.filter((task) => task.progress?.status === 'active').length} label="进行中" />
        <StatTile value={tasks.reduce((sum, task) => sum + (task.progress?.discoveredPapers || 0), 0)} label="发现论文" />
        <StatTile value={tasks.reduce((sum, task) => sum + (task.progress?.totalRuns || 0), 0)} label="总执行次数" />
      </div>

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-black/10 bg-[var(--surface-soft)] py-12 text-center text-black/52">
            <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>当前没有定时任务。</p>
            <button onClick={() => setShowModal(true)} className="mt-4 text-[var(--accent-ink)] transition hover:text-black">
              创建第一个任务
            </button>
          </div>
        ) : (
          tasks.map((task) => {
            const progress = task.progress

            return (
              <div
              key={task.id}
              className={`cursor-pointer rounded-[24px] border-2 bg-white transition-all ${
                selectedTask?.id === task.id ? 'border-[#f59e0b]/45 shadow-[0_12px_28px_rgba(15,23,42,0.08)]' : 'border-black/8 hover:border-black/16'
              }`}
              onClick={() => {
                setSelectedTask(task)
                void fetchTaskDetail(task.id)
              }}
            >
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-black">{task.name}</h3>
                    <span className={`rounded-full px-2 py-1 text-xs ${actionColors[task.action]}`}>{actionLabels[task.action]}</span>
                    {task.progress && (
                      <span className={`flex items-center gap-1 text-xs ${statusColors[task.progress.status]}`}>
                        {task.progress.status === 'active' && <CheckCircle className="h-3 w-3" />}
                        {task.progress.status === 'active'
                          ? '进行中'
                          : task.progress.status === 'completed'
                            ? '已完成'
                            : task.progress.status === 'paused'
                              ? '已暂停'
                              : '失败'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-black/50">
                    调度规则：{parseCron(task.cronExpression)}
                  </p>
                  {task.topicId && <p className="mt-1 text-xs text-black/40">主题：{topics.find((item) => item.id === task.topicId)?.nameZh || task.topicId}</p>}
                </div>

                {progress && (
                  <div className="hidden items-center gap-6 text-sm md:flex">
                    <InlineStat value={`${progress.currentStage}/${progress.totalStages}`} label="当前阶段" />
                    <InlineStat value={progress.discoveredPapers} label="发现论文" accent="text-blue-600" />
                    <InlineStat value={progress.promotedPapers} label="晋升论文" accent="text-green-600" />
                  </div>
                )}

                <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => void handleRunTask(task.id)} disabled={runningTask === task.id} className="rounded-full p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50" title="立即执行">
                    {runningTask === task.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                  </button>
                  <button onClick={() => void handleToggleTask(task.id, !task.enabled)} className={`rounded-full p-2 ${task.enabled ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`} title={task.enabled ? '暂停' : '启用'}>
                    {task.enabled ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                  <button onClick={() => void handleDeleteTask(task.id)} className="rounded-full p-2 text-red-600 hover:bg-red-50" title="删除">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {progress && (
                <div className="px-4 pb-4">
                  <div className="mb-2 flex items-center gap-2">
                    {Array.from({ length: progress.totalStages }).map((_, index) => (
                      <div key={index} className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full transition-all ${
                            index + 1 < progress.currentStage ? 'bg-green-500' : index + 1 === progress.currentStage ? 'bg-amber-500' : 'bg-gray-200'
                          }`}
                          style={{ width: index + 1 === progress.currentStage ? `${progress.stageProgress}%` : '100%' }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-black/48">
                    <span>阶段 {progress.currentStage} · 进度 {progress.stageProgress}%</span>
                    <span>
                      执行 {progress.totalRuns} 次 · 成功率 {progress.totalRuns > 0 ? Math.round((progress.successfulRuns / progress.totalRuns) * 100) : 0}%
                    </span>
                  </div>
                </div>
              )}
              </div>
            )
          })
        )}
      </div>

      {selectedTask && (
        <div className="rounded-[24px] border border-black/10 bg-white p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-black">
            <BarChart3 className="h-5 w-5" />
            {selectedTask.name} · 任务详情
          </h3>

          {loadingDetail ? (
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          ) : taskDetail?.progress && (
            (() => {
              const detailProgress = taskDetail.progress

              return (
                <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <DetailMetric label="当前阶段" value={`${detailProgress.currentStage} / ${detailProgress.totalStages}`} />
                <DetailMetric label="发现论文" value={detailProgress.discoveredPapers} accent="text-blue-600" />
                <DetailMetric label="晋升论文" value={detailProgress.promotedPapers} accent="text-green-600" />
                <DetailMetric label="成功率" value={`${detailProgress.totalRuns > 0 ? Math.round((detailProgress.successfulRuns / detailProgress.totalRuns) * 100) : 0}%`} accent="text-amber-600" />
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => void handleRunTask(selectedTask.id)} disabled={runningTask === selectedTask.id} className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
                  <Play className="h-4 w-4" />
                  立即执行
                </button>
                <button onClick={() => void handleResetTask(selectedTask.id)} className="flex items-center gap-2 rounded-full border border-black/10 bg-[var(--surface-soft)] px-4 py-2 text-black/70 hover:border-black/20">
                  <RotateCcw className="h-4 w-4" />
                  重置进度
                </button>
                <select onChange={(event) => { const stage = Number.parseInt(event.target.value, 10); if (stage) void handleJumpToStage(selectedTask.id, stage) }} className="rounded-full border border-black/10 bg-white px-4 py-2 text-black/72 outline-none" value="">
                  <option value="">跳转到阶段…</option>
                  {Array.from({ length: detailProgress.totalStages }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      阶段 {index + 1}
                      {index + 1 < detailProgress.currentStage ? '（已完成）' : index + 1 === detailProgress.currentStage ? '（当前）' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {taskDetail.history && taskDetail.history.length > 0 && (
                <div>
                  <h4 className="mb-3 font-medium text-black">执行历史</h4>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {taskDetail.history.slice().reverse().map((record) => (
                      <div key={record.id} className={`rounded-[18px] border p-3 ${record.status === 'success' ? 'border-green-200 bg-green-50' : record.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {record.status === 'success' ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                            <span className="font-medium">阶段 {record.stageIndex}</span>
                          </div>
                          <div className="text-sm text-black/50">
                            {formatDate(record.runAt)} · {formatDuration(record.duration)}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-black/64">
                          {record.summary}
                          {record.papersDiscovered > 0 && (
                            <span className="ml-2">
                              +{record.papersDiscovered} 发现
                              {record.papersPromoted > 0 && ` · +${record.papersPromoted} 晋升`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </div>
              )
            })()
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
            <h3 className="mb-4 text-xl font-semibold text-black">新建定时任务</h3>

            <div className="space-y-4">
              <Field label="任务名称">
                <input type="text" value={newTask.name || ''} onChange={(event) => setNewTask({ ...newTask, name: event.target.value })} placeholder="例如：每日论文发现" className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none" />
              </Field>

              <Field label="调度节奏">
                <select value={newTask.cronExpression || '0 8 * * *'} onChange={(event) => setNewTask({ ...newTask, cronExpression: event.target.value })} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none">
                  {cronPresets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="执行动作">
                <select value={newTask.action || 'discover'} onChange={(event) => setNewTask({ ...newTask, action: event.target.value as Task['action'] })} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none">
                  <option value="discover">论文发现（渐进式追踪）</option>
                  <option value="refresh">数据刷新</option>
                  <option value="sync">数据同步</option>
                </select>
              </Field>

              <Field label="关联主题（可选）">
                <select value={newTask.topicId || ''} onChange={(event) => setNewTask({ ...newTask, topicId: event.target.value || undefined })} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none">
                  <option value="">不关联特定主题</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.nameZh}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div className="text-sm text-amber-800">
                    <div className="font-medium">研究推进说明</div>
                    <ul className="mt-1 space-y-1 text-amber-700">
                      <li>系统会自动在当前阶段多轮执行。</li>
                      <li>发现足够论文后会推进到下一阶段。</li>
                      <li>你可以随时跳转指定阶段。</li>
                      <li>也可以重置任务后重新开始。</li>
                    </ul>
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={newTask.enabled ?? true} onChange={(event) => setNewTask({ ...newTask, enabled: event.target.checked })} className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-black/68">创建后立即启用</span>
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-full border border-black/10 px-4 py-2.5 text-black/70 hover:bg-[var(--surface-soft)]">
                取消
              </button>
              <button onClick={() => void handleCreateTask()} className="flex-1 rounded-full border border-[#f59e0b]/35 bg-[var(--surface-accent)] px-4 py-2.5 text-[var(--accent-ink)] hover:shadow-[0_10px_24px_rgba(245,158,11,0.08)]">
                创建任务
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        variant="danger"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[20px] border border-black/10 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="text-2xl font-bold text-black">{value}</div>
      <div className="text-sm text-black/52">{label}</div>
    </div>
  )
}

function InlineStat({ value, label, accent = 'text-gray-900' }: { value: number | string; label: string; accent?: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-black/46">{label}</div>
    </div>
  )
}

function DetailMetric({ label, value, accent = 'text-gray-900' }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-soft)] p-4">
      <div className="text-sm text-black/46">{label}</div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-black/64">{label}</label>
      {children}
    </div>
  )
}

export default TaskScheduler
