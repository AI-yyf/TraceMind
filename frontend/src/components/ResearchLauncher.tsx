import { useState } from 'react'
import { X, Play, Settings, Terminal, GitBranch, Layers, Sparkles, AlertCircle } from 'lucide-react'
import { useConfig, useResearchSession } from '@/hooks/useConfig'
import type { ResearchSessionConfig } from '@/types/config'
import type { TopicId } from '@/types/tracker'

interface ResearchLauncherProps {
  isOpen: boolean
  onClose: () => void
  topicId: TopicId
  topicName: string
}

export function ResearchLauncher({ isOpen, onClose, topicId, topicName }: ResearchLauncherProps) {
  const { config, isApiConfigured } = useConfig()
  const { progress, isRunning, startResearch, stopResearch } = useResearchSession()
  const [sessionConfig, setSessionConfig] = useState<ResearchSessionConfig>({
    topicIds: [topicId],
    mode: 'full',
    startStage: 1,
    useCache: true,
    generateImages: true,
    streamOutput: true,
  })
  const [showSettings, setShowSettings] = useState(false)

  if (!isOpen) return null

  const handleStart = async () => {
    if (!isApiConfigured) {
      alert('请先配置 API 设置')
      return
    }
    await startResearch(sessionConfig, config)
  }

  const modes = [
    { 
      id: 'full', 
      label: '完整流程', 
      icon: Layers,
      desc: '执行完整的研究流程：阶段选择 → 论文发现 → 节点生成 → 分支分析'
    },
    { 
      id: 'discovery-only', 
      label: '仅发现', 
      icon: Sparkles,
      desc: '仅执行论文发现阶段，生成候选池但不创建节点'
    },
    { 
      id: 'node-only', 
      label: '仅生成节点', 
      icon: GitBranch,
      desc: '基于已有候选生成节点摘要和标签'
    },
    { 
      id: 'branch-only', 
      label: '仅分支分析', 
      icon: GitBranch,
      desc: '仅执行分支分配和汇流检测'
    },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-black/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black">
              <Terminal className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-black">启动研究</h2>
              <p className="text-[13px] text-black/50">主题：{topicName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            >
              <Settings className="h-5 w-5 text-black/50" />
            </button>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            >
              <X className="h-5 w-5 text-black/50" />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧配置 */}
          <div className="w-80 border-r border-black/8 bg-[#fafafa] p-6">
            {!isApiConfigured && (
              <div className="mb-6 rounded-xl bg-red-50 p-4">
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

            <div className="space-y-6">
              {/* 研究模式 */}
              <div>
                <label className="mb-3 block text-[13px] font-medium text-black">研究模式</label>
                <div className="space-y-2">
                  {modes.map((mode) => {
                    const Icon = mode.icon
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setSessionConfig(prev => ({ ...prev, mode: mode.id }))}
                        className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                          sessionConfig.mode === mode.id
                            ? 'bg-black text-white'
                            : 'bg-white text-black hover:bg-black/5'
                        }`}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <div className="text-[14px] font-medium">{mode.label}</div>
                          <div className={`mt-1 text-[12px] ${sessionConfig.mode === mode.id ? 'text-white/70' : 'text-black/50'}`}>
                            {mode.desc}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 起始阶段 */}
              <div>
                <label className="mb-2 block text-[13px] font-medium text-black">起始阶段</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={sessionConfig.startStage}
                  onChange={(e) => setSessionConfig(prev => ({ ...prev, startStage: parseInt(e.target.value) }))}
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[14px] outline-none transition focus:border-black"
                />
              </div>

              {/* 选项 */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 rounded-xl bg-white p-3">
                  <input
                    type="checkbox"
                    checked={sessionConfig.useCache}
                    onChange={(e) => setSessionConfig(prev => ({ ...prev, useCache: e.target.checked }))}
                    className="h-4 w-4 rounded border-black/20"
                  />
                  <span className="text-[14px] text-black">使用缓存</span>
                </label>

                <label className="flex items-center gap-3 rounded-xl bg-white p-3">
                  <input
                    type="checkbox"
                    checked={sessionConfig.generateImages}
                    onChange={(e) => setSessionConfig(prev => ({ ...prev, generateImages: e.target.checked }))}
                    className="h-4 w-4 rounded border-black/20"
                  />
                  <span className="text-[14px] text-black">生成配图</span>
                </label>

                <label className="flex items-center gap-3 rounded-xl bg-white p-3">
                  <input
                    type="checkbox"
                    checked={sessionConfig.streamOutput}
                    onChange={(e) => setSessionConfig(prev => ({ ...prev, streamOutput: e.target.checked }))}
                    className="h-4 w-4 rounded border-black/20"
                  />
                  <span className="text-[14px] text-black">实时输出</span>
                </label>
              </div>
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
                <span className="ml-3 text-[13px] text-white/50">Research Console</span>
              </div>
              {isRunning && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                  <span className="text-[12px] text-white/70">运行中</span>
                </div>
              )}
            </div>

            {/* 终端内容 */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px]">
              {!progress ? (
                <div className="flex h-full items-center justify-center text-white/30">
                  <div className="text-center">
                    <Terminal className="mx-auto mb-3 h-12 w-12 opacity-20" />
                    <p>点击"开始研究"启动会话</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {progress.logs.map((log, i) => (
                    <div key={i} className="flex gap-3">
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
                      <span className="text-white/80">{log.message}</span>
                    </div>
                  ))}
                  {isRunning && (
                    <div className="flex items-center gap-2 text-white/50">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                      <span>等待输出...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 进度条 */}
            {progress && (
              <div className="border-t border-white/10 px-4 py-3">
                <div className="flex items-center justify-between text-[12px] text-white/50">
                  <span>{progress.currentStage}</span>
                  <span>{progress.progress}%</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div 
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* 底部按钮 */}
            <div className="border-t border-white/10 px-4 py-3">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={!isApiConfigured}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-[14px] font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  开始研究
                </button>
              ) : (
                <button
                  onClick={stopResearch}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-transparent py-3 text-[14px] font-medium text-white transition hover:bg-white/10"
                >
                  停止研究
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
