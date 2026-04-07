import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Save,
  Upload,
} from 'lucide-react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { invalidateProductCopyCache } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { buildRolePayload } from './promptStudioModelConfig'
import type {
  ExternalAgentAssetPatch,
  ExternalAgentAssetRecord,
  GenerationRuntimeConfig,
  ModelCapabilitySummary,
  ModelConfigResponse,
  ModelConfigSaveResponse,
  OmniIssue,
  ProductCopyPatch,
  ProductCopyRecord,
  ProviderModelRef,
  PromptLanguageCode,
  PromptLanguageOption,
  PromptStudioBundle,
  PromptTemplatePatch,
  PromptTemplateRecord,
  ResearchRoleId,
  TaskRouteTarget,
  UserModelConfig,
} from '@/types/alpha'
import { apiGet, apiPost, buildApiUrl } from '@/utils/api'
import {
  MODEL_CONFIG_UPDATED_EVENT,
  PROMPT_STUDIO_UPDATED_EVENT,
} from '@/utils/workbench-events'

type SettingsTab = 'models' | 'pipeline' | 'prompts' | 'copy' | 'agents'
type CopyReader = (id: string, fallback: string) => string
type SlotForm = {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  providerOptions: Record<string, string>
  thinking: 'on' | 'off' | 'auto'
  citations: 'native' | 'backend'
  parser: 'native' | 'backend'
  temperature: string
  maxTokens: string
}
type CatalogProvider = ModelConfigResponse['catalog'][number]
type CatalogModel = CatalogProvider['models'][number]
type CatalogField = NonNullable<CatalogProvider['configFields']>[number]
type EditorialPolicyKey =
  keyof GenerationRuntimeConfig['editorialPolicies'][PromptLanguageCode]
type ProviderSlotKey = 'language' | 'multimodal'
type RoleFormMode = 'default' | 'custom'
type RoleFormState = {
  mode: RoleFormMode
  form: SlotForm
}
type OmniTaskId =
  | 'general_chat'
  | 'topic_chat'
  | 'topic_chat_vision'
  | 'topic_summary'
  | 'document_parse'
  | 'figure_analysis'
  | 'formula_recognition'
  | 'table_extraction'
  | 'evidence_explainer'

type RoleFormMap = Partial<Record<ResearchRoleId, RoleFormState>>
type TaskRoutingChoice = 'default' | TaskRouteTarget
type TaskRoutingForm = Partial<Record<OmniTaskId, TaskRoutingChoice>>
type TaskOverrideForm = Partial<Record<OmniTaskId, ProviderModelRef>>
type TaskRoutingItem = {
  id: OmniTaskId
  label: string
  description: string
  recommendedSlot: ProviderSlotKey
}

const emptySlot: SlotForm = {
  provider: '',
  model: '',
  baseUrl: '',
  apiKey: '',
  providerOptions: {},
  thinking: 'auto',
  citations: 'backend',
  parser: 'backend',
  temperature: '',
  maxTokens: '',
}
const tabs: SettingsTab[] = ['models', 'pipeline', 'prompts', 'copy', 'agents']
const TASK_ROUTING_ITEMS: TaskRoutingItem[] = [
  {
    id: 'general_chat',
    label: 'General Chat',
    description: 'Fallback assistant conversations outside topic-grounded reading.',
    recommendedSlot: 'language',
  },
  {
    id: 'topic_chat',
    label: 'Topic Chat',
    description: 'Grounded topic-sidebar replies for the active research theme.',
    recommendedSlot: 'language',
  },
  {
    id: 'topic_chat_vision',
    label: 'Topic Chat Vision',
    description: 'Topic chat with image attachments and multimodal grounding.',
    recommendedSlot: 'multimodal',
  },
  {
    id: 'topic_summary',
    label: 'Topic Summary',
    description: 'Topic generation, stage naming, orchestration, and closing synthesis.',
    recommendedSlot: 'language',
  },
  {
    id: 'document_parse',
    label: 'Document Parse',
    description: 'PDF and page-level parsing before evidence is structured downstream.',
    recommendedSlot: 'multimodal',
  },
  {
    id: 'figure_analysis',
    label: 'Figure Analysis',
    description: 'Figure understanding used by node cards and evidence explanations.',
    recommendedSlot: 'multimodal',
  },
  {
    id: 'formula_recognition',
    label: 'Formula Recognition',
    description: 'Formula extraction and normalization for article evidence blocks.',
    recommendedSlot: 'multimodal',
  },
  {
    id: 'table_extraction',
    label: 'Table Extraction',
    description: 'Table parsing and comparison evidence generation.',
    recommendedSlot: 'multimodal',
  },
  {
    id: 'evidence_explainer',
    label: 'Evidence Explainer',
    description: 'Localized explanation for figures, tables, formulas, and sections.',
    recommendedSlot: 'multimodal',
  },
]

const familyMeta: Record<PromptTemplateRecord['family'], { id: string; fallback: string }> = {
  topic: { id: 'studio.family.topic', fallback: '' },
  article: { id: 'studio.family.article', fallback: '' },
  evidence: { id: 'studio.family.evidence', fallback: '' },
  visual: { id: 'studio.family.visual', fallback: '' },
}

const copySectionMeta: Record<string, { id: string; fallback: string }> = {
  brand: { id: 'studio.section.brand', fallback: '' },
  navigation: { id: 'studio.section.navigation', fallback: '' },
  home: { id: 'studio.section.home', fallback: '' },
  create: { id: 'studio.section.create', fallback: '' },
  search: { id: 'studio.section.search', fallback: '' },
  assistant: { id: 'studio.section.assistant', fallback: '' },
  research: { id: 'studio.section.research', fallback: '' },
  reading: { id: 'studio.section.reading', fallback: '' },
  library: { id: 'studio.section.library', fallback: '' },
  management: { id: 'studio.section.management', fallback: '' },
  studio: { id: 'studio.section.studio', fallback: '' },
  topic: { id: 'studio.section.topic', fallback: '' },
}

const policyMeta: Record<EditorialPolicyKey, { id: string; fallback: string }> = {
  identity: { id: 'studio.policy.identity', fallback: '' },
  mission: { id: 'studio.policy.mission', fallback: '' },
  reasoning: { id: 'studio.policy.reasoning', fallback: '' },
  style: { id: 'studio.policy.style', fallback: '' },
  evidence: { id: 'studio.policy.evidence', fallback: '' },
  industryLens: { id: 'studio.policy.industryLens', fallback: '' },
  continuity: { id: 'studio.policy.continuity', fallback: '' },
  refinement: { id: 'studio.policy.refinement', fallback: '' },
}

function formatProviderOptionValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

function parseProviderOptionValue(field: CatalogField, raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  if (field.type === 'number') {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  if (field.type === 'boolean') {
    return trimmed === 'true'
  }

  if (field.type === 'json') {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  return trimmed
}

function getProviderById(
  catalog: ModelConfigResponse['catalog'] | null | undefined,
  providerId: string,
) {
  return catalog?.find((entry) => entry.provider === providerId)
}

function buildProviderOptionForm(
  provider: CatalogProvider | undefined,
  source?: Record<string, unknown> | null,
) {
  const next: Record<string, string> = {}
  const fields = provider?.configFields ?? []

  for (const field of fields) {
    const sourceValue = source?.[field.key] ?? field.defaultValue
    next[field.key] = formatProviderOptionValue(sourceValue)
  }

  return next
}

function buildSlotFormFromConfig(
  catalog: ModelConfigResponse['catalog'],
  config:
    | ModelConfigResponse['config']['language']
    | ModelConfigResponse['config']['multimodal']
    | NonNullable<ModelConfigResponse['config']['roles']>[ResearchRoleId]
    | null
    | undefined,
): SlotForm {
  const provider = getProviderById(catalog, config?.provider ?? '')

  return {
    provider: config?.provider ?? '',
    model: config?.model ?? '',
    baseUrl: config?.baseUrl ?? provider?.baseUrl ?? '',
    apiKey: '',
    providerOptions: buildProviderOptionForm(provider, config?.providerOptions),
    thinking: config?.options?.thinking ?? 'auto',
    citations: config?.options?.citations ?? 'backend',
    parser: config?.options?.parser ?? 'backend',
    temperature:
      typeof config?.options?.temperature === 'number'
        ? String(config.options.temperature)
        : '',
    maxTokens:
      typeof config?.options?.maxTokens === 'number'
        ? String(config.options.maxTokens)
        : '',
  }
}

function normalizeTab(value: string | null): SettingsTab {
  return tabs.includes(value as SettingsTab) ? (value as SettingsTab) : 'models'
}

function slotMatchesModel(
  slot: { provider?: string | null; model?: string | null } | null | undefined,
  target: { provider?: string | null; model?: string | null } | null | undefined,
) {
  return Boolean(
    slot?.provider &&
      slot?.model &&
      target?.provider &&
      target?.model &&
      slot.provider === target.provider &&
      slot.model === target.model,
  )
}

function filterModelsForSlot(models: CatalogModel[], slot: ProviderSlotKey) {
  return models.filter((model) => model.slot === slot || model.slot === 'both')
}

function buildTaskRoutingForm(
  config: ModelConfigResponse['config'],
): TaskRoutingForm {
  const next: TaskRoutingForm = {}

  for (const item of TASK_ROUTING_ITEMS) {
    const routeTarget = config.taskRouting?.[item.id]
    if (routeTarget) {
      next[item.id] = routeTarget as TaskRoutingChoice
      continue
    }

    const override = config.taskOverrides?.[item.id]
    if (!override) continue

    if (slotMatchesModel(config.language, override)) {
      next[item.id] = 'language'
      continue
    }

    if (slotMatchesModel(config.multimodal, override)) {
      next[item.id] = 'multimodal'
    }
  }

  return next
}

function resolveEffectiveRoleSeedConfig(
  roleId: ResearchRoleId,
  config: ModelConfigResponse['config'],
  capabilities: ModelCapabilitySummary | null,
) {
  const customConfig = config.roles?.[roleId]
  if (customConfig) return customConfig

  const source = capabilities?.roles?.[roleId]?.source
  if (source === 'default-language') return config.language
  if (source === 'default-multimodal') return config.multimodal
  return null
}

function buildRoleFormMap(
  catalog: ModelConfigResponse['catalog'],
  config: ModelConfigResponse['config'],
  capabilities: ModelCapabilitySummary | null,
): RoleFormMap {
  const roleIds =
    capabilities?.roleDefinitions?.map((definition) => definition.id) ??
    (Object.keys(capabilities?.roles ?? {}) as ResearchRoleId[])

  return Object.fromEntries(
    roleIds.map((roleId) => {
      const customConfig = config.roles?.[roleId] ?? null
      const seedConfig = customConfig ?? resolveEffectiveRoleSeedConfig(roleId, config, capabilities)

      return [
        roleId,
        {
          mode: customConfig ? 'custom' : 'default',
          form: buildSlotFormFromConfig(catalog, seedConfig),
        },
      ] satisfies [ResearchRoleId, RoleFormState]
    }),
  )
}

function buildSlotOptions(form: SlotForm) {
  return {
    thinking: form.thinking,
    citations: form.citations,
    parser: form.parser,
    temperature: form.temperature ? Number(form.temperature) : undefined,
    maxTokens: form.maxTokens ? Number(form.maxTokens) : undefined,
  }
}

function buildProviderOptionsPayload(
  provider: CatalogProvider | undefined,
  form: SlotForm,
) {
  if (!provider?.configFields?.length) return undefined

  const entries = provider.configFields
    .map((field) => [field.key, parseProviderOptionValue(field, form.providerOptions[field.key] ?? '')] as const)
    .filter(([, value]) => value !== undefined)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function humanizeTaskId(taskId: string) {
  return taskId.split('_').join(' ')
}

function buildTaskRoutingPayload(
  selections: TaskRoutingForm,
): UserModelConfig['taskRouting'] {
  return Object.fromEntries(
    Object.entries(selections).flatMap(([taskId, selection]) =>
      selection && selection !== 'default'
        ? [[taskId, selection] as [string, TaskRouteTarget]]
        : [],
    ),
  ) as UserModelConfig['taskRouting']
}

function formatConfiguredModel(
  provider: string | null | undefined,
  model: string | null | undefined,
  fallback: string,
) {
  if (!provider || !model) return fallback
  return `${provider} / ${model}`
}

function routeTargetLabel(
  target: TaskRouteTarget,
  t: (key: string, fallback?: string) => string,
  roleDefinitions: ModelCapabilitySummary['roleDefinitions'],
) {
  if (target === 'language') return t('studio.models.taskRoutingLanguage', 'Language slot')
  if (target === 'multimodal') return t('studio.models.taskRoutingMultimodal', 'Multimodal slot')

  const roleDefinition = roleDefinitions?.find((item) => item.id === target)
  return t(`studio.models.role.${target}`, roleDefinition?.label ?? humanizeTaskId(target))
}

function roleSourceLabel(
  source: NonNullable<ModelCapabilitySummary['roles']>[ResearchRoleId]['source'],
  t: (key: string, fallback?: string) => string,
) {
  if (source === 'role') {
    return t('studio.models.roleSource.role', 'Custom role model')
  }

  if (source === 'default-language') {
    return t('studio.models.roleSource.defaultLanguage', 'Inherited from default language slot')
  }

  if (source === 'default-multimodal') {
    return t('studio.models.roleSource.defaultMultimodal', 'Inherited from default multimodal slot')
  }

  return t('studio.models.roleSource.missing', 'No effective model yet')
}

function presetLabel(
  preset: NonNullable<ModelConfigResponse['presets']>[number],
  t: (key: string, fallback?: string) => string,
) {
  return t(`studio.models.presets.${preset.id}.label`, preset.label)
}

function presetDescription(
  preset: NonNullable<ModelConfigResponse['presets']>[number],
  t: (key: string, fallback?: string) => string,
) {
  return t(`studio.models.presets.${preset.id}.description`, preset.description)
}

function applyPresetToSlot(
  presetSlot: ProviderModelRef,
  currentForm: SlotForm,
  provider: CatalogProvider | undefined,
): SlotForm {
  const preserveProviderSettings =
    currentForm.provider === presetSlot.provider &&
    (Boolean(currentForm.baseUrl) || Object.keys(currentForm.providerOptions).length > 0)

  return {
    provider: presetSlot.provider,
    model: presetSlot.model,
    baseUrl: preserveProviderSettings ? currentForm.baseUrl : currentForm.baseUrl || provider?.baseUrl || '',
    apiKey: currentForm.apiKey,
    providerOptions: preserveProviderSettings
      ? currentForm.providerOptions
      : buildProviderOptionForm(provider, undefined),
    thinking: currentForm.thinking,
    citations: currentForm.citations,
    parser: currentForm.parser,
    temperature: currentForm.temperature,
    maxTokens: currentForm.maxTokens,
  }
}

function useFamilyLabel(
  t: (key: string, fallback?: string) => string,
  copy: CopyReader,
  family: PromptTemplateRecord['family'],
) {
  const meta = familyMeta[family]
  const fromCopy = copy(meta.id, '')
  // 优先使用数据库中的值，如果没有则使用 i18n 翻译
  return fromCopy || t(meta.id)
}

function useCopySectionLabel(
  t: (key: string, fallback?: string) => string,
  copy: CopyReader,
  section: string,
) {
  const meta = copySectionMeta[section]
  if (!meta) return section
  const fromCopy = copy(meta.id, '')
  // 优先使用数据库中的值，如果没有则使用 i18n 翻译
  return fromCopy || t(meta.id)
}

function usePolicyLabel(
  t: (key: string, fallback?: string) => string,
  copy: CopyReader,
  key: EditorialPolicyKey,
) {
  const meta = policyMeta[key]
  const fromCopy = copy(meta.id, '')
  // 优先使用数据库中的值，如果没有则使用 i18n 翻译
  return fromCopy || t(meta.id)
}

function applyBundleState(
  data: PromptStudioBundle,
  setBundle: (bundle: PromptStudioBundle) => void,
  setRuntime: (runtime: GenerationRuntimeConfig) => void,
  setTemplates: (templates: Record<string, PromptTemplateRecord>) => void,
  setProductCopies: (copies: Record<string, ProductCopyRecord>) => void,
  setExternalAgentAssets: (assets: Record<string, ExternalAgentAssetRecord>) => void,
  options?: { syncSelectedLanguage?: (language: PromptLanguageCode) => void; emitUpdated?: boolean },
) {
  setBundle(data)
  setRuntime(data.runtime)
  setTemplates(Object.fromEntries(data.templates.map((item) => [item.id, item])))
  setProductCopies(Object.fromEntries(data.productCopies.map((item) => [item.id, item])))
  setExternalAgentAssets(
    Object.fromEntries(data.externalAgents.assets.map((item) => [item.id, item])),
  )
  invalidateProductCopyCache(data)

  if (options?.syncSelectedLanguage) {
    options.syncSelectedLanguage(data.runtime.defaultLanguage)
  }

  if (options?.emitUpdated) {
    window.dispatchEvent(new CustomEvent(PROMPT_STUDIO_UPDATED_EVENT))
  }
}

export function PromptStudioPage() {
  const { t, preference } = useI18n()
  const search =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams()
  const initialTab = normalizeTab(search.get('tab'))
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [bundle, setBundle] = useState<PromptStudioBundle | null>(null)
  const [runtime, setRuntime] = useState<GenerationRuntimeConfig | null>(null)
  const [templates, setTemplates] = useState<Record<string, PromptTemplateRecord>>({})
  const [productCopies, setProductCopies] = useState<Record<string, ProductCopyRecord>>({})
  const [externalAgentAssets, setExternalAgentAssets] = useState<
    Record<string, ExternalAgentAssetRecord>
  >({})
  const [selectedLanguage, setSelectedLanguage] = useState<PromptLanguageCode>('zh')
  const [modelConfig, setModelConfig] = useState<ModelConfigResponse | null>(null)
  const [capabilities, setCapabilities] = useState<ModelCapabilitySummary | null>(null)
  const [languageForm, setLanguageForm] = useState<SlotForm>(emptySlot)
  const [multimodalForm, setMultimodalForm] = useState<SlotForm>(emptySlot)
  const [roleForms, setRoleForms] = useState<RoleFormMap>({})
  const [taskRoutingForm, setTaskRoutingForm] = useState<TaskRoutingForm>({})
  const [taskOverridesForm, setTaskOverridesForm] = useState<TaskOverrideForm>({})
  const [modelNotice, setModelNotice] = useState<OmniIssue | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingModels, setSavingModels] = useState(false)
  const [savingRuntime, setSavingRuntime] = useState(false)
  const [savingPrompts, setSavingPrompts] = useState(false)
  const [savingCopy, setSavingCopy] = useState(false)
  const [savingAgents, setSavingAgents] = useState(false)

  // copy 函数用于读取可配置的 ProductCopy（来自数据库）
  const copyForLanguage = (
    id: string,
    language: PromptLanguageCode,
    fallback: string,
  ) => {
    const record = productCopies[id]
    if (!record) return fallback
    return record.languageContents[language] || record.languageContents.zh || fallback
  }
  const copy: CopyReader = (id, fallback) => copyForLanguage(id, selectedLanguage, fallback)
  const uiCopy: CopyReader = (id, fallback) =>
    copyForLanguage(id, preference.primary, fallback)

  // 页面框架 UI 使用 i18n 固定翻译
  const tabLabels: Record<SettingsTab, string> = {
    models: uiCopy('studio.tabModels', t('studio.tabModels')),
    pipeline: uiCopy('studio.tabPipeline', t('studio.tabPipeline')),
    prompts: uiCopy('studio.tabPrompts', t('studio.tabPrompts')),
    copy: uiCopy('studio.tabCopy', t('studio.tabCopy')),
    agents: uiCopy('studio.tabAgents', t('studio.tabAgents')),
  }
  const tabGuide: Record<SettingsTab, { title: string; body: string }> = {
    models: {
      title: t('studio.guide.modelsTitle', 'Connect the models first'),
      body: t(
        'studio.guide.modelsBody',
        'Decide the language model, multimodal model, and task routing first so this page answers who is doing the work.',
      ),
    },
    pipeline: {
      title: t('studio.guide.pipelineTitle', 'Tune the research cadence next'),
      body: t(
        'studio.guide.pipelineBody',
        'This layer controls generation, memory, refinement, and orchestration so the system can keep researching with continuity.',
      ),
    },
    prompts: {
      title: t('studio.guide.promptsTitle', 'Adjust prompts after the system is stable'),
      body: t(
        'studio.guide.promptsBody',
        'Wait until models and runtime feel stable before tuning templates, so the team does not get buried in long prompts too early.',
      ),
    },
    copy: {
      title: t('studio.guide.copyTitle', 'Unify interface copy'),
      body: t(
        'studio.guide.copyBody',
        'This tab is only for product copy itself, without mixing models, runtime controls, or agent assets into the same surface.',
      ),
    },
    agents: {
      title: t('studio.guide.agentsTitle', 'Maintain external agent assets'),
      body: t(
        'studio.guide.agentsBody',
        'Manage external agent prompts, configs, and guides here as part of the system seam, not the topic reading surface.',
      ),
    },
  }

  const unconfiguredLabel = t('studio.unconfigured')
  const templateUnit = t('studio.templateUnit')
  const copyUnit = t('studio.copyUnit')

  useDocumentTitle(t('studio.title'))

  const orderedTemplates = useMemo(
    () => Object.values(templates).sort((left, right) => left.order - right.order),
    [templates],
  )
  const orderedCopies = useMemo(
    () => Object.values(productCopies).sort((left, right) => left.order - right.order),
    [productCopies],
  )

  const groupedCopies = useMemo(() => {
    const groups = new Map<string, ProductCopyRecord[]>()
    orderedCopies.forEach((item) => {
      groups.set(item.section, [...(groups.get(item.section) ?? []), item])
    })
    return groups
  }, [orderedCopies])

  const orderedExternalAgentAssets = useMemo(
    () =>
      bundle?.externalAgents.assets
        .map((item) => externalAgentAssets[item.id] ?? item)
        .filter(Boolean) ?? [],
    [bundle?.externalAgents.assets, externalAgentAssets],
  )

  const languageProviderEntry = useMemo(
    () => getProviderById(modelConfig?.catalog, languageForm.provider),
    [languageForm.provider, modelConfig?.catalog],
  )

  const multimodalProviderEntry = useMemo(
    () => getProviderById(modelConfig?.catalog, multimodalForm.provider),
    [multimodalForm.provider, modelConfig?.catalog],
  )

  const languageModels = useMemo<CatalogModel[]>(
    () => filterModelsForSlot(languageProviderEntry?.models ?? [], 'language'),
    [languageProviderEntry],
  )

  const multimodalModels = useMemo<CatalogModel[]>(
    () => filterModelsForSlot(multimodalProviderEntry?.models ?? [], 'multimodal'),
    [multimodalProviderEntry],
  )

  const loadStudio = useCallback(async () => {
    const data = await apiGet<PromptStudioBundle>('/api/prompt-templates/studio')
    applyBundleState(
      data,
      setBundle,
      setRuntime,
      setTemplates,
      setProductCopies,
      setExternalAgentAssets,
      {
        syncSelectedLanguage: setSelectedLanguage,
      },
    )
  }, [])

  const loadModels = useCallback(async () => {
    try {
      const [configResponse, capabilityResponse] = await Promise.all([
        apiGet<ModelConfigResponse>('/api/model-configs'),
        apiGet<ModelCapabilitySummary>('/api/model-capabilities'),
      ])
      setModelConfig(configResponse)
      setCapabilities(capabilityResponse)
      setLanguageForm(buildSlotFormFromConfig(configResponse.catalog, configResponse.config.language))
      setMultimodalForm(buildSlotFormFromConfig(configResponse.catalog, configResponse.config.multimodal))
      setRoleForms(buildRoleFormMap(configResponse.catalog, configResponse.config, capabilityResponse))
      setTaskRoutingForm(buildTaskRoutingForm(configResponse.config))
      setTaskOverridesForm((configResponse.config.taskOverrides ?? {}) as TaskOverrideForm)
      setModelNotice(null)
    } catch {
      setModelNotice({
        code: 'provider_error',
        title: t('studio.notice.modelUnavailableTitle'),
        message: t('studio.notice.modelUnavailableMessage'),
      })
    }
  }, [t])

  useEffect(() => {
    void Promise.all([loadStudio(), loadModels()]).finally(() => setLoading(false))
  }, [loadStudio, loadModels])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  function syncUrlTab(tab: SettingsTab) {
    setActiveTab(tab)
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }

  function applyUpdatedBundle(data: PromptStudioBundle, syncSelected = false) {
    applyBundleState(
      data,
      setBundle,
      setRuntime,
      setTemplates,
      setProductCopies,
      setExternalAgentAssets,
      {
        syncSelectedLanguage: syncSelected ? setSelectedLanguage : undefined,
        emitUpdated: true,
      },
    )
  }

  function updateTemplateField(id: string, field: 'system' | 'user' | 'notes', value: string) {
    setTemplates((current) => {
      const template = current[id]
      if (!template) return current
      return {
        ...current,
        [id]: {
          ...template,
          languageContents: {
            ...template.languageContents,
            [selectedLanguage]: {
              ...template.languageContents[selectedLanguage],
              [field]: value,
            },
          },
        },
      }
    })
  }

  function updateCopyField(id: string, value: string) {
    setProductCopies((current) => {
      const item = current[id]
      if (!item) return current
      return {
        ...current,
        [id]: {
          ...item,
          languageContents: {
            ...item.languageContents,
            [selectedLanguage]: value,
          },
        },
      }
    })
  }

  function updateExternalAgentAssetField(id: string, value: string) {
    setExternalAgentAssets((current) => {
      const item = current[id]
      if (!item) return current
      return {
        ...current,
        [id]: {
          ...item,
          content: value,
        },
      }
    })
  }

  async function saveModels() {
    if (!modelConfig) {
      setModelNotice({
        code: 'provider_error',
        title: t('studio.notice.modelUnavailableTitle'),
        message: t('studio.notice.modelUnavailableMessage'),
      })
      return
    }

    setSavingModels(true)
    try {
      const nextRoles = buildRolePayload(roleForms, modelConfig.catalog, modelConfig.config.roles)
      const payload = {
        language:
          languageForm.provider && languageForm.model
            ? {
                provider: languageForm.provider as never,
                model: languageForm.model,
                baseUrl: languageForm.baseUrl || undefined,
                apiKey: languageForm.apiKey || undefined,
                providerOptions: buildProviderOptionsPayload(languageProviderEntry, languageForm),
                options: buildSlotOptions(languageForm),
              }
            : null,
        multimodal:
          multimodalForm.provider && multimodalForm.model
            ? {
                provider: multimodalForm.provider as never,
                model: multimodalForm.model,
                baseUrl: multimodalForm.baseUrl || undefined,
                apiKey: multimodalForm.apiKey || undefined,
                providerOptions: buildProviderOptionsPayload(multimodalProviderEntry, multimodalForm),
                options: buildSlotOptions(multimodalForm),
              }
            : null,
        roles: nextRoles,
        taskOverrides: taskOverridesForm,
        taskRouting: buildTaskRoutingPayload(taskRoutingForm),
      } satisfies UserModelConfig

      const response = await apiPost<ModelConfigSaveResponse, UserModelConfig>(
        '/api/model-configs',
        payload,
      )
      await loadModels()
      window.dispatchEvent(new CustomEvent(MODEL_CONFIG_UPDATED_EVENT, { detail: response.slots }))
      setLanguageForm((current) => ({ ...current, apiKey: '' }))
      setMultimodalForm((current) => ({ ...current, apiKey: '' }))
      setRoleForms((current) =>
        Object.fromEntries(
          Object.entries(current).map(([roleId, state]) => [
            roleId,
            state
              ? {
                  ...state,
                  form: {
                    ...state.form,
                    apiKey: '',
                  },
                }
              : state,
          ]),
        ) as RoleFormMap,
      )
      setModelNotice(response.validationIssues?.[0] ?? null)
      setNotice(t('studio.notice.modelsSaved'))
    } catch {
      setModelNotice({
        code: 'provider_error',
        title: t('studio.notice.modelsSaveFailedTitle'),
        message: t('studio.notice.modelsSaveFailedMessage'),
      })
    } finally {
      setSavingModels(false)
    }
  }

  async function saveRuntime() {
    if (!runtime) return
    setSavingRuntime(true)
    try {
      const data = await apiPost<PromptStudioBundle, { runtime: GenerationRuntimeConfig }>(
        '/api/prompt-templates/studio',
        { runtime },
      )
      applyUpdatedBundle(data)
      setNotice(t('studio.notice.runtimeSaved'))
    } catch {
      setNotice(t('studio.notice.runtimeSaveFailed'))
    } finally {
      setSavingRuntime(false)
    }
  }

  async function savePrompts() {
    setSavingPrompts(true)
    try {
      const data = await apiPost<PromptStudioBundle, { templates: PromptTemplatePatch[] }>(
        '/api/prompt-templates/studio',
        {
          templates: Object.values(templates).map((template) => ({
            id: template.id,
            languageContents: template.languageContents,
          })),
        },
      )
      applyUpdatedBundle(data)
      setNotice(t('studio.notice.promptsSaved'))
    } catch {
      setNotice(t('studio.notice.promptsSaveFailed'))
    } finally {
      setSavingPrompts(false)
    }
  }

  async function saveProductCopy() {
    setSavingCopy(true)
    try {
      const data = await apiPost<PromptStudioBundle, { productCopies: ProductCopyPatch[] }>(
        '/api/prompt-templates/studio',
        {
          productCopies: Object.values(productCopies).map((item) => ({
            id: item.id,
            languageContents: item.languageContents,
          })),
        },
      )
      applyUpdatedBundle(data)
      setNotice(t('studio.notice.copySaved'))
    } catch {
      setNotice(t('studio.notice.copySaveFailed'))
    } finally {
      setSavingCopy(false)
    }
  }

  async function saveExternalAgents() {
    setSavingAgents(true)
    try {
      const data = await apiPost<
        PromptStudioBundle,
        { externalAgentAssets: ExternalAgentAssetPatch[] }
      >('/api/prompt-templates/studio', {
        externalAgentAssets: Object.values(externalAgentAssets).map((asset) => ({
          id: asset.id,
          content: asset.content,
        })),
      })
      applyUpdatedBundle(data)
      setNotice(t('studio.notice.promptsSaved'))
    } catch {
      setNotice(t('studio.notice.promptsSaveFailed'))
    } finally {
      setSavingAgents(false)
    }
  }

  async function resetTemplate(id: string) {
    const data = await apiPost<
      PromptStudioBundle,
      { templateId: string; language: PromptLanguageCode }
    >('/api/prompt-templates/reset', { templateId: id, language: selectedLanguage })
    applyUpdatedBundle(data)
    setNotice(t('studio.notice.templateReset'))
  }

  async function resetProductCopy(id: string) {
    const data = await apiPost<
      PromptStudioBundle,
      { productCopyId: string; language: PromptLanguageCode }
    >('/api/prompt-templates/reset', { productCopyId: id, language: selectedLanguage })
    applyUpdatedBundle(data)
    setNotice(t('studio.notice.copyReset'))
  }

  async function resetLanguage() {
    const data = await apiPost<PromptStudioBundle, { language: PromptLanguageCode }>(
      '/api/prompt-templates/reset',
      { language: selectedLanguage },
    )
    applyUpdatedBundle(data)
    setNotice(t('studio.notice.languageReset'))
  }

  async function exportBundle() {
    const response = await fetch(buildApiUrl('/api/prompt-templates/export'))
    const payload = await response.json()
    const blob = new Blob([JSON.stringify(payload.data ?? payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `suzhiji-settings-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importBundle(file: File) {
    const parsed = JSON.parse(await file.text()) as unknown
    const source =
      parsed && typeof parsed === 'object' && 'data' in parsed
        ? ((parsed as { data?: Partial<PromptStudioBundle> }).data ?? {})
        : ((parsed as Partial<PromptStudioBundle>) ?? {})

    const data = await apiPost<
      PromptStudioBundle,
      {
        templates?: PromptTemplatePatch[]
        productCopies?: ProductCopyPatch[]
        externalAgentAssets?: ExternalAgentAssetPatch[]
        runtime?: GenerationRuntimeConfig
      }
    >('/api/prompt-templates/import', {
      templates: source.templates?.map((item: PromptStudioBundle['templates'][number]) => ({
        id: item.id,
        languageContents: item.languageContents,
      })),
      productCopies: source.productCopies?.map(
        (item: PromptStudioBundle['productCopies'][number]) => ({
          id: item.id,
          languageContents: item.languageContents,
        }),
      ),
      externalAgentAssets: source.externalAgents?.assets?.map(
        (item: PromptStudioBundle['externalAgents']['assets'][number]) => ({
          id: item.id,
          content: item.content,
        }),
      ),
      runtime: source.runtime,
    })

    applyUpdatedBundle(data, true)
    setNotice(t('studio.notice.imported'))
  }

  if (loading) {
    return (
      <main className="px-4 pb-24 pt-10 md:px-6 xl:px-10">
        <div className="mx-auto max-w-[1200px] py-20 text-center text-sm text-black/54">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          <div className="mt-4">
            {t('studio.loading')}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-4 pb-24 pt-10 md:px-6 xl:px-10" data-testid="settings-page">
      <span data-testid="prompt-studio-page" className="sr-only">
        prompt studio
      </span>

      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="rounded-[32px] border border-black/8 bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)] md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-[760px]">
              <div className="text-[11px] uppercase tracking-[0.28em] text-black/28">
                {t('studio.eyebrow')}
              </div>
              <h1
                data-testid="prompt-studio-title"
                className="mt-4 font-display text-[38px] leading-[1.05] text-black md:text-[52px]"
              >
                {t('studio.title')}
              </h1>
              <p className="mt-4 text-[14px] leading-8 text-black/62">
                {t('studio.description')}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    title: t('studio.hero.stepModelsTitle', '1. Model access'),
                    body: t(
                      'studio.hero.stepModelsBody',
                      'Connect the language and multimodal models first, then decide which slot each task family should use by default.',
                    ),
                  },
                  {
                    title: t('studio.hero.stepPipelineTitle', '2. Research orchestration'),
                    body: t(
                      'studio.hero.stepPipelineBody',
                      'Tune generation, memory, refinement, and research cadence next so the system can keep moving with continuity.',
                    ),
                  },
                  {
                    title: t('studio.hero.stepAssetsTitle', '3. Templates and assets'),
                    body: t(
                      'studio.hero.stepAssetsBody',
                      'Handle prompts, interface copy, and external agent assets last so the settings center does not collapse into one giant page.',
                    ),
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[20px] border border-black/8 bg-[var(--surface-soft)] px-4 py-3"
                  >
                    <div className="text-[11px] uppercase tracking-[0.18em] text-black/38">
                      {item.title}
                    </div>
                    <p className="mt-2 text-[12px] leading-6 text-black/58">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-w-[300px] flex-col gap-3">
              <div className="flex flex-wrap justify-end gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => syncUrlTab(tab)}
                    className={
                      activeTab === tab
                        ? 'rounded-full bg-black px-4 py-2 text-[12px] text-white'
                        : 'rounded-full bg-[var(--surface-soft)] px-4 py-2 text-[12px] text-black/62 transition hover:text-black'
                    }
                  >
                    {tabLabels[tab]}
                  </button>
                ))}
              </div>

              <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-4">
                <div className="mb-3 rounded-[18px] border border-black/8 bg-white px-4 py-3">
                  <div
                    data-testid="prompt-studio-current-config-label"
                    className="text-[11px] uppercase tracking-[0.18em] text-black/34"
                  >
                    {t('studio.currentConfigLabel', 'Currently configuring')}
                  </div>
                  <div
                    data-testid="prompt-studio-current-config-title"
                    className="mt-2 text-[16px] font-semibold text-black"
                  >
                    {tabLabels[activeTab]}
                  </div>
                  <p
                    data-testid="prompt-studio-current-config-body"
                    className="mt-1.5 text-[12px] leading-6 text-black/58"
                  >
                    {tabGuide[activeTab].body}
                  </p>
                </div>
                <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-black/36">
                  {t('studio.languageEditorLabel')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {bundle?.languages.map((language) => (
                    <button
                      key={language.code}
                      type="button"
                      data-testid={`prompt-language-${language.code}`}
                      onClick={() => setSelectedLanguage(language.code)}
                      className={
                        selectedLanguage === language.code
                          ? 'rounded-full bg-black px-4 py-2 text-[12px] text-white'
                          : 'rounded-full bg-white px-4 py-2 text-[12px] text-black/62 shadow-[0_8px_20px_rgba(15,23,42,0.04)]'
                      }
                    >
                      {language.nativeName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {notice ? (
            <div className="mt-5 rounded-[22px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black/72">
              {notice}
            </div>
          ) : null}

          <section className="mt-5 grid gap-4 md:grid-cols-4">
          <StatCard
            label={t('studio.statLanguage')}
            value={capabilities?.slots.language.model ?? unconfiguredLabel}
            ready={capabilities?.slots.language.apiKeyStatus === 'configured'}
          />
          <StatCard
            label={t('studio.statMultimodal')}
            value={capabilities?.slots.multimodal.model ?? unconfiguredLabel}
            ready={capabilities?.slots.multimodal.apiKeyStatus === 'configured'}
          />
          <StatCard
            label={t('studio.statPrompts')}
            value={`${orderedTemplates.length} ${templateUnit}`}
            ready={orderedTemplates.length > 0}
          />
          <StatCard
            label={t('studio.statCopy')}
            value={`${orderedCopies.length} ${copyUnit}`}
            ready={orderedCopies.length > 0}
          />
          </section>
        </section>

        <section className="space-y-6">
          {activeTab === 'models'
            ? renderModelsTab({
                t,
                languageForm,
                setLanguageForm,
                multimodalForm,
                setMultimodalForm,
                roleForms,
                setRoleForms,
                taskRoutingForm,
                setTaskRoutingForm,
                taskOverridesForm,
                setTaskOverridesForm,
                modelConfig,
                capabilities,
                languageModels,
                multimodalModels,
                modelNotice,
                savingModels,
                saveModels,
                loadModels,
              })
            : null}

          {activeTab === 'pipeline' && runtime
            ? renderPipelineTab({
                t,
                copy,
                runtime,
                setRuntime,
                selectedLanguage,
                languages: bundle?.languages ?? [],
                savingRuntime,
                saveRuntime,
              })
            : null}

          {activeTab === 'prompts'
            ? renderPromptsTab({
                t,
                copy,
                orderedTemplates,
                selectedLanguage,
                fileInputRef,
                savingPrompts,
                exportBundle,
                importBundle,
                resetLanguage,
                savePrompts,
                resetTemplate,
                updateTemplateField,
              })
            : null}

          {activeTab === 'copy'
            ? renderCopyTab({
                t,
                copy,
                groupedCopies,
                selectedLanguage,
                savingCopy,
                resetLanguage,
                saveProductCopy,
                resetProductCopy,
                updateCopyField,
              })
            : null}

          {activeTab === 'agents'
            ? renderAgentsTab({
                t,
                bundle,
                assets: orderedExternalAgentAssets,
                savingAgents,
                saveExternalAgents,
                updateExternalAgentAssetField,
              })
            : null}
        </section>
      </div>
    </main>
  )
}

function renderModelsTab(args: {
  t: (key: string, fallback?: string) => string
  languageForm: SlotForm
  setLanguageForm: (form: SlotForm) => void
  multimodalForm: SlotForm
  setMultimodalForm: (form: SlotForm) => void
  roleForms: RoleFormMap
  setRoleForms: (updater: RoleFormMap | ((current: RoleFormMap) => RoleFormMap)) => void
  taskRoutingForm: TaskRoutingForm
  setTaskRoutingForm: (updater: TaskRoutingForm | ((current: TaskRoutingForm) => TaskRoutingForm)) => void
  taskOverridesForm: TaskOverrideForm
  setTaskOverridesForm: (
    updater: TaskOverrideForm | ((current: TaskOverrideForm) => TaskOverrideForm),
  ) => void
  modelConfig: ModelConfigResponse | null
  capabilities: ModelCapabilitySummary | null
  languageModels: CatalogModel[]
  multimodalModels: CatalogModel[]
  modelNotice: OmniIssue | null
  savingModels: boolean
  saveModels: () => Promise<void>
  loadModels: () => Promise<void>
}) {
  const { t } = args
  const unconfigured = t('studio.unconfigured')
  const presets = args.modelConfig?.presets ?? []
  const roleDefinitions = args.capabilities?.roleDefinitions ?? []
  const localizedTaskRoutingItems = TASK_ROUTING_ITEMS.map((item) => ({
    ...item,
    localizedLabel: t(`studio.models.tasks.${item.id}.label`, item.label),
    localizedDescription: t(
      `studio.models.tasks.${item.id}.description`,
      item.description,
    ),
  }))
  const localizedRoleDefinitions = roleDefinitions.map((definition) => ({
    ...definition,
    localizedLabel: t(`studio.models.role.${definition.id}`, definition.label),
    localizedDescription: t(
      `studio.models.roleDesc.${definition.id}`,
      definition.description,
    ),
  }))
  const localizedTaskById = new Map(localizedTaskRoutingItems.map((item) => [item.id, item] as const))
  const taskOverrideEntries = Object.entries(args.taskOverridesForm)
    .map(([taskId, override]) => ({
      taskId: taskId as OmniTaskId,
      override,
      label:
        localizedTaskById.get(taskId as OmniTaskId)?.localizedLabel ??
        humanizeTaskId(taskId),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
  const localizedPresets = presets.map((preset) => ({
    ...preset,
    localizedLabel: presetLabel(preset, t),
    localizedDescription: presetDescription(preset, t),
  }))
  const configuredSlotCount = [args.languageForm, args.multimodalForm].filter(
    (form) => form.provider && form.model,
  ).length
  const customRoleCount = localizedRoleDefinitions.filter((definition) => {
    const state = args.roleForms[definition.id]
    return (state?.mode ?? (args.modelConfig?.config.roles?.[definition.id] ? 'custom' : 'default')) === 'custom'
  }).length
  const inheritedRoleCount = Math.max(localizedRoleDefinitions.length - customRoleCount, 0)
  const automaticTaskCount = localizedTaskRoutingItems.filter(
    (item) =>
      (args.taskRoutingForm[item.id] ?? 'default') === 'default' &&
      !args.taskOverridesForm[item.id],
  ).length
  const explicitTaskCount = Math.max(
    localizedTaskRoutingItems.length - automaticTaskCount - taskOverrideEntries.length,
    0,
  )
  const minimalSetupSteps = [
    t(
      'studio.models.quickstart.stepDefaults',
      '1. Configure the default language slot and the default multimodal slot first.',
    ),
    t(
      'studio.models.quickstart.stepInheritance',
      '2. Leave research roles on inherited mode unless one role truly needs a special model.',
    ),
    t(
      'studio.models.quickstart.stepRouting',
      '3. Use task routing only when a backend task should bypass the normal role inheritance path.',
    ),
  ]
  const minimalSetupEnv = [
    'OMNI_DEFAULT_PROVIDER',
    'OMNI_DEFAULT_BASE_URL',
    'OMNI_DEFAULT_API_KEY',
    'OMNI_LANGUAGE_MODEL',
    'OMNI_MULTIMODAL_MODEL',
  ]
  const minimalRoleOverrideEnv = [
    'OMNI_ROLE_NODE_WRITER_MODEL',
    'OMNI_ROLE_VISION_READER_MODEL',
  ]

  function applyPreset(preset: NonNullable<typeof args.modelConfig>['presets'][number]) {
    const languageProvider = args.modelConfig?.catalog.find(
      (entry) => entry.provider === preset.language.provider,
    )
    const multimodalProvider = args.modelConfig?.catalog.find(
      (entry) => entry.provider === preset.multimodal.provider,
    )

    args.setLanguageForm(applyPresetToSlot(preset.language, args.languageForm, languageProvider))
    args.setMultimodalForm(applyPresetToSlot(preset.multimodal, args.multimodalForm, multimodalProvider))
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel
        className="xl:col-span-2"
        title={t('studio.models.quickstartTitle', 'Minimal Setup for Research Roles')}
        desc={t(
          'studio.models.quickstartDesc',
          'Start from two default slots, let the research roles inherit, and only customize the exceptional cases. This keeps the workbench understandable while still supporting deep role-aware routing.',
        )}
        dataTestId="prompt-studio-model-quickstart"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="space-y-3">
            {minimalSetupSteps.map((step) => (
              <div
                key={step}
                className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-[13px] leading-7 text-black/60"
              >
                {step}
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            <div className="rounded-[22px] border border-black/8 bg-white px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">
                {t('studio.models.quickstartEnvTitle', 'Shared gateway env')}
              </div>
              <p className="mt-2 text-[12px] leading-6 text-black/54">
                {t(
                  'studio.models.quickstartEnvDesc',
                  'If your language and multimodal slots share one compatible gateway, keep the provider, base URL, and API key in shared env vars and only swap the slot model ids when needed.',
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {minimalSetupEnv.map((entry) => (
                  <span
                    key={entry}
                    className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] text-black/58"
                  >
                    {entry}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-black/8 bg-white px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">
                {t('studio.models.roleEnvTitle', 'Optional role env overrides')}
              </div>
              <p className="mt-2 text-[12px] leading-6 text-black/54">
                {t(
                  'studio.models.roleEnvDesc',
                  'Role env vars now inherit provider, base URL, and API key from the preferred default slot, so most of the time you only need to override the role model id.',
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {minimalRoleOverrideEnv.map((entry) => (
                  <span
                    key={entry}
                    className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] text-black/58"
                  >
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:col-span-2 xl:grid-cols-4">
        <StatCard
          label={t('studio.models.summarySlotsTitle', 'Default slots')}
          value={`${configuredSlotCount}/2 ${t('studio.models.summaryConfigured', 'configured')}`}
          ready={configuredSlotCount === 2}
        />
        <StatCard
          label={t('studio.models.summaryRolesTitle', 'Role inheritance')}
          value={`${inheritedRoleCount} ${t('studio.models.summaryInherited', 'inherited')} · ${customRoleCount} ${t('studio.models.summaryCustom', 'custom')}`}
          ready={localizedRoleDefinitions.length === 0 || customRoleCount === 0}
        />
        <StatCard
          label={t('studio.models.summaryRoutingTitle', 'Task routing')}
          value={`${automaticTaskCount} ${t('studio.models.summaryAutomatic', 'automatic')} · ${explicitTaskCount} ${t('studio.models.summaryExplicit', 'explicit')}`}
          ready={taskOverrideEntries.length === 0}
        />
        <StatCard
          label={t('studio.models.summaryOverridesTitle', 'Pinned overrides')}
          value={`${taskOverrideEntries.length} ${t('studio.models.summaryPinned', 'pinned')}`}
          ready={taskOverrideEntries.length === 0}
        />
      </div>

      {localizedPresets.length > 0 ? (
        <Panel
          className="xl:col-span-2"
          title={t('studio.models.presetsTitle', 'Curated Presets')}
          desc={t(
            'studio.models.presetsDesc',
            'Apply a cleanroom provider pairing inspired by manifest-style orchestration, then fine-tune the slot details below.',
          )}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {localizedPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-[22px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4 text-left transition hover:border-black/14 hover:bg-white"
              >
                <div className="text-sm font-medium text-black">{preset.localizedLabel}</div>
                <p className="mt-2 text-[12px] leading-6 text-black/54">{preset.localizedDescription}</p>
                <div className="mt-3 space-y-1 text-[11px] uppercase tracking-[0.14em] text-black/34">
                  <div>
                    {t('studio.models.languageTitle')}: {preset.language.provider} / {preset.language.model}
                  </div>
                  <div>
                    {t('studio.models.multimodalTitle')}: {preset.multimodal.provider} / {preset.multimodal.model}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        title={t('studio.models.languageTitle')}
        desc={t('studio.models.languageDesc')}
      >
        <ModelForm
          t={t}
          form={args.languageForm}
          setForm={args.setLanguageForm}
          preview={args.modelConfig?.config.language?.apiKeyPreview}
          providers={args.modelConfig?.catalog ?? []}
          models={args.languageModels}
        />
      </Panel>

      <Panel
        title={t('studio.models.multimodalTitle')}
        desc={t('studio.models.multimodalDesc')}
      >
        <ModelForm
          t={t}
          form={args.multimodalForm}
          setForm={args.setMultimodalForm}
          preview={args.modelConfig?.config.multimodal?.apiKeyPreview}
          providers={args.modelConfig?.catalog ?? []}
          models={args.multimodalModels}
        />
      </Panel>

      <Panel
        className="xl:col-span-2"
        title={t('studio.models.rolesTitle', 'Research Roles')}
        desc={t(
          'studio.models.rolesDesc',
          'Most teams only need the default language and multimodal slots. Turn on a custom role only when one part of the research workflow truly needs a different model.',
        )}
        dataTestId="prompt-studio-research-roles"
      >
        <div className="mb-4 rounded-[22px] bg-[var(--surface-soft)] px-4 py-4 text-[13px] leading-7 text-black/58">
          {t(
            'studio.models.rolesHint',
            'The default slots already power every role by inheritance. Custom role models are for exceptional cases such as a stronger critic, a cheaper localizer, or a dedicated vision reader.',
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {localizedRoleDefinitions.map((definition) => {
            const roleCapability = args.capabilities?.roles?.[definition.id]
            const inheritedSeedConfig = resolveEffectiveRoleSeedConfig(
              definition.id,
              args.modelConfig?.config ?? { language: null, multimodal: null },
              args.capabilities,
            )
            const state = args.roleForms[definition.id] ?? {
              mode: 'default' as const,
              form: buildSlotFormFromConfig(
                args.modelConfig?.catalog ?? [],
                inheritedSeedConfig,
              ),
            }
            const providerEntry = getProviderById(args.modelConfig?.catalog, state.form.provider)
            const roleModels = filterModelsForSlot(providerEntry?.models ?? [], definition.preferredSlot)
            const preferredSlotLabel =
              definition.preferredSlot === 'language'
                ? t('studio.models.languageTitle')
                : t('studio.models.multimodalTitle')
            const effectiveModel = formatConfiguredModel(
              roleCapability?.provider,
              roleCapability?.model,
              unconfigured,
            )

            return (
              <div
                key={definition.id}
                data-testid={`research-role-card-${definition.id}`}
                className="rounded-[24px] border border-black/8 bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-black">{definition.localizedLabel}</div>
                    <p className="mt-1 text-[12px] leading-6 text-black/54">
                      {definition.localizedDescription}
                    </p>
                  </div>

                  <select
                    data-testid={`research-role-mode-${definition.id}`}
                    value={state.mode}
                    onChange={(event) =>
                      args.setRoleForms((current) => {
                        const nextMode = event.target.value as RoleFormMode
                        const currentState = current[definition.id] ?? state

                        return {
                          ...current,
                          [definition.id]: {
                            mode: nextMode,
                            form:
                              nextMode === 'custom' && currentState.mode === 'default'
                                ? buildSlotFormFromConfig(
                                    args.modelConfig?.catalog ?? [],
                                    inheritedSeedConfig,
                                  )
                                : currentState.form,
                          },
                        }
                      })
                    }
                    className="min-w-[170px] rounded-[16px] border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                  >
                    <option value="default">
                      {t('studio.models.roleModeDefault', 'Use inherited default')}
                    </option>
                    <option value="custom">
                      {t('studio.models.roleModeCustom', 'Use custom role model')}
                    </option>
                  </select>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[18px] bg-[var(--surface-soft)] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                      {t('studio.models.rolesPreferredSlot', 'Preferred slot')}
                    </div>
                    <div className="mt-2 text-[13px] font-medium text-black">{preferredSlotLabel}</div>
                  </div>

                  <div className="rounded-[18px] bg-[var(--surface-soft)] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                      {t('studio.models.rolesCurrentSource', 'Current source')}
                    </div>
                    <div className="mt-2 text-[13px] font-medium text-black">
                      {roleCapability ? roleSourceLabel(roleCapability.source, t) : unconfigured}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-[var(--surface-soft)] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                      {t('studio.models.rolesCurrentModel', 'Current model')}
                    </div>
                    <div className="mt-2 text-[13px] font-medium text-black">{effectiveModel}</div>
                  </div>
                </div>

                {definition.defaultTasks.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {definition.defaultTasks.map((taskId) => (
                      <span
                        key={taskId}
                        className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] text-black/52"
                      >
                        {t(
                          `studio.models.tasks.${taskId}.label`,
                          humanizeTaskId(taskId),
                        )}
                      </span>
                    ))}
                  </div>
                ) : null}

                {state.mode === 'custom' ? (
                  <div
                    data-testid={`research-role-custom-${definition.id}`}
                    className="mt-4 border-t border-black/8 pt-4"
                  >
                    <ModelForm
                      t={t}
                      form={state.form}
                      setForm={(nextForm) =>
                        args.setRoleForms((current) => ({
                          ...current,
                          [definition.id]: {
                            mode: 'custom',
                            form: nextForm,
                          },
                        }))
                      }
                      preview={args.modelConfig?.config.roles?.[definition.id]?.apiKeyPreview}
                      providers={args.modelConfig?.catalog ?? []}
                      models={roleModels}
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-[12px] leading-6 text-black/52">
                    {t(
                      'studio.models.rolesDefaultHint',
                      'This role will keep inheriting from the default slot until you explicitly give it a custom model.',
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel
        className="xl:col-span-2"
        title={t('studio.models.taskRoutingTitle', 'Task Routing')}
        desc={t(
          'studio.models.taskRoutingDesc',
          'Decide whether each backend task should follow automatic orchestration, stay on a default slot, or route into a specific research role.',
        )}
        dataTestId="prompt-studio-task-routing"
      >
        <div className="space-y-3">
          {localizedTaskRoutingItems.map((item) => {
            const selection = args.taskRoutingForm[item.id] ?? 'default'
            const routingState = args.capabilities?.routing?.[item.id]
            const directOverride = args.taskOverridesForm[item.id]
            const selectedRoleCapability =
              selection !== 'default' && selection !== 'language' && selection !== 'multimodal'
                ? args.capabilities?.roles?.[selection]
                : null
            const slotForm =
              selection === 'language'
                ? args.languageForm
                : selection === 'multimodal'
                  ? args.multimodalForm
                  : null
            const selectionPreview =
              directOverride
                ? `${t('studio.models.taskOverridesPinnedPreview', 'Pinned override')}: ${formatConfiguredModel(
                    directOverride.provider,
                    directOverride.model,
                    unconfigured,
                  )}`
                : selection === 'default'
                ? `${t('studio.models.taskRoutingAutomaticPreview', 'Automatic')}: ${routeTargetLabel(
                    routingState?.defaultTarget ?? item.recommendedSlot,
                    t,
                    roleDefinitions,
                  )}`
                : slotForm
                  ? `${routeTargetLabel(selection, t, roleDefinitions)}: ${formatConfiguredModel(
                      slotForm.provider,
                      slotForm.model,
                      unconfigured,
                    )}`
                  : `${routeTargetLabel(selection, t, roleDefinitions)}: ${formatConfiguredModel(
                      selectedRoleCapability?.provider,
                      selectedRoleCapability?.model,
                      unconfigured,
                    )}`

            return (
              <label
                key={item.id}
                className="block rounded-[20px] bg-[var(--surface-soft)] px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-black">{item.localizedLabel}</div>
                    <div className="mt-1 text-[12px] leading-6 text-black/50">
                      {item.localizedDescription}
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-black/34">
                      {t('studio.models.taskRoutingRecommended', 'Recommended')}:{' '}
                      {routeTargetLabel(
                        routingState?.defaultTarget ?? item.recommendedSlot,
                        t,
                        roleDefinitions,
                      )}
                    </div>
                  </div>

                  <select
                    data-testid={`task-routing-select-${item.id}`}
                    value={selection}
                    onChange={(event) => {
                      const nextValue = event.target.value as TaskRoutingChoice
                      args.setTaskRoutingForm((current) => ({
                        ...current,
                        [item.id]: nextValue,
                      }))
                      if (directOverride) {
                        args.setTaskOverridesForm((current) => {
                          const next = { ...current }
                          delete next[item.id]
                          return next
                        })
                      }
                    }}
                    className="min-w-[220px] rounded-[16px] border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                  >
                    <option value="default">
                      {t('studio.models.taskRoutingDefault', 'Automatic')}
                    </option>
                    <option value="language">
                      {t('studio.models.taskRoutingLanguage', 'Language slot')}
                    </option>
                    <option value="multimodal">
                      {t('studio.models.taskRoutingMultimodal', 'Multimodal slot')}
                    </option>
                    {localizedRoleDefinitions.map((definition) => (
                      <option key={definition.id} value={definition.id}>
                        {definition.localizedLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 text-[12px] leading-6 text-black/46">{selectionPreview}</div>
                {directOverride ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-amber-200/70 bg-amber-50 px-3 py-3 text-[12px] leading-6 text-amber-900/80">
                    <div>
                      {t(
                        'studio.models.taskOverridesPinnedHint',
                        'This task is still pinned to an imported advanced override. Change the routing selector above or remove the override here to hand control back to the workbench.',
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        args.setTaskOverridesForm((current) => {
                          const next = { ...current }
                          delete next[item.id]
                          return next
                        })
                      }}
                      className="inline-flex items-center rounded-full border border-amber-300/80 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-900 transition hover:border-amber-400"
                    >
                      {t('studio.models.taskOverridesRemove', 'Remove override')}
                    </button>
                  </div>
                ) : null}
              </label>
            )
          })}
        </div>
        {taskOverrideEntries.length > 0 ? (
          <details
            className="mt-4 rounded-[22px] border border-amber-200/80 bg-amber-50/70 px-4 py-4"
            data-testid="prompt-studio-task-overrides"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-amber-950">
                  {t('studio.models.taskOverridesTitle', 'Pinned Task Overrides')}
                </div>
                <div className="mt-1 text-[12px] leading-6 text-amber-900/78">
                  {taskOverrideEntries.length}{' '}
                  {t(
                    'studio.models.taskOverridesSummary',
                    'legacy task overrides still sit above routing. Expand only when you need to inspect or remove them one by one.',
                  )}
                </div>
              </div>
              <span className="rounded-full border border-amber-300/80 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-950">
                {t('studio.models.taskOverridesReview', 'Review overrides')}
              </span>
            </summary>

            <div className="mt-4 space-y-3">
              <div className="text-[12px] leading-6 text-amber-900/78">
                {t(
                  'studio.models.taskOverridesDesc',
                  'Each pinned override is already marked on the task cards above. Use this compact list only for cleanup.',
                )}
              </div>
              {taskOverrideEntries.map((entry) => (
                <div
                  key={entry.taskId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white px-4 py-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-black">{entry.label}</div>
                    <div className="mt-1 text-[12px] leading-6 text-black/52">
                      {formatConfiguredModel(entry.override?.provider, entry.override?.model, unconfigured)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      args.setTaskOverridesForm((current) => {
                        const next = { ...current }
                        delete next[entry.taskId]
                        return next
                      })
                    }
                    className="inline-flex items-center rounded-full border border-black/10 bg-[var(--surface-soft)] px-3 py-2 text-[12px] font-medium text-black/68 transition hover:border-black/18 hover:text-black"
                  >
                    {t('studio.models.taskOverridesRemove', 'Remove override')}
                  </button>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </Panel>

      {args.modelNotice ? (
        <div className="xl:col-span-2 rounded-[24px] bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <div className="font-semibold">{args.modelNotice.title}</div>
          <p className="mt-1 leading-7">{args.modelNotice.message}</p>
        </div>
      ) : null}

      <div className="xl:col-span-2 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void args.saveModels()}
          disabled={args.savingModels}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {args.savingModels ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('studio.models.save')}
        </button>
        <button
          type="button"
          onClick={() => void args.loadModels()}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-4 py-3 text-sm text-black/62 transition hover:text-black"
        >
          <RefreshCcw className="h-4 w-4" />
          {t('studio.models.refresh')}
        </button>
      </div>
    </div>
  )
}

function renderPipelineTab(args: {
  t: (key: string, fallback?: string) => string
  copy: CopyReader
  runtime: GenerationRuntimeConfig
  setRuntime: (runtime: GenerationRuntimeConfig) => void
  selectedLanguage: PromptLanguageCode
  languages: PromptLanguageOption[]
  savingRuntime: boolean
  saveRuntime: () => Promise<void>
}) {
  const { t, copy, runtime, setRuntime, selectedLanguage, languages } = args
  const currentPolicies = runtime.editorialPolicies[selectedLanguage]
  const policyKeys = Object.keys(currentPolicies) as EditorialPolicyKey[]

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel
        title={t('studio.pipeline.title')}
        desc={t('studio.pipeline.desc')}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-sm text-black/58">
              {t('studio.pipeline.defaultLanguage')}
            </div>
            <select
              value={runtime.defaultLanguage}
              onChange={(event) =>
                setRuntime({
                  ...runtime,
                  defaultLanguage: event.target.value as PromptLanguageCode,
                })
              }
              className="w-full rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none"
            >
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeName}
                </option>
              ))}
            </select>
          </label>

          <Field
            label={t('studio.pipeline.maxRetriesPerPass')}
            type="number"
            value={runtime.maxRetriesPerPass}
            onChange={(value) =>
              setRuntime({ ...runtime, maxRetriesPerPass: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.topicPreviewPasses', 'Topic Preview Passes')}
            type="number"
            value={runtime.topicPreviewPasses}
            onChange={(value) =>
              setRuntime({ ...runtime, topicPreviewPasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.topicBlueprintPasses', 'Topic Blueprint Passes')}
            type="number"
            value={runtime.topicBlueprintPasses}
            onChange={(value) =>
              setRuntime({ ...runtime, topicBlueprintPasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.topicLocalizationPasses', 'Topic Localization Passes')}
            type="number"
            value={runtime.topicLocalizationPasses}
            onChange={(value) =>
              setRuntime({ ...runtime, topicLocalizationPasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.topicChatPasses', 'Topic Chat Passes')}
            type="number"
            value={runtime.topicChatPasses}
            onChange={(value) =>
              setRuntime({ ...runtime, topicChatPasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.stageNamingPasses')}
            type="number"
            value={runtime.stageNamingPasses}
            onChange={(value) =>
              setRuntime({ ...runtime, stageNamingPasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.nodeArticlePasses')}
            type="number"
            value={runtime.nodeArticlePasses}
            onChange={(value) =>
              setRuntime({ ...runtime, nodeArticlePasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.paperArticlePasses')}
            type="number"
            value={runtime.paperArticlePasses}
            onChange={(value) =>
              setRuntime({ ...runtime, paperArticlePasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.selfRefinePasses')}
            type="number"
            value={runtime.selfRefinePasses}
            onChange={(value) =>
              setRuntime({ ...runtime, selfRefinePasses: Number(value) || 0 })
            }
          />
          <Field
            label={t(
              'studio.pipeline.staleContextRefinePasses',
              'Stale-context refine passes',
            )}
            type="number"
            value={runtime.staleContextRefinePasses}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                staleContextRefinePasses: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.researchOrchestrationPasses',
              'Research Orchestration Passes',
            )}
            type="number"
            value={runtime.researchOrchestrationPasses}
            onChange={(value) =>
              setRuntime({ ...runtime, researchOrchestrationPasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.researchReportPasses', 'Research Report Passes')}
            type="number"
            value={runtime.researchReportPasses}
            onChange={(value) =>
              setRuntime({ ...runtime, researchReportPasses: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.researchCycleDelayMs', 'Research Cycle Delay (ms)')}
            type="number"
            value={runtime.researchCycleDelayMs}
            onChange={(value) =>
              setRuntime({ ...runtime, researchCycleDelayMs: Number(value) || 0 })
            }
          />
          <Field
            label={t(
              'studio.pipeline.researchStageStallLimit',
              'Duration Stage Stall Limit',
            )}
            type="number"
            value={runtime.researchStageStallLimit}
            onChange={(value) =>
              setRuntime({ ...runtime, researchStageStallLimit: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.researchStagePaperLimit', 'Stage Paper Limit')}
            type="number"
            value={runtime.researchStagePaperLimit}
            onChange={(value) =>
              setRuntime({ ...runtime, researchStagePaperLimit: Number(value) || 0 })
            }
          />
          <Field
            label={t(
              'studio.pipeline.researchArtifactRebuildLimit',
              'Artifact Rebuild Limit',
            )}
            type="number"
            value={runtime.researchArtifactRebuildLimit}
            onChange={(value) =>
              setRuntime({ ...runtime, researchArtifactRebuildLimit: Number(value) || 0 })
            }
          />
          <Field
            label={t(
              'studio.pipeline.nodeCardFigureCandidateLimit',
              'Node Card Figure Candidates',
            )}
            type="number"
            value={runtime.nodeCardFigureCandidateLimit}
            onChange={(value) =>
              setRuntime({ ...runtime, nodeCardFigureCandidateLimit: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.maxEvidencePerArticle')}
            type="number"
            value={runtime.maxEvidencePerArticle}
            onChange={(value) =>
              setRuntime({ ...runtime, maxEvidencePerArticle: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.contextWindowStages')}
            type="number"
            value={runtime.contextWindowStages}
            onChange={(value) =>
              setRuntime({ ...runtime, contextWindowStages: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.contextWindowNodes')}
            type="number"
            value={runtime.contextWindowNodes}
            onChange={(value) =>
              setRuntime({ ...runtime, contextWindowNodes: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.languageTemperature')}
            type="number"
            step="0.01"
            value={runtime.languageTemperature}
            onChange={(value) =>
              setRuntime({ ...runtime, languageTemperature: Number(value) || 0 })
            }
          />
          <Field
            label={t('studio.pipeline.multimodalTemperature')}
            type="number"
            step="0.01"
            value={runtime.multimodalTemperature}
            onChange={(value) =>
              setRuntime({ ...runtime, multimodalTemperature: Number(value) || 0 })
            }
          />
        </div>

        <div className="mt-4 space-y-3">
          <ToggleRow
            label={t('studio.pipeline.cacheGeneratedOutputs')}
            checked={runtime.cacheGeneratedOutputs}
            onChange={(checked) =>
              setRuntime({ ...runtime, cacheGeneratedOutputs: checked })
            }
          />
          <ToggleRow
            label={t(
              'studio.pipeline.contextAwareCacheReuse',
              'Reuse cached drafts when only context changes',
            )}
            checked={runtime.contextAwareCacheReuse}
            onChange={(checked) =>
              setRuntime({ ...runtime, contextAwareCacheReuse: checked })
            }
          />
          <ToggleRow
            label={t('studio.pipeline.useTopicMemory')}
            checked={runtime.useTopicMemory}
            onChange={(checked) => setRuntime({ ...runtime, useTopicMemory: checked })}
          />
          <ToggleRow
            label={t('studio.pipeline.usePreviousPassOutputs')}
            checked={runtime.usePreviousPassOutputs}
            onChange={(checked) =>
              setRuntime({ ...runtime, usePreviousPassOutputs: checked })
            }
          />
          <ToggleRow
            label={t('studio.pipeline.preferMultimodalEvidence')}
            checked={runtime.preferMultimodalEvidence}
            onChange={(checked) =>
              setRuntime({ ...runtime, preferMultimodalEvidence: checked })
            }
          />
        </div>
      </Panel>

      <Panel
        title={t('studio.pipeline.sessionMemoryTitle', 'Session Memory')}
        desc={t(
          'studio.pipeline.sessionMemoryDesc',
          'Tune how topic-level memory is initialized, compacted, and fed back into long-running research and sidebar conversations.',
        )}
      >
        <div className="space-y-3">
          <ToggleRow
            label={t('studio.pipeline.topicSessionMemoryEnabled', 'Enable topic session memory')}
            checked={runtime.topicSessionMemoryEnabled}
            onChange={(checked) =>
              setRuntime({ ...runtime, topicSessionMemoryEnabled: checked })
            }
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryInitEventCount',
              'Init Event Threshold',
            )}
            type="number"
            value={runtime.topicSessionMemoryInitEventCount}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryInitEventCount: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryChatTurnsBetweenCompaction',
              'Chat Turns Before Compaction',
            )}
            type="number"
            value={runtime.topicSessionMemoryChatTurnsBetweenCompaction}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryChatTurnsBetweenCompaction: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryResearchCyclesBetweenCompaction',
              'Research Cycles Before Compaction',
            )}
            type="number"
            value={runtime.topicSessionMemoryResearchCyclesBetweenCompaction}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryResearchCyclesBetweenCompaction: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryTokenThreshold',
              'Token Threshold Before Compaction',
            )}
            type="number"
            value={runtime.topicSessionMemoryTokenThreshold}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryTokenThreshold: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryRecentEventLimit',
              'Recent Event Window',
            )}
            type="number"
            value={runtime.topicSessionMemoryRecentEventLimit}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryRecentEventLimit: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryRecallLimit',
              'Question Recall Limit',
            )}
            type="number"
            value={runtime.topicSessionMemoryRecallLimit}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryRecallLimit: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryRecallLookbackLimit',
              'Recall Lookback Window',
            )}
            type="number"
            value={runtime.topicSessionMemoryRecallLookbackLimit}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryRecallLookbackLimit: Number(value) || 0,
              })
            }
          />
          <Field
            label={t(
              'studio.pipeline.topicSessionMemoryRecallRecencyBias',
              'Recall Recency Bias',
            )}
            type="number"
            step="0.01"
            value={runtime.topicSessionMemoryRecallRecencyBias}
            onChange={(value) =>
              setRuntime({
                ...runtime,
                topicSessionMemoryRecallRecencyBias: Number(value) || 0,
              })
            }
          />
        </div>
        <div className="mt-4 space-y-3">
          <ToggleRow
            label={t(
              'studio.pipeline.topicSessionMemoryRecallEnabled',
              'Enable question-aware memory recall',
            )}
            checked={runtime.topicSessionMemoryRecallEnabled}
            onChange={(checked) =>
              setRuntime({ ...runtime, topicSessionMemoryRecallEnabled: checked })
            }
          />
        </div>
      </Panel>

      <Panel
        className="xl:col-span-2"
        title={t('studio.pipeline.policyTitle')}
        desc={t('studio.pipeline.policyDesc')}
      >
        <div className="grid gap-3">
          {policyKeys.map((key) => (
            <label key={key} className="block">
              <div className="mb-2 text-[12px] text-black/54">
                {usePolicyLabel(t, copy, key)}
              </div>
              <textarea
                rows={key === 'reasoning' ? 5 : 4}
                value={currentPolicies[key]}
                onChange={(event) =>
                  setRuntime({
                    ...runtime,
                    editorialPolicies: {
                      ...runtime.editorialPolicies,
                      [selectedLanguage]: {
                        ...currentPolicies,
                        [key]: event.target.value,
                      },
                    },
                  })
                }
                className="w-full rounded-[20px] bg-[var(--surface-soft)] px-4 py-4 text-[13px] leading-7 text-black outline-none"
              />
            </label>
          ))}
        </div>
      </Panel>

      <div className="xl:col-span-2 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void args.saveRuntime()}
          disabled={args.savingRuntime}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {args.savingRuntime ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('studio.pipeline.save')}
        </button>
      </div>
    </div>
  )
}

function renderPromptsTab(args: {
  t: (key: string, fallback?: string) => string
  copy: CopyReader
  orderedTemplates: PromptTemplateRecord[]
  selectedLanguage: PromptLanguageCode
  fileInputRef: RefObject<HTMLInputElement>
  savingPrompts: boolean
  exportBundle: () => Promise<void>
  importBundle: (file: File) => Promise<void>
  resetLanguage: () => Promise<void>
  savePrompts: () => Promise<void>
  resetTemplate: (id: string) => Promise<void>
  updateTemplateField: (id: string, field: 'system' | 'user' | 'notes', value: string) => void
}) {
  const { t, copy } = args

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void args.exportBundle()}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm text-black/62 transition hover:text-black"
        >
          <Download className="h-4 w-4" />
          {t('studio.prompts.export')}
        </button>
        <button
          type="button"
          onClick={() => args.fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm text-black/62 transition hover:text-black"
        >
          <Upload className="h-4 w-4" />
          {t('studio.prompts.import')}
        </button>
        <button
          type="button"
          onClick={() => void args.resetLanguage()}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm text-black/62 transition hover:text-black"
        >
          <RefreshCcw className="h-4 w-4" />
          {t('studio.prompts.resetLanguage')}
        </button>
        <button
          type="button"
          data-testid="prompt-studio-save"
          onClick={() => void args.savePrompts()}
          disabled={args.savingPrompts}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {args.savingPrompts ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('studio.prompts.save')}
        </button>
      </div>

      <input
        ref={args.fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void args.importBundle(file)
          event.target.value = ''
        }}
      />

      <div className="space-y-5">
        {args.orderedTemplates.map((template) => (
          <Panel
            key={template.id}
            title={template.title}
            desc={`${useFamilyLabel(t, copy, template.family)} / ${template.description}`}
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {template.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] text-black/50"
                >
                  {tag}
                </span>
              ))}
              <button
                type="button"
                onClick={() => void args.resetTemplate(template.id)}
                className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] text-black/62 transition hover:text-black"
              >
                {t('studio.prompts.resetItem')}
              </button>
            </div>

            {(['system', 'user', 'notes'] as const).map((field) => (
              <label key={field} className="mt-3 block">
                <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-black/34">
                  {t(`studio.prompts.fields.${field}`, field)}
                </div>
                <textarea
                  data-testid={`prompt-${field}-${template.id}`}
                  rows={field === 'notes' ? 4 : 8}
                  value={template.languageContents[args.selectedLanguage][field]}
                  onChange={(event) =>
                    args.updateTemplateField(template.id, field, event.target.value)
                  }
                  className="w-full rounded-[20px] bg-[var(--surface-soft)] px-4 py-4 font-mono text-[13px] leading-7 text-black outline-none"
                />
              </label>
            ))}
          </Panel>
        ))}
      </div>
    </div>
  )
}

function renderCopyTab(args: {
  t: (key: string, fallback?: string) => string
  copy: CopyReader
  groupedCopies: Map<string, ProductCopyRecord[]>
  selectedLanguage: PromptLanguageCode
  savingCopy: boolean
  resetLanguage: () => Promise<void>
  saveProductCopy: () => Promise<void>
  resetProductCopy: (id: string) => Promise<void>
  updateCopyField: (id: string, value: string) => void
}) {
  const { t, copy } = args

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void args.resetLanguage()}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm text-black/62 transition hover:text-black"
        >
          <RefreshCcw className="h-4 w-4" />
          {t('studio.copy.resetLanguage')}
        </button>
        <button
          type="button"
          onClick={() => void args.saveProductCopy()}
          disabled={args.savingCopy}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {args.savingCopy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('studio.copy.save')}
        </button>
      </div>

      {[...args.groupedCopies.entries()].map(([section, entries]) => (
        <Panel
          key={section}
          title={useCopySectionLabel(t, copy, section)}
          desc={t('studio.copy.desc')}
        >
          <div className="space-y-4">
            {entries.map((item) => (
              <label key={item.id} className="block">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-black">{item.title}</div>
                    <div className="text-[12px] leading-6 text-black/48">
                      {item.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void args.resetProductCopy(item.id)}
                    className="shrink-0 rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/62 transition hover:text-black"
                  >
                    {t('studio.copy.resetItem')}
                  </button>
                </div>
                <textarea
                  rows={item.multiline ? 5 : 2}
                  value={item.languageContents[args.selectedLanguage]}
                  onChange={(event) => args.updateCopyField(item.id, event.target.value)}
                  className="w-full rounded-[20px] bg-[var(--surface-soft)] px-4 py-4 text-[13px] leading-7 text-black outline-none"
                />
              </label>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  )
}

function renderAgentsTab(args: {
  t: (key: string, fallback?: string) => string
  bundle: PromptStudioBundle | null
  assets: ExternalAgentAssetRecord[]
  savingAgents: boolean
  saveExternalAgents: () => Promise<void>
  updateExternalAgentAssetField: (id: string, value: string) => void
}) {
  const { t, bundle } = args

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <Panel
          title={t('studio.agents.extensibilityTitle')}
          desc={t('studio.agents.extensibilityDesc')}
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">
            {t('studio.agents.supportedAgents')}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              {
                id: 'codex',
                title: t('studio.agents.agentCodex'),
                description: t('studio.agents.agentCodexDesc'),
              },
              {
                id: 'claude',
                title: t('studio.agents.agentClaude'),
                description: t('studio.agents.agentClaudeDesc'),
              },
              {
                id: 'custom',
                title: t('studio.agents.agentCustom'),
                description: t('studio.agents.agentCustomDesc'),
              },
            ].map((item) => (
              <article
                key={item.id}
                className="rounded-[22px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4"
              >
                <div className="text-sm font-medium text-black">{item.title}</div>
                <p className="mt-2 text-[12px] leading-6 text-black/54">
                  {item.description}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-4 rounded-[22px] bg-[var(--surface-soft)] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">
              {t('studio.agents.securityNote')}
            </div>
            <p className="mt-2 text-[13px] leading-6 text-black/58">
              {t('studio.agents.securityDesc')}
            </p>
          </div>
        </Panel>

        <Panel
          title={t('studio.agents.howItWorks')}
          desc={t('studio.agents.getStarted')}
        >
          <div className="grid gap-3">
            {[
              {
                id: 'step1',
                title: t('studio.agents.step1Title'),
                description: t('studio.agents.step1Desc'),
              },
              {
                id: 'step2',
                title: t('studio.agents.step2Title'),
                description: t('studio.agents.step2Desc'),
              },
              {
                id: 'step3',
                title: t('studio.agents.step3Title'),
                description: t('studio.agents.step3Desc'),
              },
              {
                id: 'step4',
                title: t('studio.agents.step4Title'),
                description: t('studio.agents.step4Desc'),
              },
            ].map((step) => (
              <article
                key={step.id}
                className="rounded-[20px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4"
              >
                <div className="text-sm font-medium text-black">{step.title}</div>
                <p className="mt-2 text-[12px] leading-6 text-black/54">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
      <Panel
        title={t('studio.agents.title')}
        desc={t('studio.agents.desc')}
      >
        <PathCard label={t('studio.agents.rootLabel', 'Root')} value={bundle?.externalAgents.rootDir ?? ''} />
        <PathCard label={t('studio.agents.readmeLabel', 'Readme')} value={bundle?.externalAgents.readmePath ?? ''} />
        <PathCard
          label={t('studio.agents.promptGuide')}
          value={bundle?.externalAgents.promptGuidePath ?? ''}
        />
        <PathCard
          label={t('studio.agents.superPromptLabel', 'Super Prompt')}
          value={bundle?.externalAgents.superPromptPath ?? ''}
        />
        <PathCard
          label={t('studio.agents.configExample')}
          value={bundle?.externalAgents.configExamplePath ?? ''}
        />
      </Panel>

      <Panel
        title={t('studio.agents.usageTitle')}
        desc={t('studio.agents.usageDesc')}
      >
        <ActionRow
          label={t('studio.agents.readmeAction')}
          value={bundle?.externalAgents.readmePath ?? ''}
        />
        <ActionRow
          label={t('studio.agents.promptGuideAction')}
          value={bundle?.externalAgents.promptGuidePath ?? ''}
        />
        <ActionRow
          label={t('studio.agents.configAction')}
          value={bundle?.externalAgents.configExamplePath ?? ''}
        />
      </Panel>
      </div>

      <Panel
        title={t('studio.agents.promptGuide')}
        desc={t('studio.agents.usageDesc')}
      >
        <div className="space-y-5">
          {args.assets.map((asset) => (
            <label key={asset.id} className="block">
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-black">{asset.title}</div>
                  <div className="mt-1 text-[12px] leading-6 text-black/48">
                    {asset.description}
                  </div>
                  <div className="mt-1 text-[11px] leading-6 text-black/38">{asset.path}</div>
                </div>
                <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-black/52">
                  {asset.format}
                </span>
              </div>
              <textarea
                rows={asset.format === 'json' ? 12 : 16}
                value={asset.content}
                onChange={(event) =>
                  args.updateExternalAgentAssetField(asset.id, event.target.value)
                }
                className="w-full rounded-[20px] bg-[var(--surface-soft)] px-4 py-4 font-mono text-[13px] leading-7 text-black outline-none"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void args.saveExternalAgents()}
            disabled={args.savingAgents}
            className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {args.savingAgents ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t('studio.prompts.save')}
          </button>
        </div>
      </Panel>
    </div>
  )
}

function StatCard({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <article className="rounded-[24px] bg-[#fcfbf9] px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">{label}</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="truncate text-[16px] font-semibold text-black">{value}</div>
        {ready ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <div className="h-5 w-5 rounded-full bg-[var(--surface-soft)]" />
        )}
      </div>
    </article>
  )
}

function Panel({
  title,
  desc,
  children,
  className = '',
  dataTestId,
}: {
  title: string
  desc: string
  children: ReactNode
  className?: string
  dataTestId?: string
}) {
  return (
    <article
      data-testid={dataTestId}
      className={`rounded-[28px] border border-black/8 bg-white px-5 py-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)] ${className}`.trim()}
    >
      <h2 className="text-[20px] font-semibold text-black">{title}</h2>
      <p className="mt-2 text-[13px] leading-6 text-black/58">{desc}</p>
      <div className="mt-4">{children}</div>
    </article>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  step,
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  step?: string
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm text-black/58">{label}</div>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none"
      />
    </label>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between rounded-[20px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black/70">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-black"
      />
    </label>
  )
}

function ModelForm({
  t,
  form,
  setForm,
  preview,
  providers,
  models,
}: {
  t: (key: string, fallback?: string) => string
  form: SlotForm
  setForm: (form: SlotForm) => void
  preview?: string
  providers: CatalogProvider[]
  models: CatalogModel[]
}) {
  const selectedProvider = providers.find((item) => item.provider === form.provider)
  const providerFields = selectedProvider?.configFields ?? []
  const authChoices = selectedProvider?.providerAuthChoices ?? []
  const taskSupportEntries = Object.entries(selectedProvider?.contracts?.taskSupport ?? {}).filter(
    ([, value]) => Boolean(value),
  ) as Array<[string, 'recommended' | 'supported' | 'limited']>

  return (
    <div className="grid gap-3">
      {preview ? (
        <div className="text-[12px] text-black/42">
          {t('studio.models.savedKey')}: {preview}
        </div>
      ) : null}

      <select
        value={form.provider}
        onChange={(event) => {
          const provider = providers.find((item) => item.provider === event.target.value)
          setForm({
            provider: event.target.value,
            model: '',
            baseUrl: provider?.baseUrl ?? '',
            apiKey: form.apiKey,
            providerOptions: buildProviderOptionForm(provider, undefined),
            thinking: form.thinking,
            citations: form.citations,
            parser: form.parser,
            temperature: form.temperature,
            maxTokens: form.maxTokens,
          })
        }}
        className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none"
      >
        <option value="">{t('studio.models.providerPlaceholder')}</option>
        {providers.map((item) => (
          <option key={item.provider} value={item.provider}>
            {item.label}
          </option>
        ))}
      </select>

      <select
        value={form.model}
        onChange={(event) => setForm({ ...form, model: event.target.value })}
        className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none"
      >
        <option value="">{t('studio.models.modelPlaceholder')}</option>
        {models.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      <input
        value={form.model}
        onChange={(event) => setForm({ ...form, model: event.target.value })}
        placeholder={t('studio.models.customModelPlaceholder')}
        className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/28"
      />

      <input
        value={form.baseUrl}
        onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
        placeholder={t('studio.models.baseUrlPlaceholder')}
        className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/28"
      />

      <input
        value={form.apiKey}
        onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
        placeholder={t('studio.models.apiKeyPlaceholder')}
        className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/28"
      />

      {selectedProvider ? (
        <div className="rounded-[20px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-black">{selectedProvider.label}</div>
            {selectedProvider.uiHints?.tone ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-black/48">
                {selectedProvider.uiHints.tone}
              </span>
            ) : null}
          </div>

          {selectedProvider.providerAuthEnvVars.length > 0 ? (
            <p className="mt-2 text-[12px] leading-6 text-black/54">
              {t('studio.models.envVars', 'Env vars')}: {selectedProvider.providerAuthEnvVars.join(', ')}
            </p>
          ) : null}

          {selectedProvider.uiHints?.recommendedFor?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedProvider.uiHints.recommendedFor.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] text-black/52"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          {authChoices.length > 0 ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {authChoices.map((choice) => (
                <div
                  key={choice.choiceId}
                  className="rounded-[16px] bg-white px-3 py-3 text-[12px] text-black/58"
                >
                  <div className="font-medium text-black">{choice.choiceLabel}</div>
                  <div className="mt-1 uppercase tracking-[0.14em] text-black/34">
                    {choice.method}
                  </div>
                  {choice.choiceHint ? (
                    <div className="mt-1 leading-5 text-black/46">{choice.choiceHint}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {taskSupportEntries.length > 0 ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {taskSupportEntries.slice(0, 6).map(([taskId, support]) => (
                <div
                  key={taskId}
                  className="flex items-center justify-between rounded-[16px] bg-white px-3 py-2 text-[12px] text-black/58"
                >
                  <span>{humanizeTaskId(taskId)}</span>
                  <span className="uppercase tracking-[0.14em] text-black/34">{support}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {providerFields.length > 0 ? (
        <div className="grid gap-3">
          {providerFields.map((field) => (
            <label key={field.key} className="grid gap-2 text-[12px] text-black/56">
              <span>{field.label}</span>
              {field.type === 'boolean' ? (
                <div className="flex items-center justify-between rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black/68">
                  <span>{t('studio.models.enabled', 'Enabled')}</span>
                  <input
                    type="checkbox"
                    checked={form.providerOptions[field.key] === 'true'}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        providerOptions: {
                          ...form.providerOptions,
                          [field.key]: String(event.target.checked),
                        },
                      })
                    }
                    className="h-4 w-4 accent-black"
                  />
                </div>
              ) : field.type === 'json' || field.multiline ? (
                <textarea
                  rows={field.multiline ? 5 : 4}
                  value={form.providerOptions[field.key] ?? ''}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      providerOptions: {
                        ...form.providerOptions,
                        [field.key]: event.target.value,
                      },
                    })
                  }
                  placeholder={field.placeholder}
                  className="rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 font-mono text-sm text-black outline-none placeholder:text-black/28"
                />
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={form.providerOptions[field.key] ?? ''}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      providerOptions: {
                        ...form.providerOptions,
                        [field.key]: event.target.value,
                      },
                    })
                  }
                  placeholder={field.placeholder}
                  className="rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/28"
                />
              )}
              <span className="text-[11px] leading-5 text-black/40">{field.description}</span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-2 text-[12px] text-black/56">
          <span>{t('studio.models.thinking', 'Thinking')}</span>
          <select
            value={form.thinking}
            onChange={(event) =>
              setForm({ ...form, thinking: event.target.value as SlotForm['thinking'] })
            }
            className="rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none"
          >
            <option value="auto">{t('studio.models.auto', 'Auto')}</option>
            <option value="on">{t('studio.models.on', 'On')}</option>
            <option value="off">{t('studio.models.off', 'Off')}</option>
          </select>
        </label>

        <label className="grid gap-2 text-[12px] text-black/56">
          <span>{t('studio.models.citations', 'Citations')}</span>
          <select
            value={form.citations}
            onChange={(event) =>
              setForm({ ...form, citations: event.target.value as SlotForm['citations'] })
            }
            className="rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none"
          >
            <option value="backend">{t('studio.models.backend', 'Backend')}</option>
            <option value="native">{t('studio.models.native', 'Native')}</option>
          </select>
        </label>

        <label className="grid gap-2 text-[12px] text-black/56">
          <span>{t('studio.models.parser', 'Parser')}</span>
          <select
            value={form.parser}
            onChange={(event) =>
              setForm({ ...form, parser: event.target.value as SlotForm['parser'] })
            }
            className="rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none"
          >
            <option value="backend">{t('studio.models.backend', 'Backend')}</option>
            <option value="native">{t('studio.models.native', 'Native')}</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2 text-[12px] text-black/56">
          <span>{t('studio.models.temperature', 'Temperature')}</span>
          <input
            type="number"
            step="0.01"
            value={form.temperature}
            onChange={(event) => setForm({ ...form, temperature: event.target.value })}
            placeholder={t('studio.models.optional', 'Optional')}
            className="rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/28"
          />
        </label>

        <label className="grid gap-2 text-[12px] text-black/56">
          <span>{t('studio.models.maxTokens', 'Max Tokens')}</span>
          <input
            type="number"
            step="1"
            value={form.maxTokens}
            onChange={(event) => setForm({ ...form, maxTokens: event.target.value })}
            placeholder={t('studio.models.optional', 'Optional')}
            className="rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 text-sm text-black outline-none placeholder:text-black/28"
          />
        </label>
      </div>
    </div>
  )
}

function PathCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 rounded-[20px] bg-[var(--surface-soft)] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">{label}</div>
      <div className="mt-2 break-all text-[13px] leading-7 text-black/62">{value}</div>
    </div>
  )
}

function ActionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-[20px] bg-[var(--surface-soft)] px-4 py-4">
      <div className="text-sm text-black/70">{label}</div>
      <div className="flex items-center gap-2 text-[12px] text-black/46">
        <span className="max-w-[220px] truncate">{value}</span>
        <ExternalLink className="h-4 w-4" />
      </div>
    </div>
  )
}

export default PromptStudioPage
