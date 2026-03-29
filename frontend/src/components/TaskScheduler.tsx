import React, { useState, useEffect } from 'react'
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
} from 'lucide-react'

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
  }
}

interface CronPreset {
  label: string
  value: string
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

export const TaskScheduler: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [topics, setTopics] = useState<{ id: string; nameZh: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runningTask, setRunningTask] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [cronPresets, setCronPresets] = useState<CronPreset[]>([])

  const [newTask, setNewTask] = useState<Partial<Task>>({
    name: '',
    cronExpression: '0 8 * * *',
    enabled: true,
    action: 'discover',
    topicId: undefined,
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
      const res = await fetch('/api/topics')
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
        setTasks([...tasks, task])
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
        setTasks(tasks.map(t => t.id === taskId ? { ...t, enabled } : t))
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
      }
    } catch (e) {
      setError('删除任务失败')
    }
  }

  const handleRunTask = async (taskId: string) => {
    setRunningTask(taskId)

    try {
      const res = await fetch(`/api/tasks/${taskId}/run`, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        alert(`任务执行完成！\n耗时：${data.data.duration}ms\n结果：${data.data.success ? '成功' : '失败'}`)
      } else {
        setError(data.error || '执行失败')
      }
    } catch (e) {
      setError('执行任务失败')
    } finally {
      setRunningTask(null)
    }
  }

  const parseCron = (expression: string): string => {
    const parts = expression.split(' ')
    if (parts.length !== 5) return expression

    const [minute, hour, day, month, weekday] = parts

    if (minute === '0' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
      return '每小时整点'
    }
    if (minute === '0' && hour !== '*') {
      return `每天 ${hour} 点`
    }
    if (weekday !== '*') {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return `每周${weekdays[parseInt(weekday)] || weekday}`
    }

    return expression
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-6 h-6" />
            定时任务管理
          </h2>
          <p className="text-gray-600 mt-1">自动执行论文发现和数据同步</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          新建任务
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

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
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{task.name}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs ${actionColors[task.action]}`}>
                    {actionLabels[task.action]}
                  </span>
                  {task.enabled ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs">
                      <CheckCircle className="w-3 h-3" />
                      已启用
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-400 text-xs">
                      <Pause className="w-3 h-3" />
                      已暂停
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

              <div className="flex items-center gap-2">
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
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
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
                  <option value="discover">论文发现</option>
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
