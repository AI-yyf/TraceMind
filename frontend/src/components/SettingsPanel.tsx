/**
 * Refactored Settings Panel with unified model-config types
 * Supports 10 providers, role overrides, task routing, and presets
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Clock3, KeyRound, Layers3, Loader2,
  MessageSquare, RefreshCcw, Save, SlidersHorizontal, Workflow, X, Zap,
  Cpu,
} from 'lucide-react'

import type { ModelCapabilitySummary, OmniIssue, ResearchRoleId, TaskRouteTarget, UserModelConfig } from '@/types/alpha'
import { useConfig } from '@/hooks/useConfig'
import type { AppConfig } from '@/types/config'
import { apiGet, apiPost, buildApiUrl } from '@/utils/api'
import { cn } from '@/utils/cn'
import { TaskScheduler } from './TaskScheduler'
import {
  assertHealthStatusContract,
  assertModelCapabilitySummaryContract,
  assertModelConfigSaveResponseContract,
  assertProviderCatalogContract,
  assertSanitizedUserModelConfigContract,
} from '@/utils/contracts'

// Import unified types from shared module
import type { OmniTask, ProviderId, ProviderCatalogEntry } from '@shared/model-config'
import { PROVIDER_LABELS, OMNI_TASK_LABELS, RESEARCH_ROLE_LABELS, DEFAULT_MODEL_PRESETS } from '@shared/model-config'

// === Constants ===
type SettingsTab = 'models' | 'generation' | 'research' | 'batch' | 'prompts' | 'scheduler' | 'categories'
const tabs = [
  { id: 'models' as const, label: '模型接入', icon: KeyRound },
  { id: 'categories' as const, label: '任务分类', icon: Cpu },
  { id: 'generation' as const, label: '生成参数', icon: SlidersHorizontal },
  { id: 'research' as const, label: '研究流程', icon: Workflow },
  { id: 'batch' as const, label: '批量研究', icon: Layers3 },
  { id: 'prompts' as const, label: '提示词', icon: MessageSquare },
  { id: 'scheduler' as const, label: '定时任务', icon: Clock3 },
]
const ALL_PROVIDERS = Object.keys(PROVIDER_LABELS) as ProviderId[]
const ALL_ROLES = Object.keys(RESEARCH_ROLE_LABELS) as ResearchRoleId[]
const ALL_TASKS = Object.keys(OMNI_TASK_LABELS) as OmniTask[]
const ROUTING_TARGETS: Array<{ value: TaskRouteTarget; label: string }> = [
  { value: 'language', label: '语言模型' },
  { value: 'multimodal', label: '多模态模型' },
  ...ALL_ROLES.map(r => ({ value: r as TaskRouteTarget, label: RESEARCH_ROLE_LABELS[r] })),
]

// === Types ===
interface SlotForm { provider: ProviderId | ''; model: string; baseUrl: string; apiKey: string }
interface OmniConfigData {
  language: { provider: ProviderId | null; model: string | null; baseUrl?: string; apiKeyPreview?: string; apiKeyStatus: 'configured' | 'missing' } | null
  multimodal: { provider: ProviderId | null; model: string | null; baseUrl?: string; apiKeyPreview?: string; apiKeyStatus: 'configured' | 'missing' } | null
  roles?: Partial<Record<ResearchRoleId, { provider: ProviderId | null; model: string | null; baseUrl?: string; apiKeyPreview?: string; apiKeyStatus: 'configured' | 'missing' } | null>>
  taskRouting?: Partial<Record<OmniTask, TaskRouteTarget>>
}
const EMPTY_SLOT: SlotForm = { provider: '', model: '', baseUrl: '', apiKey: '' }

// === Helpers ===
function maskApiKey(key: string): string { return key.length <= 8 ? '***' : `${key.slice(0, 8)}***` }
function buildPayload(form: SlotForm) { return { provider: form.provider as ProviderId, model: form.model, baseUrl: form.baseUrl || undefined, apiKey: form.apiKey || undefined } }

// === Main Component ===
export function SettingsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { config, updateGenerationConfig, updateResearchConfig, resetConfig } = useConfig()
  const [activeTab, setActiveTab] = useState<SettingsTab>('models')
  const [localConfig, setLocalConfig] = useState<AppConfig>(config)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [saved, setSaved] = useState(false)

  // Model config state
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([])
  const [omniConfig, setOmniConfig] = useState<OmniConfigData | null>(null)
  const [capabilities, setCapabilities] = useState<ModelCapabilitySummary | null>(null)
  const [languageForm, setLanguageForm] = useState<SlotForm>(EMPTY_SLOT)
  const [multimodalForm, setMultimodalForm] = useState<SlotForm>(EMPTY_SLOT)
  const [roleOverrides, setRoleOverrides] = useState<Partial<Record<ResearchRoleId, SlotForm>>>({})
  const [taskRouting, setTaskRouting] = useState<Partial<Record<OmniTask, TaskRouteTarget>>>({})
  const [selectedPreset, setSelectedPreset] = useState('')
  const [modelNotice, setModelNotice] = useState<OmniIssue | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (isOpen) setLocalConfig(config) }, [config, isOpen])

  // Fetch data on open
  useEffect(() => {
    if (!isOpen) return
    let alive = true
    setLoading(true)
    setModelNotice(null)
    Promise.all([
      apiGet<unknown>('/api/omni/catalog'),
      apiGet<unknown>('/api/omni/config'),
      apiGet<unknown>('/api/omni/capabilities'),
    ]).then(([catData, cfgData, capData]) => {
      if (!alive) return
      assertProviderCatalogContract(catData)
      assertSanitizedUserModelConfigContract(cfgData)
      assertModelCapabilitySummaryContract(capData)
      setCatalog(catData)
      setOmniConfig(cfgData)
      setCapabilities(capData)
      setLanguageForm({ provider: cfgData.language?.provider ?? '', model: cfgData.language?.model ?? '', baseUrl: cfgData.language?.baseUrl ?? '', apiKey: '' })
      setMultimodalForm({ provider: cfgData.multimodal?.provider ?? '', model: cfgData.multimodal?.model ?? '', baseUrl: cfgData.multimodal?.baseUrl ?? '', apiKey: '' })
      const roles: Partial<Record<ResearchRoleId, SlotForm>> = {}
      if (cfgData.roles) {
        for (const [id, c] of Object.entries(cfgData.roles)) {
          if (c?.provider && c?.model) roles[id as ResearchRoleId] = { provider: c.provider, model: c.model, baseUrl: c.baseUrl ?? '', apiKey: '' }
        }
      }
      setRoleOverrides(roles)
      setTaskRouting(cfgData.taskRouting ?? {})
    }).catch(() => {
      if (alive) setModelNotice({ code: 'provider_error', title: '模型中心暂时不可用', message: '模型配置接口没有返回结果。' })
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [isOpen])

  const langModels = useMemo(() => catalog.find(e => e.provider === languageForm.provider)?.models ?? [], [catalog, languageForm.provider])
  const mmModels = useMemo(() => catalog.find(e => e.provider === multimodalForm.provider)?.models ?? [], [catalog, multimodalForm.provider])
  const getModels = useCallback((p: ProviderId | '') => p ? (catalog.find(e => e.provider === p)?.models ?? []) : [], [catalog])

  const applyPreset = useCallback((id: string) => {
    const p = DEFAULT_MODEL_PRESETS.find(x => x.id === id)
    if (!p) return
    setSelectedPreset(id)
    setLanguageForm({ provider: p.language.provider, model: p.language.model, baseUrl: catalog.find(e => e.provider === p.language.provider)?.baseUrl ?? '', apiKey: '' })
    setMultimodalForm({ provider: p.multimodal.provider, model: p.multimodal.model, baseUrl: catalog.find(e => e.provider === p.multimodal.provider)?.baseUrl ?? '', apiKey: '' })
  }, [catalog])

  const saveModels = useCallback(async () => {
    setSaving(true)
    setModelNotice(null)
    try {
      const rolesPayload: Partial<Record<ResearchRoleId, ReturnType<typeof buildPayload>>> = {}
      for (const [id, f] of Object.entries(roleOverrides)) if (f?.provider && f?.model) rolesPayload[id as ResearchRoleId] = buildPayload(f)
      const payload: UserModelConfig = {
        language: languageForm.provider && languageForm.model ? buildPayload(languageForm) : null,
        multimodal: multimodalForm.provider && multimodalForm.model ? buildPayload(multimodalForm) : null,
        roles: Object.keys(rolesPayload).length > 0 ? rolesPayload : undefined,
        taskRouting: Object.keys(taskRouting).length > 0 ? taskRouting : undefined,
      }
      const res = await apiPost<unknown, UserModelConfig>('/api/omni/config', payload)
      assertModelConfigSaveResponseContract(res)
      setCapabilities({ ...capabilities!, userId: res.userId, slots: res.slots, roles: res.roles ?? capabilities?.roles } as ModelCapabilitySummary)
      setLanguageForm(c => ({ ...c, apiKey: '' }))
      setMultimodalForm(c => ({ ...c, apiKey: '' }))
      if (res.validationIssues?.[0]) setModelNotice(res.validationIssues[0])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { setModelNotice({ code: 'provider_error', title: '保存失败', message: '请检查接入地址、密钥和后端状态。' }) }
    finally { setSaving(false) }
  }, [languageForm, multimodalForm, roleOverrides, taskRouting, capabilities])

  const resetModels = useCallback(() => {
    if (!omniConfig) return
    setLanguageForm({ provider: omniConfig.language?.provider ?? '', model: omniConfig.language?.model ?? '', baseUrl: omniConfig.language?.baseUrl ?? '', apiKey: '' })
    setMultimodalForm({ provider: omniConfig.multimodal?.provider ?? '', model: omniConfig.multimodal?.model ?? '', baseUrl: omniConfig.multimodal?.baseUrl ?? '', apiKey: '' })
    const roles: Partial<Record<ResearchRoleId, SlotForm>> = {}
    if (omniConfig.roles) for (const [id, c] of Object.entries(omniConfig.roles)) if (c?.provider && c?.model) roles[id as ResearchRoleId] = { provider: c.provider, model: c.model, baseUrl: c.baseUrl ?? '', apiKey: '' }
    setRoleOverrides(roles)
    setTaskRouting(omniConfig.taskRouting ?? {})
    setSelectedPreset('')
    setModelNotice(null)
  }, [omniConfig])

  const testConn = async () => {
    setTestStatus('testing')
    try {
      const response = await fetch(buildApiUrl('/health'))
      if (!response.ok) {
        setTestStatus('error')
      } else {
        const payload = await response.json() as unknown
        assertHealthStatusContract(payload)
        setTestStatus(payload.status === 'ok' ? 'success' : 'error')
      }
    } catch {
      setTestStatus('error')
    }
    setTimeout(() => setTestStatus('idle'), 3000)
  }
  const saveLocal = () => {
    updateGenerationConfig(localConfig.generation)
    updateResearchConfig(localConfig.research)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[110]">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" aria-label="关闭设置中心" />
      <section className="absolute right-0 top-0 flex h-full w-full max-w-[960px] flex-col border-l border-black/10 bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.12)]">
        <header className="flex items-start justify-between gap-4 border-b border-black/10 px-6 py-5">
          <div>
            <div className="text-[11px] tracking-[0.24em] text-black/40">设置中心</div>
            <h2 className="mt-2 text-[24px] font-semibold text-black">研究配置与模型设置</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-black/58">统一管理 10 个提供商、模型槽位、角色覆盖、任务路由与预设方案。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-black/10 bg-white p-2 text-black/60"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="w-[220px] border-r border-black/10 bg-[var(--surface-muted)] p-4">
            <div className="space-y-2">{tabs.map(t => <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={cn('flex w-full items-center gap-3 rounded-[20px] border px-4 py-3 text-left text-sm transition', activeTab === t.id ? 'border-[#f59e0b] bg-white text-[var(--accent-ink)] shadow-[0_10px_24px_rgba(245,158,11,0.08)]' : 'border-transparent bg-white text-black/60 hover:border-black/10')}><t.icon className="h-4 w-4" />{t.label}</button>)}</div>
            <button type="button" onClick={() => void testConn()} className={cn('mt-6 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-white', testStatus === 'success' ? 'bg-green-600' : testStatus === 'error' ? 'bg-red-600' : 'bg-black')} disabled={testStatus === 'testing'}>{testStatus === 'testing' ? '测试中...' : testStatus === 'success' ? '连接正常' : testStatus === 'error' ? '连接失败' : '测试连接'}</button>
          </aside>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {activeTab === 'models' && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <StatusCard label="语言模型" ready={capabilities?.slots.language.apiKeyStatus === 'configured'} model={capabilities?.slots.language.model ?? '未配置'} />
                  <StatusCard label="多模态模型" ready={capabilities?.slots.multimodal.apiKeyStatus === 'configured'} model={capabilities?.slots.multimodal.model ?? '未配置'} />
                </div>
                {modelNotice && <NoticeCard notice={modelNotice} />}
                {loading && <div className="flex items-center gap-3 rounded-[24px] border border-black/10 bg-[var(--surface-muted)] px-5 py-4"><Loader2 className="h-4 w-4 animate-spin text-black/50" /><span className="text-sm text-black/60">加载模型目录...</span></div>}
                {/* Preset Selector */}
                <article className="rounded-[24px] border border-black/10 bg-white p-5">
                  <div className="flex items-center gap-3"><Zap className="h-4 w-4 text-amber-500" /><div className="text-[16px] font-semibold text-black">快速预设</div></div>
                  <p className="mt-2 text-[13px] leading-6 text-black/58">选择预设方案可一键配置语言和多模态槽位。</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{DEFAULT_MODEL_PRESETS.map(p => <button key={p.id} type="button" onClick={() => applyPreset(p.id)} disabled={saving} className={cn('rounded-[18px] border p-3 text-left transition disabled:opacity-50', selectedPreset === p.id ? 'border-[#f59e0b] bg-amber-50 shadow-[0_4px_12px_rgba(245,158,11,0.12)]' : 'border-black/8 bg-white hover:border-black/16')}><div className="text-[13px] font-medium text-black">{p.label}</div><div className="mt-1 text-[11px] leading-5 text-black/50">{p.description}</div><div className="mt-2 flex gap-2"><span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] text-black/60">{PROVIDER_LABELS[p.language.provider]}</span><span className="text-[10px] text-black/30">+</span><span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] text-black/60">{PROVIDER_LABELS[p.multimodal.provider]}</span></div></button>)}</div>
                </article>
                {/* Language Slot */}
                <SlotCard title="语言模型槽位" form={languageForm} setForm={setLanguageForm} apiKeyPreview={omniConfig?.language?.apiKeyPreview} apiKeyStatus={omniConfig?.language?.apiKeyStatus} models={langModels} disabled={saving} />
                {/* Multimodal Slot */}
                <SlotCard title="多模态模型槽位" form={multimodalForm} setForm={setMultimodalForm} apiKeyPreview={omniConfig?.multimodal?.apiKeyPreview} apiKeyStatus={omniConfig?.multimodal?.apiKeyStatus} models={mmModels} disabled={saving} />
                {/* Role Overrides */}
                <article className="rounded-[24px] border border-black/10 bg-white p-5">
                  <div className="text-[16px] font-semibold text-black">角色覆盖配置</div>
                  <p className="mt-2 text-[13px] leading-6 text-black/58">为特定研究角色指定专用模型，覆盖默认槽位。</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">{ALL_ROLES.map(rId => <RoleOverrideRow key={rId} roleId={rId} form={roleOverrides[rId]} setForm={f => setRoleOverrides(prev => ({ ...prev, [rId]: f }))} getModels={getModels} omniRole={omniConfig?.roles?.[rId]} disabled={saving} />)}</div>
                </article>
                {/* Task Routing */}
                <article className="rounded-[24px] border border-black/10 bg-white p-5">
                  <div className="text-[16px] font-semibold text-black">任务路由配置</div>
                  <p className="mt-2 text-[13px] leading-6 text-black/58">指定各类任务使用哪个槽位或角色模型。</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {ALL_TASKS.map(tId => (
                      <div key={tId} className="flex items-center justify-between gap-3 rounded-[18px] border border-black/8 bg-[var(--surface-muted)] px-4 py-3">
                        <span className="text-[13px] text-black">{OMNI_TASK_LABELS[tId]}</span>
                        <select
                          value={taskRouting[tId] ?? ''}
                          onChange={e => setTaskRouting(prev => ({ ...prev, [tId]: e.target.value as TaskRouteTarget }))}
                          disabled={saving}
                          className="rounded-[14px] border border-black/10 bg-white px-3 py-1.5 text-[12px] text-black outline-none"
                        >
                          <option value="">默认</option>
                          {ROUTING_TARGETS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </article>
                {/* Save / Reset */}
                <div className="flex items-center gap-3 pt-2">
                  <button type="button" onClick={() => void saveModels()} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存模型设置</button>
                  <button type="button" onClick={resetModels} disabled={saving} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-black/62 disabled:opacity-60"><RefreshCcw className="h-4 w-4" />重置</button>
                  {saved && <span className="inline-flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />已保存</span>}
                </div>
              </div>
            )}
            {activeTab === 'generation' && <div className="space-y-5"><PanelTitle title="生成参数" body="控制默认回答风格、生成稳定性与上下文窗口。" /><RangeCard label={`温度系数 · ${localConfig.generation.temperature}`} min={0} max={2} step={0.1} value={localConfig.generation.temperature} onChange={v => setLocalConfig(c => ({ ...c, generation: { ...c.generation, temperature: v } }))} /><RangeCard label={`最大输出长度 · ${localConfig.generation.maxTokens}`} min={1024} max={8192} step={512} value={localConfig.generation.maxTokens} onChange={v => setLocalConfig(c => ({ ...c, generation: { ...c.generation, maxTokens: v } }))} /><RangeCard label={`采样阈值 · ${localConfig.generation.topP}`} min={0} max={1} step={0.1} value={localConfig.generation.topP} onChange={v => setLocalConfig(c => ({ ...c, generation: { ...c.generation, topP: v } }))} /></div>}
            {activeTab === 'research' && <div className="space-y-5"><PanelTitle title="研究流程" body="控制发现宽度、搜索时间范围与节点生成行为。" /><RangeCard label={`候选池规模 · ${localConfig.research.discovery.candidatePoolSize}`} min={5} max={20} step={1} value={localConfig.research.discovery.candidatePoolSize} onChange={v => setLocalConfig(c => ({ ...c, research: { ...c.research, discovery: { ...c.research.discovery, candidatePoolSize: v } } }))} /><RangeCard label={`搜索年份范围 · ${localConfig.research.discovery.searchYearRange}`} min={1} max={10} step={1} value={localConfig.research.discovery.searchYearRange} onChange={v => setLocalConfig(c => ({ ...c, research: { ...c.research, discovery: { ...c.research.discovery, searchYearRange: v } } }))} /><ToggleCard label="抽取关键引用" checked={localConfig.research.nodeGeneration.extractKeyCitations} onChange={v => setLocalConfig(c => ({ ...c, research: { ...c.research, nodeGeneration: { ...c.research.nodeGeneration, extractKeyCitations: v } } }))} /><ToggleCard label="分析图表" checked={localConfig.research.nodeGeneration.analyzeFigures} onChange={v => setLocalConfig(c => ({ ...c, research: { ...c.research, nodeGeneration: { ...c.research.nodeGeneration, analyzeFigures: v } } }))} /></div>}
            {activeTab === 'batch' && <div className="space-y-5"><PanelTitle title="批量研究" body="控制批量推进时的并发、阈值和跳过策略。" /><ToggleCard label="启用批量研究" checked={localConfig.research.batchResearch.enabled} onChange={v => setLocalConfig(c => ({ ...c, research: { ...c.research, batchResearch: { ...c.research.batchResearch, enabled: v } } }))} /><RangeCard label={`并行主题数 · ${localConfig.research.batchResearch.concurrentTopics}`} min={1} max={5} step={1} value={localConfig.research.batchResearch.concurrentTopics} onChange={v => setLocalConfig(c => ({ ...c, research: { ...c.research, batchResearch: { ...c.research.batchResearch, concurrentTopics: v } } }))} /><RangeCard label={`完成阈值 · ${localConfig.research.batchResearch.completionThreshold}`} min={1} max={20} step={1} value={localConfig.research.batchResearch.completionThreshold} onChange={v => setLocalConfig(c => ({ ...c, research: { ...c.research, batchResearch: { ...c.research.batchResearch, completionThreshold: v } } }))} /></div>}
            {activeTab === 'prompts' && <div className="space-y-5"><PanelTitle title="提示词" body="完整模板管理保留在设置中心，不再塞进聊天栏。" /><div className="rounded-[24px] border border-black/10 bg-[var(--surface-muted)] p-5"><p className="text-sm leading-7 text-black/60">Prompt Studio 已经独立成页。完整的母模板、多语言版本、运行时轮数、主题记忆和外部 agent 适配说明，都统一放在独立页面里维护。</p><Link to="/prompt-studio" onClick={onClose} className="mt-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/70 transition hover:border-black/18 hover:text-black"><MessageSquare className="h-4 w-4" />打开 Prompt Studio</Link></div></div>}
            {activeTab === 'scheduler' && <div className="space-y-5"><PanelTitle title="定时任务" body="调度与执行策略统一在这里管理。" /><TaskScheduler /></div>}
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-black/10 px-6 py-4">
          <button type="button" onClick={() => { resetConfig(); setLocalConfig(config) }} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/62"><RefreshCcw className="h-4 w-4" />重置本地设置</button>
          <div className="flex items-center gap-3">{saved && activeTab !== 'models' && <span className="inline-flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />已保存</span>}{activeTab !== 'models' && activeTab !== 'prompts' && activeTab !== 'scheduler' && <button type="button" onClick={saveLocal} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white"><Save className="h-4 w-4" />保存当前设置</button>}</div>
        </footer>
      </section>
    </div>
  )
}

// === Sub-Components ===
function PanelTitle({ title, body }: { title: string; body: string }) { return <div><h3 className="text-[28px] font-semibold text-black">{title}</h3><p className="mt-2 text-[14px] leading-7 text-black/58">{body}</p></div> }
function StatusCard({ label, ready, model }: { label: string; ready: boolean; model: string }) { return <article className="rounded-[24px] border border-black/10 bg-white p-5"><div className="text-[11px] uppercase tracking-[0.18em] text-black/40">{label}</div><div className="mt-3 flex items-center justify-between gap-3"><div className="text-[16px] font-semibold text-black">{model}</div>{ready ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}</div></article> }
function NoticeCard({ notice }: { notice: OmniIssue }) { return <div className="rounded-[24px] border border-[#f59e0b]/35 bg-white px-5 py-4 text-black/78 shadow-[0_10px_24px_rgba(245,158,11,0.06)]"><div className="text-sm font-semibold text-[var(--accent-ink)]">{notice.title}</div><p className="mt-1 text-[13px] leading-6">{notice.message}</p></div> }
function RangeCard({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) { return <label className="block rounded-[24px] border border-black/10 bg-white p-5"><div className="text-sm font-medium text-black">{label}</div><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-4 w-full accent-[#f59e0b]" /></label> }
function ToggleCard({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="flex items-center justify-between rounded-[24px] border border-black/10 bg-white p-5"><span className="text-sm font-medium text-black">{label}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 rounded border-black/20 accent-[#f59e0b]" /></label> }

function SlotCard({ title, form, setForm, apiKeyPreview, apiKeyStatus, models, disabled }: { title: string; form: SlotForm; setForm: (f: SlotForm) => void; apiKeyPreview?: string; apiKeyStatus?: 'configured' | 'missing'; models: Array<{ id: string; label: string }>; disabled: boolean }) {
  const handleProvider = (v: string) => setForm({ provider: v as ProviderId, model: '', baseUrl: '', apiKey: form.apiKey })
  return <article className="rounded-[24px] border border-black/10 bg-white p-5">
    <div className="flex items-center justify-between gap-3"><div className="text-[16px] font-semibold text-black">{title}</div>{apiKeyStatus && <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]', apiKeyStatus === 'configured' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{apiKeyStatus === 'configured' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{apiKeyStatus === 'configured' ? '密钥已配置' : '密钥缺失'}</span>}</div>
    <div className="mt-4 grid gap-3">
      <div><label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-black/40">提供商</label><select value={form.provider} onChange={e => handleProvider(e.target.value)} disabled={disabled} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none disabled:opacity-50"><option value="">选择提供商</option>{ALL_PROVIDERS.map(id => <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>)}</select></div>
      <div><label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-black/40">模型</label><select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} disabled={disabled} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none disabled:opacity-50"><option value="">选择模型</option>{models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
      <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="自定义模型标识" disabled={disabled} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/30 disabled:opacity-50" />
      <input value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} placeholder="接入地址 (Base URL)" disabled={disabled} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/30 disabled:opacity-50" />
      <div><label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-black/40">API Key</label><input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder={apiKeyPreview ? `当前: ${maskApiKey(apiKeyPreview)}` : '留空则继续使用已保存的密钥'} disabled={disabled} className="w-full rounded-[18px] border border-black/10 bg-[var(--surface-muted)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/30 disabled:opacity-50" />{apiKeyPreview && !form.apiKey && <div className="mt-1 text-[11px] text-black/40">已保存密钥: {maskApiKey(apiKeyPreview)}</div>}</div>
    </div>
  </article>
}

function RoleOverrideRow({ roleId, form, setForm, getModels, omniRole, disabled }: { roleId: ResearchRoleId; form?: SlotForm; setForm: (f: SlotForm) => void; getModels: (p: ProviderId | '') => Array<{ id: string; label: string }>; omniRole?: { provider: ProviderId | null; model: string | null; apiKeyPreview?: string } | null; disabled: boolean }) {
  const current = form ?? EMPTY_SLOT
  const models = getModels(current.provider)
  return <div className="rounded-[18px] border border-black/8 bg-[var(--surface-muted)] p-3">
    <div className="flex items-center justify-between gap-2 mb-2"><span className="text-[13px] font-medium text-black">{RESEARCH_ROLE_LABELS[roleId]}</span>{omniRole?.apiKeyPreview && <span className="text-[10px] text-black/40">密钥: {maskApiKey(omniRole.apiKeyPreview)}</span>}</div>
    <div className="grid gap-2">
      <select value={current.provider} onChange={e => setForm({ provider: e.target.value as ProviderId, model: '', baseUrl: '', apiKey: '' })} disabled={disabled} className="w-full rounded-[14px] border border-black/10 bg-white px-3 py-2 text-[12px] text-black outline-none disabled:opacity-50"><option value="">继承默认</option>{ALL_PROVIDERS.map(id => <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>)}</select>
      {current.provider && <select value={current.model} onChange={e => setForm({ ...current, model: e.target.value })} disabled={disabled} className="w-full rounded-[14px] border border-black/10 bg-white px-3 py-2 text-[12px] text-black outline-none disabled:opacity-50"><option value="">选择模型</option>{models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>}
      {current.provider && <input value={current.model} onChange={e => setForm({ ...current, model: e.target.value })} placeholder="自定义模型" disabled={disabled} className="w-full rounded-[14px] border border-black/10 bg-white px-3 py-2 text-[12px] text-black outline-none placeholder:text-black/30 disabled:opacity-50" />}
      {current.provider && <input type="password" value={current.apiKey} onChange={e => setForm({ ...current, apiKey: e.target.value })} placeholder="API Key (可选)" disabled={disabled} className="w-full rounded-[14px] border border-black/10 bg-white px-3 py-2 text-[12px] text-black outline-none placeholder:text-black/30 disabled:opacity-50" />}
    </div>
  </div>
}

export default SettingsPanel
