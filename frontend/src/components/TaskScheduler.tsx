import React, { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  BarChart3,
  RotateCcw,
  SkipForward,
  Target,
} from 'lucide-react'

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

const actionLabels = {
  discover: '论文发现',
  refresh: '数据刷新',
  sync: '数据同步',
}

const actionColors = {
  discover: 'bg-blue-100 text-blue-700',
  refresh: 'bg-green-100 text-green-700',
  sync: 'bg-purple-100 text-purple-700',
}

const statusColors = {
  active: 'text-green-600',
  paused: 'text-gray-400',
  completed: 'text-amber-600',
  failed: 'text-red-600',
}

export const TaskScheduler: React.FC = () => {
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

  useEffect(() => {
    fetchTasks()
    fetchTopics()
    fetchCronPresets()
  }, [])

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      if (data.success) {
        setTasks(data.data)
      }
    } catch (e) {
      setError('获取任务列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchTopics = async () => {
    try {
      const res = await fetch('/api/tasks/topics')
      const data = await res.json()
      if (data.success) {
        setTopics(data.data)
      }
    } catch (e) {
      console.error('Failed to fetch topics:', e)
    }
  }

  const fetchCronPresets = async () => {
    try {
      const res = await fetch('/api/tasks/cron-expressions')
      const data = await res.json()
      if (data.success) {
        setCronPresets(data.data)
      }
    } catch (e) {
      console.error('Failed to fetch cron presets:', e)
    }
  }

  const fetchTaskDetail = useCallback(async (taskId: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`)
      const data = await res.json()
      if (data.success) {
        setTaskDetail({
          progress: data.data.progress,
          history: data.data.history,
        })
      }
    } catch (e) {
      console.error('Failed to fetch task detail:', e)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const handleCreateTask = async () => {
    if (!newTask.name || !newTask.cronExpression) {
      setError('请填写任务名称和 cron 表达式')
      return
    }

    try {
      const task: Task = {
        id: `task-${Date.now()}`,
        name: newTask.name!,
        cronExpression: newTask.cronExpression!,
        enabled: newTask.enabled ?? true,
        action: newTask.action as 'discover' | 'refresh' | 'sync',
        topicId: newTask.topicId,
        options: newTask.options,
      }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      })

      const data = await res.json()

      if (data.success) {
        fetchTasks()
        setShowModal(false)
        setNewTask({
          name: '',
          cronExpression: '0 8 * * *',
          enabled: true,
          action: 'discover',
        })
        setError(null)
      } else {
        setError(data.error || '创建失败')
      }
    } catch (e) {
      setError('创建任务失败')
    }
  }

  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })

      const data = await res.json()

      if (data.success) {
        fetchTasks()
      }
    } catch (e) {
      setError('切换任务状态失败')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定要删除这个任务吗？')) return

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        setTasks(tasks.filter(t => t.id !== taskId))
        if (selectedTask?.id === taskId) {
          setSelectedTask(null)
          setTaskDetail(null)
        }
      }
    } catch (e) {
      setError('删除任务失败')
    }
  }

  const handleRunTask = async (taskId: string, options?: { forceStage?: number }) => {
    setRunningTask(taskId)

    try {
      const res = await fetch(`/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      })
      const data = await res.json()

      if (data.success) {
        alert(`任务执行完成！\n耗时：${data.data.duration || 0}ms\n状态：${data.data.success ? '成功' : '失败'}`)
        fetchTasks()
        fetchTaskDetail(taskId)
      } else {
        setError(data.error || '执行失败')
      }
    } catch (e) {
      setError('执行任务失败')
    } finally {
      setRunningTask(null)
    }
  }

  const handleResetTask = async (taskId: string) => {
    if (!confirm('确定要重置任务进度吗？')) return

    try {
      const res = await fetch(`/api/tasks/${taskId}/reset`, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        fetchTasks()
        fetchTaskDetail(taskId)
      }
    } catch (e) {
      setError('重置任务失败')
    }
  }

  const handleJumpToStage = async (taskId: string, stageIndex: number) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/jump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageIndex }),
      })
      const data = await res.json()

      if (data.success) {
        fetchTasks()
        fetchTaskDetail(taskId)
      }
    } catch (e) {
      setError('跳转失败')
    }
  }

  const parseCron = (expression: string): string => {
    const presets = cronPresets.find(p => p.value === expression)
    if (presets) return presets.description
    return expression
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <div className="text-2xl font-bold">{tasks.length}</div>
          <div className="text-sm opacity-80">总任务数</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <div className="text-2xl font-bold">{tasks.filter(t => t.progress?.status === 'active').length}</div>
          <div className="text-sm opacity-80">进行中</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
          <div className="text-2xl font-bold">
            {tasks.reduce((sum, t) => sum + (t.progress?.discoveredPapers || 0), 0)}
          </div>
          <div className="text-sm opacity-80">发现论文</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <div className="text-2xl font-bold">
            {tasks.reduce((sum, t) => sum + (t.progress?.totalRuns || 0), 0)}
          </div>
          <div className="text-sm opacity-80">总执行次数</div>
        </div>
      </div>

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无定时任务</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 text-amber-600 hover:text-amber-700"
            >
              创建第一个任务
            </button>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className={`bg-white rounded-xl border-2 transition-all cursor-pointer ${
                selectedTask?.id === task.id ? 'border-amber-500 shadow-lg' : 'border-gray-100 hover:border-gray-200'
              }`}
              onClick={() => {
                setSelectedTask(task)
                fetchTaskDetail(task.id)
              }}
            >
              <div className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{task.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs ${actionColors[task.action]}`}>
                      {actionLabels[task.action]}
                    </span>
                    {task.progress && (
                      <span className={`flex items-center gap-1 text-xs ${statusColors[task.progress.status]}`}>
                        {task.progress.status === 'active' && <CheckCircle className="w-3 h-3" />}
                        {task.progress.status === 'active' ? '进行中' :
                         task.progress.status === 'completed' ? '已完成' :
                         task.progress.status === 'paused' ? '已暂停' : '失败'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {parseCron(task.cronExpression)} • {task.cronExpression}
                  </p>
                  {task.topicId && (
                    <p className="text-xs text-gray-400 mt-1">
                      主题: {topics.find(t => t.id === task.topicId)?.nameZh || task.topicId}
                    </p>
                  )}
                </div>

                {task.progress && (
                  <div className="hidden md:flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-900">
                        {task.progress.currentStage}/{task.progress.totalStages}
                      </div>
                      <div className="text-xs text-gray-500">当前阶段</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">
                        {task.progress.discoveredPapers}
                      </div>
                      <div className="text-xs text-gray-500">发现论文</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">
                        {task.progress.promotedPapers}
                      </div>
                      <div className="text-xs text-gray-500">提升论文</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleRunTask(task.id)}
                    disabled={runningTask === task.id}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                    title="立即执行"
                  >
                    {runningTask === task.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                  </button>

                  <button
                    onClick={() => handleToggleTask(task.id, !task.enabled)}
                    className={`p-2 rounded-lg ${
                      task.enabled ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={task.enabled ? '暂停' : '启用'}
                  >
                    {task.enabled ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                  </button>

                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="删除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {task.progress && (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    {Array.from({ length: task.progress.totalStages }).map((_, i) => (
                      <div key={i} className="flex-1 h-2 rounded-full overflow-hidden bg-gray-100">
                        <div
                          className={`h-full transition-all ${
                            i + 1 < task.progress!.currentStage ? 'bg-green-500' :
                            i + 1 === task.progress!.currentStage ? 'bg-amber-500' : 'bg-gray-200'
                          }`}
                          style={{ width: i + 1 === task.progress!.currentStage ? `${task.progress!.stageProgress}%` : '100%' }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Stage {task.progress.currentStage} · 进度 {task.progress.stageProgress}%</span>
                    <span>执行 {task.progress.totalRuns} 次 · 成功率 {
                      task.progress.totalRuns > 0
                        ? Math.round((task.progress.successfulRuns / task.progress.totalRuns) * 100)
                        : 0
                    }%</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedTask && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {selectedTask.name} - 详细信息
          </h3>

          {loadingDetail ? (
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          ) : taskDetail?.progress && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">当前阶段</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {taskDetail.progress.currentStage} / {taskDetail.progress.totalStages}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">发现论文</div>
                  <div className="text-2xl font-bold text-blue-600">{taskDetail.progress.discoveredPapers}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">提升论文</div>
                  <div className="text-2xl font-bold text-green-600">{taskDetail.progress.promotedPapers}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">成功率</div>
                  <div className="text-2xl font-bold text-amber-600">
                    {taskDetail.progress.totalRuns > 0
                      ? Math.round((taskDetail.progress.successfulRuns / taskDetail.progress.totalRuns) * 100)
                      : 0}%
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleRunTask(selectedTask.id)}
                  disabled={runningTask === selectedTask.id}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  立即执行
                </button>
                <button
                  onClick={() => handleResetTask(selectedTask.id)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  重置进度
                </button>
                <select
                  onChange={(e) => {
                    const stage = parseInt(e.target.value)
                    if (stage) handleJumpToStage(selectedTask.id, stage)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                  value=""
                >
                  <option value="">跳转到阶段...</option>
                  {Array.from({ length: taskDetail.progress.totalStages }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Stage {i + 1}
                      {i + 1 < taskDetail.progress!.currentStage ? ' (已完成)' :
                       i + 1 === taskDetail.progress!.currentStage ? ' (当前)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {taskDetail.history && taskDetail.history.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">执行历史</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {taskDetail.history.slice().reverse().map((record) => (
                      <div
                        key={record.id}
                        className={`p-3 rounded-lg border ${
                          record.status === 'success' ? 'border-green-200 bg-green-50' :
                          record.status === 'failed' ? 'border-red-200 bg-red-50' :
                          'border-amber-200 bg-amber-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {record.status === 'success' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                            <span className="font-medium">Stage {record.stageIndex}</span>
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatDate(record.runAt)} · {formatDuration(record.duration)}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {record.summary}
                          {record.papersDiscovered > 0 && (
                            <span className="ml-2">
                              📄 +{record.papersDiscovered} 发现
                              {record.papersPromoted > 0 && ` · ↑ +${record.papersPromoted} 提升`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">新建定时任务</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务名称</label>
                <input
                  type="text"
                  value={newTask.name || ''}
                  onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                  placeholder="例如：每日论文发现"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">执行周期</label>
                <select
                  value={newTask.cronExpression || '0 8 * * *'}
                  onChange={(e) => setNewTask({ ...newTask, cronExpression: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                >
                  {cronPresets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label} ({preset.value})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">执行动作</label>
                <select
                  value={newTask.action || 'discover'}
                  onChange={(e) => setNewTask({ ...newTask, action: e.target.value as Task['action'] })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                >
                  <option value="discover">论文发现（渐进式追踪）</option>
                  <option value="refresh">数据刷新</option>
                  <option value="sync">数据同步</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">关联主题（可选）</label>
                <select
                  value={newTask.topicId || ''}
                  onChange={(e) => setNewTask({ ...newTask, topicId: e.target.value || undefined })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">不关联特定主题</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.nameZh}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Target className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <div className="font-medium">渐进式追踪说明</div>
                    <ul className="mt-1 space-y-1 text-amber-700">
                      <li>• 系统会自动在当前阶段多轮执行</li>
                      <li>• 发现足够多论文后自动进入下一阶段</li>
                      <li>• 可随时跳转到指定阶段</li>
                      <li>• 支持重置重新开始</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={newTask.enabled ?? true}
                  onChange={(e) => setNewTask({ ...newTask, enabled: e.target.checked })}
                  className="w-4 h-4 text-amber-500"
                />
                <label htmlFor="enabled" className="text-sm text-gray-700">
                  创建后立即启用
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreateTask}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
              >
                创建任务
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TaskScheduler
