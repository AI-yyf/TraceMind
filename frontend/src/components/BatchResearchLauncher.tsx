import { useState, useMemo } from 'react'
import { X, Play, Pause, RotateCcw, Terminal, CheckCircle, AlertCircle, Clock, Layers } from 'lucide-react'
import { useConfig, useResearchSession } from '@/hooks/useConfig'
import { useTopicRegistry } from '@/hooks'
import { getTopicNodes } from '@/data/tracker'
import type { ResearchSessionConfig } from '@/types/config'

interface BatchResearchLauncherProps {
  isOpen: boolean
  onClose: () => void
}

export function BatchResearchLauncher({ isOpen, onClose }: BatchResearchLauncherProps) {
  const { config, isApiConfigured } = useConfig()
  const { activeTopics } = useTopicRegistry()
  const { progress, isRunning, startResearch, stopResearch } = useResearchSession()
  
  const [sessionConfig, setSessionConfig] = useState<ResearchSessionConfig>({
    topicIds: [],
    mode: 'batch',
    startStage: 1,
    useCache: true,
    generateImages: config.api.multimodal.enableImageGeneration,
    streamOutput: true,
    batchOptions: {
      skipCompleted: config.research.batchResearch.skipCompleted,
      completionThreshold: config.research.batchResearch.completionThreshold,
      concurrent: config.research.batchResearch.concurrentTopics,
    }
  })

  // 计算每个主题的研究状态
  const topicStatuses = useMemo(() => {
    return activeTopics.map(topic => {
      const nodes = getTopicNodes(topic.id)
      const nodeCount = nodes.length
      const isCompleted = nodeCount >= config.research.batchResearch.completionThreshold
      return {
        topic,
        nodeCount,
        isCompleted,
        selected: !isCompleted || !sessionConfig.batchOptions?.skipCompleted
      }
    })
  }, [activeTopics, config.research.batchResearch.completionThreshold, sessionConfig.batchOptions?.skipCompleted])

  // 选中的主题数
  const selectedCount = topicStatuses.filter(t => t.selected).length
  const completedCount = topicStatuses.filter(t => t.isCompleted).length

  if (!isOpen) return null

  const handleStart = async () => {
    if (!isApiConfigured) {
      alert('请先配置 API 设置')
      return
    }
    
    const selectedTopicIds = topicStatuses
      .filter(t => t.selected)
      .map(t => t.topic.id)
    
    await startResearch({
      ...sessionConfig,
      topicIds: selectedTopicIds,
    }, config)
  }

  const toggleTopicSelection = (topicId: string) => {
    setSessionConfig(prev => ({
      ...prev,
      topicIds: prev.topicIds.includes(topicId)
        ? prev.topicIds.filter(id => id !== topicId)
        : [...prev.topicIds, topicId]
    }))
  }

  const selectAll = () => {
    const allIds = topicStatuses
      .filter(t => !t.isCompleted || !sessionConfig.batchOptions?.skipCompleted)
      .map(t => t.topic.id)
    setSessionConfig(prev => ({ ...prev, topicIds: allIds }))
  }

  const deselectAll = () => {
    setSessionConfig(prev => ({ ...prev, topicIds: [] }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-black/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-black">批量研究</h2>
              <p className="text-[13px] text-black/50">
                {selectedCount} 个主题待研究 · {completedCount} 个已完成
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5 disabled:opacity-50"
          >
            <X className="h-5 w-5 text-black/50" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧主题列表 */}
          <div className="w-80 border-r border-black/8 bg-[#fafafa] p-4">
            {!isApiConfigured && (
              <div className="mb-4 rounded-xl bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
                  <div>
                    <p className="text-[13px] font-medium text-red-700">API 未配置</p>
                    <p className="mt-1 text-[12px] text-red-600">
                      请先打开设置配置 API 连接信息
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 批量选项 */}
            <div className="mb-4 rounded-xl bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-black">批量选项</span>
              </div>
              
              <label className="flex items-center justify-between mb-3">
                <span className="text-[13px] text-black">跳过已完成</span>
                <input
                  type="checkbox"
                  checked={sessionConfig.batchOptions?.skipCompleted}
                  onChange={(e) => setSessionConfig(prev => ({
                    ...prev,
                    batchOptions: { ...prev.batchOptions!, skipCompleted: e.target.checked }
                  }))}
                  className="h-4 w-4 rounded border-black/20"
                />
              </label>

              <div className="mb-3">
                <span className="text-[12px] text-black/60">同时处理: {sessionConfig.batchOptions?.concurrent} 个</span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={sessionConfig.batchOptions?.concurrent}
                  onChange={(e) => setSessionConfig(prev => ({
                    ...prev,
                    batchOptions: { ...prev.batchOptions!, concurrent: parseInt(e.target.value) }
                  }))}
                  className="w-full mt-1"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="flex-1 rounded-lg bg-black/5 px-3 py-2 text-[12px] text-black transition hover:bg-black/10"
                >
                  全选
                </button>
                <button
                  onClick={deselectAll}
                  className="flex-1 rounded-lg bg-black/5 px-3 py-2 text-[12px] text-black transition hover:bg-black/10"
                >
                  全不选
                </button>
              </div>
            </div>

            {/* 主题列表 */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <div className="text-[12px] font-medium text-black/50 mb-2">选择要研究的主题</div>
              {topicStatuses.map(({ topic, nodeCount, isCompleted, selected }) => (
                <label
                  key={topic.id}
                  className={`flex items-center gap-3 rounded-xl p-3 transition cursor-pointer ${
                    selected ? 'bg-white shadow-sm' : 'bg-transparent'
                  } ${isCompleted && sessionConfig.batchOptions?.skipCompleted ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleTopicSelection(topic.id)}
                    disabled={isCompleted && sessionConfig.batchOptions?.skipCompleted}
                    className="h-4 w-4 rounded border-black/20"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-black truncate">{topic.nameZh}</p>
                    <p className="text-[11px] text-black/50">
                      {nodeCount} 节点 {isCompleted && '· 已完成'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 右侧输出区 */}
          <div className="flex flex-1 flex-col bg-black">
            {/* 终端头部 */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                </div>
                <span className="ml-3 text-[13px] text-white/50">Batch Research Console</span>
              </div>
              {isRunning && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                  <span className="text-[12px] text-white/70">运行中</span>
                </div>
              )}
            </div>

            {/* 进度概览 */}
            {progress && (
              <div className="border-b border-white/10 px-4 py-3">
                <div className="flex items-center justify-between text-[12px] text-white/50 mb-2">
                  <span>总进度: {progress.completedTopics}/{progress.totalTopics} 主题</span>
                  <span>{progress.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div 
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
                {progress.currentTopic && (
                  <p className="mt-2 text-[12px] text-white/70">
                    当前: {progress.currentTopic}
                  </p>
                )}
              </div>
            )}

            {/* 终端内容 */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px]">
              {!progress ? (
                <div className="flex h-full items-center justify-center text-white/30">
                  <div className="text-center">
                    <Terminal className="mx-auto mb-3 h-12 w-12 opacity-20" />
                    <p>选择主题后点击"开始批量研究"</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {progress.logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="shrink-0 text-white/30">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`shrink-0 ${
                        log.level === 'error' ? 'text-red-400' :
                        log.level === 'warn' ? 'text-yellow-400' :
                        log.level === 'success' ? 'text-green-400' :
                        'text-blue-400'
                      }`}>
                        [{log.level.toUpperCase()}]
                      </span>
                      {log.topicId && (
                        <span className="shrink-0 text-white/40">[{log.topicId}]</span>
                      )}
                      <span className="text-white/80">{log.message}</span>
                    </div>
                  ))}
                  {isRunning && (
                    <div className="flex items-center gap-2 text-white/50">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                      <span>处理中...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="border-t border-white/10 px-4 py-3">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={!isApiConfigured || selectedCount === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-[14px] font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  开始批量研究 ({selectedCount} 个主题)
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={stopResearch}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-transparent py-3 text-[14px] font-medium text-white transition hover:bg-white/10"
                  >
                    <Pause className="h-4 w-4" />
                    暂停
                  </button>
                  <button
                    onClick={handleStart}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-3 text-[14px] font-medium text-black transition hover:bg-white/90"
                  >
                    <RotateCcw className="h-4 w-4" />
                    重新开始
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
