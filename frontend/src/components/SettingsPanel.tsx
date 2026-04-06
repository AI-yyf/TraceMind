import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock3, KeyRound, Layers3, MessageSquare, RefreshCcw, Save, SlidersHorizontal, Workflow, X } from 'lucide-react'

import { useConfig } from '@/hooks/useConfig'
import type { ModelCapabilitySummary, ModelConfigResponse, ModelConfigSaveResponse, OmniIssue, UserModelConfig } from '@/types/alpha'
import type { AppConfig } from '@/types/config'
import { MODEL_CONFIG_UPDATED_EVENT } from '@/utils/workbench-events'
import { apiGet, apiPost, buildApiUrl } from '@/utils/api'
import { cn } from '@/utils/cn'
import { TaskScheduler } from './TaskScheduler'

type SettingsTab = 'models' | 'generation' | 'research' | 'batch' | 'prompts' | 'scheduler'
type SlotForm = { provider: string; model: string; baseUrl: string; apiKey: string }

const tabs = [
  { id: 'models' as const, label: '模型接入', icon: KeyRound },
  { id: 'generation' as const, label: '生成参数', icon: SlidersHorizontal },
  { id: 'research' as const, label: '研究流程', icon: Workflow },
  { id: 'batch' as const, label: '批量研究', icon: Layers3 },
  { id: 'prompts' as const, label: '提示词', icon: MessageSquare },
  { id: 'scheduler' as const, label: '定时任务', icon: Clock3 },
]

const emptySlot: SlotForm = { provider: '', model: '', baseUrl: '', apiKey: '' }

export function SettingsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { config, updateGenerationConfig, updateResearchConfig, resetConfig } = useConfig()
  const [activeTab, setActiveTab] = useState<SettingsTab>('models')
  const [localConfig, setLocalConfig] = useState<AppConfig>(config)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [saved, setSaved] = useState(false)
  const [modelConfig, setModelConfig] = useState<ModelConfigResponse | null>(null)
  const [capabilities, setCapabilities] = useState<ModelCapabilitySummary | null>(null)
  const [languageForm, setLanguageForm] = useState<SlotForm>(emptySlot)
  const [multimodalForm, setMultimodalForm] = useState<SlotForm>(emptySlot)
  const [modelNotice, setModelNotice] = useState<OmniIssue | null>(null)
  const [savingModels, setSavingModels] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLocalConfig(config)
  }, [config, isOpen])

  useEffect(() => {
    if (!isOpen) return
    let alive = true

    Promise.all([apiGet<ModelConfigResponse>('/api/model-configs'), apiGet<ModelCapabilitySummary>('/api/model-capabilities')])
      .then(([configResponse, capabilityResponse]) => {
        if (!alive) return
        setModelConfig(configResponse)
        setCapabilities(capabilityResponse)
        setLanguageForm({
          provider: configResponse.config.language?.provider ?? '',
          model: configResponse.config.language?.model ?? '',
          baseUrl: configResponse.config.language?.baseUrl ?? '',
          apiKey: '',
        })
        setMultimodalForm({
          provider: configResponse.config.multimodal?.provider ?? '',
          model: configResponse.config.multimodal?.model ?? '',
          baseUrl: configResponse.config.multimodal?.baseUrl ?? '',
          apiKey: '',
        })
      })
      .catch(() => {
        if (alive) {
          setModelNotice({
            code: 'provider_error',
            title: '模型中心暂时不可用',
            message: '模型配置接口没有返回结果，但设置中心仍然保留在页面上，方便你继续检查本地配置。',
          })
        }
      })

    return () => {
      alive = false
    }
  }, [isOpen])

  const languageModels = useMemo(
    () => modelConfig?.catalog.find((entry) => entry.provider === languageForm.provider)?.models ?? [],
    [modelConfig, languageForm.provider],
  )
  const multimodalModels = useMemo(
    () => modelConfig?.catalog.find((entry) => entry.provider === multimodalForm.provider)?.models ?? [],
    [modelConfig, multimodalForm.provider],
  )

  if (!isOpen) return null

  async function saveModels() {
    setSavingModels(true)
    setModelNotice(null)
    try {
      const payload = {
        language:
          languageForm.provider && languageForm.model
            ? {
                provider: languageForm.provider as never,
                model: languageForm.model,
                baseUrl: languageForm.baseUrl || undefined,
                apiKey: languageForm.apiKey || undefined,
              }
            : null,
        multimodal:
          multimodalForm.provider && multimodalForm.model
            ? {
                provider: multimodalForm.provider as never,
                model: multimodalForm.model,
                baseUrl: multimodalForm.baseUrl || undefined,
                apiKey: multimodalForm.apiKey || undefined,
              }
            : null,
      } satisfies UserModelConfig

      const response = await apiPost<ModelConfigSaveResponse, UserModelConfig>('/api/model-configs', payload)
      setCapabilities(await apiGet<ModelCapabilitySummary>('/api/model-capabilities'))
      setModelConfig(await apiGet<ModelConfigResponse>('/api/model-configs'))
      setLanguageForm((current) => ({ ...current, apiKey: '' }))
      setMultimodalForm((current) => ({ ...current, apiKey: '' }))
      setModelNotice(response.validationIssues?.[0] ?? null)

      window.dispatchEvent(
        new CustomEvent(MODEL_CONFIG_UPDATED_EVENT, {
          detail: response.slots,
        }),
      )

      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch {
      setModelNotice({
        code: 'provider_error',
        title: '保存失败',
        message: '模型设置没有保存成功，请检查接入地址、密钥和后端状态。',
      })
    } finally {
      setSavingModels(false)
    }
  }

  function saveLocalSettings() {
    updateGenerationConfig(localConfig.generation)
    updateResearchConfig(localConfig.research)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  async function testConnection() {
    setTestStatus('testing')
    try {
      const response = await fetch(buildApiUrl('/health'))
      setTestStatus(response.ok ? 'success' : 'error')
    } catch {
      setTestStatus('error')
    }
    window.setTimeout(() => setTestStatus('idle'), 3000)
  }

  return (
    <div className="fixed inset-0 z-[110]">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" aria-label="关闭设置中心" />

      <section className="absolute right-0 top-0 flex h-full w-full max-w-[960px] flex-col border-l border-black/10 bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.12)]">
        <header className="flex items-start justify-between gap-4 border-b border-black/10 px-6 py-5">
          <div>
            <div className="text-[11px] tracking-[0.24em] text-black/40">设置中心</div>
            <h2 className="mt-2 text-[24px] font-semibold text-black">研究配置与模型设置</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-black/58">
              右侧工作台只保留轻量入口；完整的模型、提示词、流程和调度设置统一放在这里。
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-black/10 bg-white p-2 text-black/60">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[220px] border-r border-black/10 bg-[var(--surface-muted)] p-4">
            <div className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[20px] border px-4 py-3 text-left text-sm transition',
                      activeTab === tab.id
                        ? 'border-[#f59e0b] bg-white text-[var(--accent-ink)] shadow-[0_10px_24px_rgba(245,158,11,0.08)]'
                        : 'border-transparent bg-white text-black/60 hover:border-black/10',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => void testConnection()}
              className={cn(
                'mt-6 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-white',
                testStatus === 'success'
                  ? 'bg-green-600'
                  : testStatus === 'error'
                  ? 'bg-red-600'
                  : 'bg-black',
              )}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing'
                ? '测试中…'
                : testStatus === 'success'
                  ? '连接正常'
                  : testStatus === 'error'
                    ? '连接失败'
                    : '测试连接'}
            </button>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {activeTab === 'models' && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <StatusCard label="语言模型" ready={capabilities?.slots.language.apiKeyStatus === 'configured'} model={capabilities?.slots.language.model ?? '未配置'} />
                  <StatusCard label="多模态模型" ready={capabilities?.slots.multimodal.apiKeyStatus === 'configured'} model={capabilities?.slots.multimodal.model ?? '未配置'} />
                </div>
                {modelNotice && <NoticeCard notice={modelNotice} />}
                <SlotCard
                  title="语言模型槽位"
                  form={languageForm}
                  setForm={setLanguageForm}
                  preview={modelConfig?.config.language?.apiKeyPreview}
                  providers={modelConfig?.catalog ?? []}
                  models={languageModels.map((item) => ({ label: item.label, value: item.id }))}
                />
                <SlotCard
                  title="多模态模型槽位"
                  form={multimodalForm}
                  setForm={setMultimodalForm}
                  preview={modelConfig?.config.multimodal?.apiKeyPreview}
                  providers={modelConfig?.catalog ?? []}
                  models={multimodalModels.map((item) => ({ label: item.label, value: item.id }))}
                />
                <button type="button" onClick={() => void saveModels()} disabled={savingModels} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60">
                  {savingModels ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存模型设置
                </button>
              </div>
            )}

            {activeTab === 'generation' && (
              <div className="space-y-5">
                <PanelTitle title="生成参数" body="控制默认回答风格、生成稳定性与上下文窗口。" />
                <RangeCard label={`温度系数 · ${localConfig.generation.temperature}`} min={0} max={2} step={0.1} value={localConfig.generation.temperature} onChange={(value) => setLocalConfig((current) => ({ ...current, generation: { ...current.generation, temperature: value } }))} />
                <RangeCard label={`最大输出长度 · ${localConfig.generation.maxTokens}`} min={1024} max={8192} step={512} value={localConfig.generation.maxTokens} onChange={(value) => setLocalConfig((current) => ({ ...current, generation: { ...current.generation, maxTokens: value } }))} />
                <RangeCard label={`采样阈值 · ${localConfig.generation.topP}`} min={0} max={1} step={0.1} value={localConfig.generation.topP} onChange={(value) => setLocalConfig((current) => ({ ...current, generation: { ...current.generation, topP: value } }))} />
              </div>
            )}

            {activeTab === 'research' && (
              <div className="space-y-5">
                <PanelTitle title="研究流程" body="控制发现宽度、搜索时间范围与节点生成行为。" />
                <RangeCard label={`候选池规模 · ${localConfig.research.discovery.candidatePoolSize}`} min={5} max={20} step={1} value={localConfig.research.discovery.candidatePoolSize} onChange={(value) => setLocalConfig((current) => ({ ...current, research: { ...current.research, discovery: { ...current.research.discovery, candidatePoolSize: value } } }))} />
                <RangeCard label={`搜索年份范围 · ${localConfig.research.discovery.searchYearRange}`} min={1} max={10} step={1} value={localConfig.research.discovery.searchYearRange} onChange={(value) => setLocalConfig((current) => ({ ...current, research: { ...current.research, discovery: { ...current.research.discovery, searchYearRange: value } } }))} />
                <ToggleCard label="抽取关键引用" checked={localConfig.research.nodeGeneration.extractKeyCitations} onChange={(checked) => setLocalConfig((current) => ({ ...current, research: { ...current.research, nodeGeneration: { ...current.research.nodeGeneration, extractKeyCitations: checked } } }))} />
                <ToggleCard label="分析图表" checked={localConfig.research.nodeGeneration.analyzeFigures} onChange={(checked) => setLocalConfig((current) => ({ ...current, research: { ...current.research, nodeGeneration: { ...current.research.nodeGeneration, analyzeFigures: checked } } }))} />
              </div>
            )}

            {activeTab === 'batch' && (
              <div className="space-y-5">
                <PanelTitle title="批量研究" body="控制批量推进时的并发、阈值和跳过策略。" />
                <ToggleCard label="启用批量研究" checked={localConfig.research.batchResearch.enabled} onChange={(checked) => setLocalConfig((current) => ({ ...current, research: { ...current.research, batchResearch: { ...current.research.batchResearch, enabled: checked } } }))} />
                <RangeCard label={`并行主题数 · ${localConfig.research.batchResearch.concurrentTopics}`} min={1} max={5} step={1} value={localConfig.research.batchResearch.concurrentTopics} onChange={(value) => setLocalConfig((current) => ({ ...current, research: { ...current.research, batchResearch: { ...current.research.batchResearch, concurrentTopics: value } } }))} />
                <RangeCard label={`完成阈值 · ${localConfig.research.batchResearch.completionThreshold}`} min={1} max={20} step={1} value={localConfig.research.batchResearch.completionThreshold} onChange={(value) => setLocalConfig((current) => ({ ...current, research: { ...current.research, batchResearch: { ...current.research.batchResearch, completionThreshold: value } } }))} />
              </div>
            )}

            {activeTab === 'prompts' && (
              <div className="space-y-5">
                <PanelTitle title="提示词" body="完整模板管理保留在设置中心，不再塞进聊天栏。" />
                <div className="rounded-[24px] border border-black/10 bg-[var(--surface-muted)] p-5">
                  <p className="text-sm leading-7 text-black/60">
                    Prompt Studio 已经独立成页。这里不再内嵌长表单，避免设置抽屉被提示词编辑器撑满；完整的母模板、多语言版本、运行时轮数、主题记忆和外部 agent 适配说明，都统一放在独立页面里维护。
                  </p>
                  <Link
                    to="/prompt-studio"
                    onClick={onClose}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/70 transition hover:border-black/18 hover:text-black"
                  >
                    <MessageSquare className="h-4 w-4" />
                    打开 Prompt Studio
                  </Link>
                </div>
              </div>
            )}

            {activeTab === 'scheduler' && (
              <div className="space-y-5">
                <PanelTitle title="定时任务" body="调度与执行策略统一在这里管理。" />
                <TaskScheduler />
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-black/10 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              resetConfig()
              setLocalConfig(config)
            }}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/62"
          >
            <RefreshCcw className="h-4 w-4" />
            重置本地设置
          </button>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="inline-flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                已保存
              </span>
            )}
            {activeTab !== 'models' && activeTab !== 'prompts' && activeTab !== 'scheduler' && (
              <button type="button" onClick={saveLocalSettings} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
                <Save className="h-4 w-4" />
                保存当前设置
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}

function PanelTitle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-[28px] font-semibold text-black">{title}</h3>
      <p className="mt-2 text-[14px] leading-7 text-black/58">{body}</p>
    </div>
  )
}

function StatusCard({ label, ready, model }: { label: string; ready: boolean; model: string }) {
  return (
    <article className="rounded-[24px] border border-black/10 bg-white p-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">{label}</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-[16px] font-semibold text-black">{model}</div>
        {ready ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
      </div>
    </article>
  )
}

function NoticeCard({ notice }: { notice: OmniIssue }) {
  return (
    <div className="rounded-[24px] border border-[#f59e0b]/35 bg-white px-5 py-4 text-black/78 shadow-[0_10px_24px_rgba(245,158,11,0.06)]">
      <div className="text-sm font-semibold text-[var(--accent-ink)]">{notice.title}</div>
      <p className="mt-1 text-[13px] leading-6">{notice.message}</p>
    </div>
  )
}

function SlotCard({
  title,
  form,
  setForm,
  preview,
  providers,
  models,
}: {
  title: string
  form: SlotForm
  setForm: (form: SlotForm) => void
  preview?: string
  providers: Array<{ provider: string; label: string; baseUrl: string }>
  models: Array<{ label: string; value: string }>
}) {
  return (
    <article className="rounded-[24px] border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[16px] font-semibold text-black">{title}</div>
        {preview && <div className="text-[11px] text-black/42">已保存密钥：{preview}</div>}
      </div>
      <div className="mt-4 grid gap-3">
        <select
          value={form.provider}
          onChange={(event) => {
            const provider = providers.find((item) => item.provider === event.target.value)
            setForm({ provider: event.target.value, model: '', baseUrl: provider?.baseUrl ?? '', apiKey: form.apiKey })
          }}
          className="rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none"
        >
          <option value="">选择提供商</option>
          {providers.map((item) => (
            <option key={item.provider} value={item.provider}>
              {item.label}
            </option>
          ))}
        </select>
        <select value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className="rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none">
          <option value="">选择模型</option>
          {models.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="自定义模型标识" className="rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/30" />
        <input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="接入地址" className="rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/30" />
        <input value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder="留空则继续使用已保存的密钥" className="rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/30" />
      </div>
    </article>
  )
}

function RangeCard({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block rounded-[24px] border border-black/10 bg-white p-5">
      <div className="text-sm font-medium text-black">{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-4 w-full accent-[#f59e0b]" />
    </label>
  )
}

function ToggleCard({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-[24px] border border-black/10 bg-white p-5">
      <span className="text-sm font-medium text-black">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 rounded border-black/20 accent-[#f59e0b]" />
    </label>
  )
}

export default SettingsPanel
