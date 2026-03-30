import { useState } from 'react'
import { X, Save, RotateCcw, Key, Server, Sliders, MessageSquare, FlaskConical, Eye, Image, Layers, Clock, FileJson } from 'lucide-react'
import { useConfig } from '@/hooks/useConfig'
import { TaskScheduler } from './TaskScheduler'
import { PromptTemplateManager } from './PromptTemplateManager'
import type { AppConfig, ApiProvider } from '@/types/config'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { config, updateApiConfig, updateGenerationConfig, updateResearchConfig, resetConfig, isApiConfigured } = useConfig()
  const [activeTab, setActiveTab] = useState<'api' | 'generation' | 'research' | 'batch' | 'prompts'>('api')
  const [localConfig, setLocalConfig] = useState<AppConfig>(config)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  if (!isOpen) return null

  const handleSave = () => {
    // 保存所有配置
    Object.entries(localConfig.api).forEach(([key, value]) => {
      if (key !== 'multimodal') {
        updateApiConfig({ [key]: value } as Partial<AppConfig['api']>)
      }
    })
    // 保存多模态配置
    updateApiConfig({ multimodal: localConfig.api.multimodal })
    
    Object.entries(localConfig.generation).forEach(([key, value]) => {
      updateGenerationConfig({ [key]: value } as Partial<AppConfig['generation']>)
    })
    Object.entries(localConfig.research).forEach(([key, value]) => {
      updateResearchConfig({ [key]: value } as Partial<AppConfig['research']>)
    })
    
    setShowSaveSuccess(true)
    setTimeout(() => setShowSaveSuccess(false), 2000)
  }

  const handleReset = () => {
    if (confirm('确定要重置为默认配置吗？所有自定义设置将丢失。')) {
      resetConfig()
      setLocalConfig(config)
    }
  }

  const testConnection = async () => {
    setTestStatus('testing')
    
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
      
      // 测试后端 API 连接
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        setTestStatus('success')
      } else {
        setTestStatus('error')
      }
    } catch (error) {
      console.error('API test failed:', error)
      setTestStatus('error')
    }

    setTimeout(() => setTestStatus('idle'), 3000)
  }

  const tabs = [
    { id: 'api', label: 'API 配置', icon: Server },
    { id: 'generation', label: '生成参数', icon: Sliders },
    { id: 'research', label: '研究流程', icon: FlaskConical },
    { id: 'batch', label: '批量研究', icon: Layers },
    { id: 'prompts', label: '提示词', icon: MessageSquare },
    { id: 'scheduler', label: '定时任务', icon: Clock },
  ] as const

  const providers: { id: ApiProvider; name: string; defaultUrl: string }[] = [
    { id: 'openai', name: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
    { id: 'anthropic', name: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' },
    { id: 'custom', name: '自定义', defaultUrl: '' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-black/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black">
              <Key className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-black">系统配置</h2>
              <p className="text-[13px] text-black/50">
                {isApiConfigured ? '✓ API 已配置' : '✗ API 未配置 - 请先完成 API 设置'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
          >
            <X className="h-5 w-5 text-black/50" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧标签栏 */}
          <div className="w-52 border-r border-black/8 bg-[#fafafa] p-4">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] transition ${
                      activeTab === tab.id
                        ? 'bg-black text-white'
                        : 'text-black/60 hover:bg-black/5'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                )
              })}
            </nav>

            {/* 测试连接按钮 */}
            {activeTab === 'api' && (
              <div className="mt-6 border-t border-black/10 pt-4">
                <button
                  onClick={testConnection}
                  disabled={testStatus === 'testing'}
                  className={`w-full rounded-xl px-4 py-3 text-[13px] font-medium transition ${
                    testStatus === 'success'
                      ? 'bg-green-500 text-white'
                      : testStatus === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-black text-white hover:bg-black/85'
                  }`}
                >
                  {testStatus === 'testing' ? '测试中...' : 
                   testStatus === 'success' ? '连接成功' :
                   testStatus === 'error' ? '连接失败' : '测试连接'}
                </button>
              </div>
            )}
          </div>

          {/* 右侧配置区 */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* API 配置 */}
            {activeTab === 'api' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[16px] font-medium text-black">API 连接</h3>
                  <p className="mt-1 text-[13px] text-black/50">配置 LLM API 连接信息</p>
                </div>

                {/* 提供商选择 */}
                <div>
                  <label className="mb-2 block text-[13px] font-medium text-black">API 提供商</label>
                  <div className="grid grid-cols-3 gap-3">
                    {providers.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => setLocalConfig(prev => ({ 
                          ...prev, 
                          api: { 
                            ...prev.api, 
                            provider: provider.id,
                            baseUrl: provider.defaultUrl 
                          } 
                        }))}
                        className={`rounded-xl border px-4 py-3 text-[14px] transition ${
                          localConfig.api.provider === provider.id
                            ? 'border-black bg-black text-white'
                            : 'border-black/10 hover:border-black/30'
                        }`}
                      >
                        {provider.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[13px] font-medium text-black">API 基础 URL</label>
                  <input
                    type="url"
                    value={localConfig.api.baseUrl}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, api: { ...prev.api, baseUrl: e.target.value } }))}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-xl border border-black/10 px-4 py-3 text-[14px] outline-none transition focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[13px] font-medium text-black">API Key</label>
                  <input
                    type="password"
                    value={localConfig.api.apiKey}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, api: { ...prev.api, apiKey: e.target.value } }))}
                    placeholder="sk-..."
                    className="w-full rounded-xl border border-black/10 px-4 py-3 text-[14px] outline-none transition focus:border-black"
                  />
                  <p className="mt-1 text-[12px] text-black/40">您的 API 密钥将被安全存储在本地浏览器中</p>
                </div>

                <div>
                  <label className="mb-2 block text-[13px] font-medium text-black">模型</label>
                  <select
                    value={localConfig.api.model}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, api: { ...prev.api, model: e.target.value } }))}
                    className="w-full rounded-xl border border-black/10 px-4 py-3 text-[14px] outline-none transition focus:border-black"
                  >
                    <optgroup label="OpenAI">
                      <option value="gpt-4o">GPT-4o (多模态)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    </optgroup>
                    <optgroup label="Anthropic">
                      <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                      <option value="claude-3-opus">Claude 3 Opus</option>
                      <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                    </optgroup>
                    <optgroup label="自定义">
                      <option value="custom">自定义模型</option>
                    </optgroup>
                  </select>
                </div>

                {localConfig.api.provider === 'openai' && (
                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">组织 ID (可选)</label>
                    <input
                      type="text"
                      value={localConfig.api.organizationId || ''}
                      onChange={(e) => setLocalConfig(prev => ({ ...prev, api: { ...prev.api, organizationId: e.target.value } }))}
                      placeholder="org-..."
                      className="w-full rounded-xl border border-black/10 px-4 py-3 text-[14px] outline-none transition focus:border-black"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3 rounded-xl bg-black/5 p-4">
                  <input
                    type="checkbox"
                    id="api-enabled"
                    checked={localConfig.api.enabled}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, api: { ...prev.api, enabled: e.target.checked } }))}
                    className="h-5 w-5 rounded border-black/20"
                  />
                  <label htmlFor="api-enabled" className="text-[14px] text-black">
                    启用 API 连接
                  </label>
                </div>

                {/* 多模态配置 */}
                <div className="rounded-xl border border-black/8 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Eye className="h-5 w-5 text-black/50" />
                    <h4 className="text-[15px] font-medium text-black">多模态能力</h4>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[14px] text-black">启用视觉理解</p>
                        <p className="text-[12px] text-black/50">分析论文中的图表和图像</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={localConfig.api.multimodal.enableVision}
                        onChange={(e) => setLocalConfig(prev => ({ 
                          ...prev, 
                          api: { 
                            ...prev.api, 
                            multimodal: { ...prev.api.multimodal, enableVision: e.target.checked } 
                          } 
                        }))}
                        className="h-5 w-5 rounded border-black/20"
                      />
                    </div>

                    {localConfig.api.multimodal.enableVision && (
                      <div>
                        <label className="mb-2 block text-[13px] text-black">视觉模型</label>
                        <select
                          value={localConfig.api.multimodal.visionModel}
                          onChange={(e) => setLocalConfig(prev => ({ 
                            ...prev, 
                            api: { 
                              ...prev.api, 
                              multimodal: { ...prev.api.multimodal, visionModel: e.target.value } 
                            } 
                          }))}
                          className="w-full rounded-lg border border-black/10 px-3 py-2 text-[14px]"
                        >
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gpt-4-turbo">GPT-4 Turbo</option>
                          <option value="claude-3-opus">Claude 3 Opus</option>
                        </select>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[14px] text-black">启用图像生成</p>
                        <p className="text-[12px] text-black/50">为节点自动生成配图</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={localConfig.api.multimodal.enableImageGeneration}
                        onChange={(e) => setLocalConfig(prev => ({ 
                          ...prev, 
                          api: { 
                            ...prev.api, 
                            multimodal: { ...prev.api.multimodal, enableImageGeneration: e.target.checked } 
                          } 
                        }))}
                        className="h-5 w-5 rounded border-black/20"
                      />
                    </div>

                    {localConfig.api.multimodal.enableImageGeneration && (
                      <div>
                        <label className="mb-2 block text-[13px] text-black">图像生成模型</label>
                        <select
                          value={localConfig.api.multimodal.imageGenerationModel}
                          onChange={(e) => setLocalConfig(prev => ({ 
                            ...prev, 
                            api: { 
                              ...prev.api, 
                              multimodal: { ...prev.api.multimodal, imageGenerationModel: e.target.value } 
                            } 
                          }))}
                          className="w-full rounded-lg border border-black/10 px-3 py-2 text-[14px]"
                        >
                          <option value="dall-e-3">DALL-E 3</option>
                          <option value="dall-e-2">DALL-E 2</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 生成参数 */}
            {activeTab === 'generation' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[16px] font-medium text-black">生成参数</h3>
                  <p className="mt-1 text-[13px] text-black/50">控制 LLM 生成内容的参数</p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">
                      温度 (Temperature): {localConfig.generation.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={localConfig.generation.temperature}
                      onChange={(e) => setLocalConfig(prev => ({ ...prev, generation: { ...prev.generation, temperature: parseFloat(e.target.value) } }))}
                      className="w-full"
                    />
                    <p className="mt-1 text-[12px] text-black/40">较低值更确定，较高值更有创造性</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">
                      最大 Token: {localConfig.generation.maxTokens}
                    </label>
                    <input
                      type="range"
                      min="1024"
                      max="8192"
                      step="1024"
                      value={localConfig.generation.maxTokens}
                      onChange={(e) => setLocalConfig(prev => ({ ...prev, generation: { ...prev.generation, maxTokens: parseInt(e.target.value) } }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">
                      Top P: {localConfig.generation.topP}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={localConfig.generation.topP}
                      onChange={(e) => setLocalConfig(prev => ({ ...prev, generation: { ...prev.generation, topP: parseFloat(e.target.value) } }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">
                      上下文窗口: {localConfig.generation.contextWindow.toLocaleString()}
                    </label>
                    <select
                      value={localConfig.generation.contextWindow}
                      onChange={(e) => setLocalConfig(prev => ({ ...prev, generation: { ...prev.generation, contextWindow: parseInt(e.target.value) } }))}
                      className="w-full rounded-xl border border-black/10 px-4 py-3 text-[14px]"
                    >
                      <option value="8192">8K</option>
                      <option value="32768">32K</option>
                      <option value="128000">128K</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-black/5 p-4">
                  <input
                    type="checkbox"
                    id="json-mode"
                    checked={localConfig.generation.jsonMode}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, generation: { ...prev.generation, jsonMode: e.target.checked } }))}
                    className="h-5 w-5 rounded border-black/20"
                  />
                  <label htmlFor="json-mode" className="text-[14px] text-black">
                    启用 JSON 模式（确保输出结构化数据）
                  </label>
                </div>

                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-[13px] text-amber-700">
                    <strong>研究建议：</strong>学术论文分析建议 Temperature 0.3-0.5，
                    节点摘要生成建议 0.5-0.7。启用 JSON 模式可确保输出格式一致。
                  </p>
                </div>
              </div>
            )}

            {/* 研究流程 */}
            {activeTab === 'research' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[16px] font-medium text-black">研究流程配置</h3>
                  <p className="mt-1 text-[13px] text-black/50">控制发现、生成和分支管理的参数</p>
                </div>

                <div className="space-y-6">
                  {/* 发现阶段 */}
                  <div className="rounded-xl border border-black/8 p-4">
                    <h4 className="mb-4 text-[14px] font-medium text-black">发现阶段</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-[13px] text-black">候选池大小: {localConfig.research.discovery.candidatePoolSize}</label>
                        <input
                          type="range"
                          min="5"
                          max="20"
                          step="1"
                          value={localConfig.research.discovery.candidatePoolSize}
                          onChange={(e) => setLocalConfig(prev => ({ 
                            ...prev, 
                            research: { 
                              ...prev.research, 
                              discovery: { ...prev.research.discovery, candidatePoolSize: parseInt(e.target.value) } 
                            } 
                          }))}
                          className="w-full"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-[13px] text-black">搜索范围（年）: {localConfig.research.discovery.searchYearRange}</label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={localConfig.research.discovery.searchYearRange}
                          onChange={(e) => setLocalConfig(prev => ({ 
                            ...prev, 
                            research: { 
                              ...prev.research, 
                              discovery: { ...prev.research.discovery, searchYearRange: parseInt(e.target.value) } 
                            } 
                          }))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 节点生成 */}
                  <div className="rounded-xl border border-black/8 p-4">
                    <h4 className="mb-4 text-[14px] font-medium text-black">节点生成</h4>
                    
                    <div className="space-y-3">
                      {[
                        { key: 'generateImagePrompt', label: '生成配图描述' },
                        { key: 'extractKeyCitations', label: '提取关键引用' },
                        { key: 'generateEnglishSummary', label: '生成英文摘要' },
                        { key: 'analyzeFigures', label: '分析论文图表' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center justify-between rounded-lg bg-black/5 p-3">
                          <span className="text-[14px] text-black">{label}</span>
                          <input
                            type="checkbox"
                            checked={localConfig.research.nodeGeneration[key as keyof typeof localConfig.research.nodeGeneration] as boolean}
                            onChange={(e) => setLocalConfig(prev => ({ 
                              ...prev, 
                              research: { 
                                ...prev.research, 
                                nodeGeneration: { ...prev.research.nodeGeneration, [key]: e.target.checked } 
                              } 
                            }))}
                            className="h-5 w-5 rounded border-black/20"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 批量研究 */}
            {activeTab === 'batch' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[16px] font-medium text-black">批量研究配置</h3>
                  <p className="mt-1 text-[13px] text-black/50">配置自动批量研究所有主题的参数</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-black/5 p-4">
                    <div>
                      <p className="text-[14px] font-medium text-black">启用批量研究模式</p>
                      <p className="text-[12px] text-black/50">自动研究所有未完成主题</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={localConfig.research.batchResearch.enabled}
                      onChange={(e) => setLocalConfig(prev => ({ 
                        ...prev, 
                        research: { 
                          ...prev.research, 
                          batchResearch: { ...prev.research.batchResearch, enabled: e.target.checked } 
                        } 
                      }))}
                      className="h-5 w-5 rounded border-black/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">
                      同时处理主题数: {localConfig.research.batchResearch.concurrentTopics}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={localConfig.research.batchResearch.concurrentTopics}
                      onChange={(e) => setLocalConfig(prev => ({ 
                        ...prev, 
                        research: { 
                          ...prev.research, 
                          batchResearch: { ...prev.research.batchResearch, concurrentTopics: parseInt(e.target.value) } 
                        } 
                      }))}
                      className="w-full"
                    />
                    <p className="mt-1 text-[12px] text-black/40">数值越高速度越快，但 API 消耗越大</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">
                      每个主题最大阶段数: {localConfig.research.batchResearch.maxStagesPerTopic}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={localConfig.research.batchResearch.maxStagesPerTopic}
                      onChange={(e) => setLocalConfig(prev => ({ 
                        ...prev, 
                        research: { 
                          ...prev.research, 
                          batchResearch: { ...prev.research.batchResearch, maxStagesPerTopic: parseInt(e.target.value) } 
                        } 
                      }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-black">
                      完成阈值（节点数）: {localConfig.research.batchResearch.completionThreshold}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={localConfig.research.batchResearch.completionThreshold}
                      onChange={(e) => setLocalConfig(prev => ({ 
                        ...prev, 
                        research: { 
                          ...prev.research, 
                          batchResearch: { ...prev.research.batchResearch, completionThreshold: parseInt(e.target.value) } 
                        } 
                      }))}
                      className="w-full"
                    />
                    <p className="mt-1 text-[12px] text-black/40">节点数达到此值视为研究完成</p>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-black/5 p-4">
                    <div>
                      <p className="text-[14px] font-medium text-black">跳过已完成的主题</p>
                      <p className="text-[12px] text-black/50">节点数达到阈值的主题将跳过</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={localConfig.research.batchResearch.skipCompleted}
                      onChange={(e) => setLocalConfig(prev => ({ 
                        ...prev, 
                        research: { 
                          ...prev.research, 
                          batchResearch: { ...prev.research.batchResearch, skipCompleted: e.target.checked } 
                        } 
                      }))}
                      className="h-5 w-5 rounded border-black/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 提示词 */}
            {activeTab === 'prompts' && (
              <PromptTemplateManager />
            )}

            {/* 定时任务 */}
            {activeTab === 'scheduler' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[16px] font-medium text-black">定时任务管理</h3>
                  <p className="mt-1 text-[13px] text-black/50">自动执行论文发现和数据同步</p>
                </div>

                <TaskScheduler />
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between border-t border-black/8 px-6 py-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] text-black/50 transition hover:bg-black/5 hover:text-black"
          >
            <RotateCcw className="h-4 w-4" />
            重置默认
          </button>

          <div className="flex items-center gap-3">
            {showSaveSuccess && (
              <span className="text-[14px] text-green-600">保存成功！</span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 rounded-xl bg-black px-6 py-2 text-[14px] font-medium text-white transition hover:bg-black/85"
            >
              <Save className="h-4 w-4" />
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
