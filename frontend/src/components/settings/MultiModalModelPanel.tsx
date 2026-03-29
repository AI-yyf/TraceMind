import { useState, useCallback } from 'react'
import { Plus, Trash2, Check, AlertCircle, TestTube, ChevronDown, ChevronUp } from 'lucide-react'
import type { 
  CustomModelConfig, 
  MultiModalConfig, 
  ModelProvider, 
  ModelCapability,
  TaskMapping 
} from '@/types/config'
import { DEFAULT_MULTIMODAL_CONFIG } from '@/types/config'

interface MultiModalModelPanelProps {
  config: MultiModalConfig
  onChange: (config: MultiModalConfig) => void
  onTestModel?: (modelId: string) => Promise<{ success: boolean; latency: number; error?: string }>
}

const PROVIDER_OPTIONS: { value: ModelProvider; label: string; icon: string }[] = [
  { value: 'openai', label: 'OpenAI', icon: '🤖' },
  { value: 'anthropic', label: 'Anthropic', icon: '🧠' },
  { value: 'google', label: 'Google', icon: '🔍' },
  { value: 'azure', label: 'Azure OpenAI', icon: '☁️' },
  { value: 'local', label: '本地部署', icon: '💻' },
  { value: 'custom', label: '自定义 API', icon: '⚙️' },
]

const CAPABILITY_OPTIONS: { value: ModelCapability; label: string; color: string }[] = [
  { value: 'vision', label: '视觉理解', color: 'bg-purple-100 text-purple-700' },
  { value: 'text', label: '文本生成', color: 'bg-blue-100 text-blue-700' },
  { value: 'code', label: '代码能力', color: 'bg-green-100 text-green-700' },
  { value: 'math', label: '数学推理', color: 'bg-orange-100 text-orange-700' },
  { value: 'analysis', label: '深度分析', color: 'bg-pink-100 text-pink-700' },
]

const TASK_NAMES: { key: keyof TaskMapping; label: string; description: string }[] = [
  { key: 'figureAnalysis', label: '图表分析', description: '深度分析论文中的图表' },
  { key: 'contentGeneration', label: '内容生成', description: '生成节点和论文内容' },
  { key: 'formulaRecognition', label: '公式识别', description: '识别和解释数学公式' },
  { key: 'ocr', label: 'OCR 识别', description: '提取图片中的文字' },
  { key: 'tableExtraction', label: '表格提取', description: '提取和解析表格数据' },
]

export function MultiModalModelPanel({ config, onChange, onTestModel }: MultiModalModelPanelProps) {
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [testingModel, setTestingModel] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latency: number; error?: string }>>({})

  const handleAddModel = useCallback(() => {
    const newModel: CustomModelConfig = {
      id: `model-${Date.now()}`,
      name: '新模型',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '',
      parameters: {
        temperature: 0.3,
        maxTokens: 4000,
        topP: 1,
      },
      capabilities: ['text'],
      enabled: false,
    }
    onChange({
      ...config,
      models: [...config.models, newModel],
    })
    setExpandedModel(newModel.id)
  }, [config, onChange])

  const handleRemoveModel = useCallback((modelId: string) => {
    onChange({
      ...config,
      models: config.models.filter(m => m.id !== modelId),
      taskMapping: Object.fromEntries(
        Object.entries(config.taskMapping).filter(([, id]) => id !== modelId)
      ) as TaskMapping,
    })
  }, [config, onChange])

  const handleUpdateModel = useCallback((modelId: string, updates: Partial<CustomModelConfig>) => {
    onChange({
      ...config,
      models: config.models.map(m => 
        m.id === modelId ? { ...m, ...updates } : m
      ),
    })
  }, [config, onChange])

  const handleUpdateTaskMapping = useCallback((task: keyof TaskMapping, modelId: string) => {
    onChange({
      ...config,
      taskMapping: {
        ...config.taskMapping,
        [task]: modelId,
      },
    })
  }, [config, onChange])

  const handleTestModel = useCallback(async (modelId: string) => {
    if (!onTestModel) return
    setTestingModel(modelId)
    try {
      const result = await onTestModel(modelId)
      setTestResults(prev => ({ ...prev, [modelId]: result }))
    } finally {
      setTestingModel(null)
    }
  }, [onTestModel])

  const enabledModels = config.models.filter(m => m.enabled)

  return (
    <div className="space-y-6">
      {/* 模型列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-black/70">模型配置</h3>
          <button
            onClick={handleAddModel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white transition hover:bg-black/80"
          >
            <Plus className="h-3.5 w-3.5" />
            添加模型
          </button>
        </div>

        <div className="space-y-2">
          {config.models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isExpanded={expandedModel === model.id}
              onToggle={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
              onUpdate={(updates) => handleUpdateModel(model.id, updates)}
              onRemove={() => handleRemoveModel(model.id)}
              onTest={() => handleTestModel(model.id)}
              isTesting={testingModel === model.id}
              testResult={testResults[model.id]}
            />
          ))}

          {config.models.length === 0 && (
            <div className="rounded-lg border border-dashed border-black/20 bg-black/[0.02] py-8 text-center">
              <p className="text-sm text-black/50">暂无模型配置</p>
              <p className="mt-1 text-xs text-black/40">点击上方按钮添加模型</p>
            </div>
          )}
        </div>
      </div>

      {/* 任务映射 */}
      {enabledModels.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-black/70">任务分配</h3>
          <p className="text-xs text-black/50">为每个任务选择使用的模型</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {TASK_NAMES.map(({ key, label, description }) => (
              <div
                key={key}
                className="rounded-lg border border-black/8 bg-white p-3"
              >
                <div className="mb-2">
                  <span className="text-sm font-medium text-black">{label}</span>
                  <p className="text-xs text-black/50">{description}</p>
                </div>
                <select
                  value={config.taskMapping[key] || ''}
                  onChange={(e) => handleUpdateTaskMapping(key, e.target.value)}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                >
                  <option value="">选择模型...</option>
                  {enabledModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 备用策略 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-black/70">备用策略</h3>
        
        <div className="rounded-lg border border-black/8 bg-white p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.fallbackStrategy.enabled}
              onChange={(e) => onChange({
                ...config,
                fallbackStrategy: {
                  ...config.fallbackStrategy,
                  enabled: e.target.checked,
                },
              })}
              className="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
            />
            <span className="text-sm text-black">启用备用模型</span>
          </label>

          {config.fallbackStrategy.enabled && (
            <div className="mt-3 space-y-3 pl-7">
              <div>
                <label className="mb-1 block text-xs text-black/60">备用模型</label>
                <select
                  value={config.fallbackStrategy.fallbackModelId || ''}
                  onChange={(e) => onChange({
                    ...config,
                    fallbackStrategy: {
                      ...config.fallbackStrategy,
                      fallbackModelId: e.target.value || undefined,
                    },
                  })}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                >
                  <option value="">选择备用模型...</option>
                  {enabledModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-black/60">重试次数</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={config.fallbackStrategy.retryCount}
                  onChange={(e) => onChange({
                    ...config,
                    fallbackStrategy: {
                      ...config.fallbackStrategy,
                      retryCount: parseInt(e.target.value) || 2,
                    },
                  })}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 重置按钮 */}
      <div className="flex justify-end">
        <button
          onClick={() => onChange(DEFAULT_MULTIMODAL_CONFIG)}
          className="text-xs text-black/50 underline underline-offset-2 transition hover:text-black"
        >
          恢复默认配置
        </button>
      </div>
    </div>
  )
}

// 模型卡片组件
interface ModelCardProps {
  model: CustomModelConfig
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<CustomModelConfig>) => void
  onRemove: () => void
  onTest: () => void
  isTesting: boolean
  testResult?: { success: boolean; latency: number; error?: string }
}

function ModelCard({
  model,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onTest,
  isTesting,
  testResult,
}: ModelCardProps) {
  const provider = PROVIDER_OPTIONS.find(p => p.value === model.provider)

  return (
    <div className="overflow-hidden rounded-lg border border-black/8 bg-white">
      {/* 头部 - 始终显示 */}
      <div
        onClick={onToggle}
        className="flex cursor-pointer items-center justify-between p-3 transition hover:bg-black/[0.02]"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{provider?.icon || '🔧'}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-black">{model.name}</span>
              <span className="text-xs text-black/40">{model.model}</span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              {model.capabilities.map((cap) => {
                const capInfo = CAPABILITY_OPTIONS.find(c => c.value === cap)
                return (
                  <span
                    key={cap}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${capInfo?.color || 'bg-gray-100 text-gray-700'}`}
                  >
                    {capInfo?.label || cap}
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 启用开关 */}
          <label
            onClick={(e) => e.stopPropagation()}
            className="relative inline-flex cursor-pointer items-center"
          >
            <input
              type="checkbox"
              checked={model.enabled}
              onChange={(e) => onUpdate({ enabled: e.target.checked })}
              className="peer sr-only"
            />
            <div className="h-5 w-9 rounded-full bg-black/10 transition peer-checked:bg-black peer-focus:ring-2 peer-focus:ring-black/20" />
            <div className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition peer-checked:translate-x-4" />
          </label>

          {/* 展开/折叠 */}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-black/40" />
          ) : (
            <ChevronDown className="h-4 w-4 text-black/40" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-black/8 p-4">
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-black/60">模型名称</label>
                <input
                  type="text"
                  value={model.name}
                  onChange={(e) => onUpdate({ name: e.target.value })}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                  placeholder="例如：GPT-4o Vision"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-black/60">提供商</label>
                <select
                  value={model.provider}
                  onChange={(e) => onUpdate({ provider: e.target.value as ModelProvider })}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-black/60">模型标识</label>
                <input
                  type="text"
                  value={model.model}
                  onChange={(e) => onUpdate({ model: e.target.value })}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                  placeholder="例如：gpt-4o"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-black/60">API Key</label>
                <input
                  type="password"
                  value={model.apiKey}
                  onChange={(e) => onUpdate({ apiKey: e.target.value })}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                  placeholder="sk-..."
                />
              </div>

              {(model.provider === 'local' || model.provider === 'custom') && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-black/60">Base URL</label>
                  <input
                    type="text"
                    value={model.baseUrl || ''}
                    onChange={(e) => onUpdate({ baseUrl: e.target.value })}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none focus:border-black/30"
                    placeholder="http://localhost:8000"
                  />
                </div>
              )}
            </div>

            {/* 能力标签 */}
            <div>
              <label className="mb-2 block text-xs text-black/60">模型能力</label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_OPTIONS.map((cap) => (
                  <label
                    key={cap.value}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition ${
                      model.capabilities.includes(cap.value)
                        ? 'border-black bg-black text-white'
                        : 'border-black/10 bg-white text-black/60 hover:border-black/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={model.capabilities.includes(cap.value)}
                      onChange={(e) => {
                        const newCaps = e.target.checked
                          ? [...model.capabilities, cap.value]
                          : model.capabilities.filter(c => c !== cap.value)
                        onUpdate({ capabilities: newCaps })
                      }}
                      className="sr-only"
                    />
                    {cap.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 生成参数 */}
            <div>
              <label className="mb-2 block text-xs text-black/60">生成参数</label>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] text-black/40">Temperature</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={model.parameters.temperature}
                    onChange={(e) => onUpdate({
                      parameters: { ...model.parameters, temperature: parseFloat(e.target.value) || 0.3 }
                    })}
                    className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-sm text-black outline-none focus:border-black/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-black/40">Max Tokens</label>
                  <input
                    type="number"
                    min={100}
                    max={128000}
                    step={100}
                    value={model.parameters.maxTokens}
                    onChange={(e) => onUpdate({
                      parameters: { ...model.parameters, maxTokens: parseInt(e.target.value) || 4000 }
                    })}
                    className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-sm text-black outline-none focus:border-black/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-black/40">Top P</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={model.parameters.topP ?? 1}
                    onChange={(e) => onUpdate({
                      parameters: { ...model.parameters, topP: parseFloat(e.target.value) || 1 }
                    })}
                    className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-sm text-black outline-none focus:border-black/30"
                  />
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-between border-t border-black/8 pt-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={onTest}
                  disabled={isTesting || !model.enabled}
                  className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs text-black transition hover:bg-black/[0.02] disabled:opacity-50"
                >
                  <TestTube className="h-3.5 w-3.5" />
                  {isTesting ? '测试中...' : '测试连接'}
                </button>

                {testResult && (
                  <span className={`flex items-center gap-1 text-xs ${
                    testResult.success ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {testResult.success ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        成功 ({testResult.latency}ms)
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3.5 w-3.5" />
                        失败
                      </>
                    )}
                  </span>
                )}
              </div>

              <button
                onClick={onRemove}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MultiModalModelPanel
