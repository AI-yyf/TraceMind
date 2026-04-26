import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Settings2,
  Sparkles,
  Wand2,
  Workflow,
  BookOpen,
  Pencil,
  X,
  Save,
} from 'lucide-react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import type { ModelCapabilitySummary, PromptStudioBundle } from '@/types/alpha'
import { apiGet, apiPatch } from '@/utils/api'
import { fetchModelCapabilitySummary, invalidateModelCapabilitySummary } from '@/utils/omniRuntimeCache'
import { ConfigHistoryPanel } from '@/components/settings/ConfigHistoryPanel'

type SettingsFocusTab = 'models' | 'pipeline' | 'prompts' | 'copy' | 'agents' | 'research'

interface ResearchConfig {
  maxCandidatesPerStage: number
  discoveryQueryLimit: number
  maxPapersPerNode: number
  minPapersPerNode: number
  targetCandidatesBeforeAdmission: number
  admissionThreshold: number
  highConfidenceThreshold: number
  semanticScholarLimit: number
  discoveryRounds: number
}

const focusTabs: SettingsFocusTab[] = ['models', 'pipeline', 'prompts', 'copy', 'agents', 'research']

function normalizeFocusTab(value: string | null): SettingsFocusTab {
  return focusTabs.includes(value as SettingsFocusTab)
    ? (value as SettingsFocusTab)
    : 'models'
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

function formatSwitch(value: boolean, t: (key: string, fallback?: string) => string) {
  return value ? t('settings.switchOn', 'Enabled') : t('settings.switchOff', 'Disabled')
}

function SettingsMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">{label}</div>
      <div className="mt-2 text-[14px] font-medium text-black">{value}</div>
    </div>
  )
}

function EditableResearchMetric({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        className="mt-2 w-full text-[14px] font-medium text-black bg-transparent border-none outline-none focus:ring-2 focus:ring-[#d1aa5c]/50 disabled:opacity-50"
      />
      <div className="text-[9px] text-black/34 mt-1">
        {min} - {max}
      </div>
    </div>
  )
}

function SettingsCard({
  active,
  eyebrow,
  title,
  body,
  metrics,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  icon,
}: {
  active?: boolean
  eyebrow: string
  title: string
  body: string
  metrics: Array<{ label: string; value: string }>
  primaryHref: string
  primaryLabel: string
  secondaryHref?: string
  secondaryLabel?: string
  icon: typeof Settings2
}) {
  const Icon = icon

  return (
    <article
      className={`rounded-[30px] border bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition ${
        active ? 'border-[#d1aa5c]/70 shadow-[0_18px_40px_rgba(209,170,92,0.14)]' : 'border-black/8'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">{eyebrow}</div>
          <h2 className="mt-2 text-[22px] font-semibold text-black">{title}</h2>
        </div>
        <div className="rounded-[18px] bg-[var(--surface-soft)] p-3 text-black/68">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-7 text-black/58">{body}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => (
          <SettingsMetric key={`${metric.label}:${metric.value}`} label={metric.label} value={metric.value} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to={primaryHref}
          className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-[13px] text-white transition hover:bg-black/92"
        >
          {primaryLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link
            to={secondaryHref}
            className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2.5 text-[13px] text-black/64 transition hover:border-black/16 hover:text-black"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </article>
  )
}

function ResearchConfigCard({
  active,
  eyebrow,
  title,
  body,
  icon,
  config,
  editing,
  saving,
  saved,
  error,
  onEdit,
  onSave,
  onCancel,
  onChange,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  t,
}: {
  active?: boolean
  eyebrow: string
  title: string
  body: string
  icon: typeof Settings2
  config: ResearchConfig
  editing: boolean
  saving: boolean
  saved: boolean
  error: string | null
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onChange: (config: ResearchConfig) => void
  primaryHref: string
  primaryLabel: string
  secondaryHref: string
  secondaryLabel: string
  t: (key: string, fallback?: string) => string
}) {
  const Icon = icon

  return (
    <article
      className={`rounded-[30px] border bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition ${
        active ? 'border-[#d1aa5c]/70 shadow-[0_18px_40px_rgba(209,170,92,0.14)]' : 'border-black/8'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">{eyebrow}</div>
          <h2 className="mt-2 text-[22px] font-semibold text-black">{title}</h2>
        </div>
        <div className="rounded-[18px] bg-[var(--surface-soft)] p-3 text-black/68">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-7 text-black/58">{body}</p>

      {editing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <EditableResearchMetric
            label={t('settings.metric.maxCandidates', 'Max candidates per stage')}
            value={config.maxCandidatesPerStage}
            onChange={(v) =>
              onChange({
                ...config,
                maxCandidatesPerStage: v,
                targetCandidatesBeforeAdmission: Math.max(config.targetCandidatesBeforeAdmission, v),
              })}
            min={20}
            max={200}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.discoveryLimit', 'Discovery query limit')}
            value={config.discoveryQueryLimit}
            onChange={(v) => onChange({ ...config, discoveryQueryLimit: v })}
            min={100}
            max={800}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.maxPapersPerNode', 'Max papers per node')}
            value={config.maxPapersPerNode}
            onChange={(v) =>
              onChange({
                ...config,
                maxPapersPerNode: v,
                minPapersPerNode: Math.min(config.minPapersPerNode, v),
              })}
            min={5}
            max={20}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.minPapersPerNode', 'Minimum useful papers per node')}
            value={config.minPapersPerNode}
            onChange={(v) =>
              onChange({
                ...config,
                minPapersPerNode: Math.min(v, config.maxPapersPerNode),
              })}
            min={3}
            max={20}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.targetCandidatesBeforeAdmission', 'Target candidates before admission')}
            value={config.targetCandidatesBeforeAdmission}
            onChange={(v) =>
              onChange({
                ...config,
                targetCandidatesBeforeAdmission: Math.max(v, config.maxCandidatesPerStage),
              })}
            min={50}
            max={200}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.admissionThreshold', 'Admission threshold')}
            value={config.admissionThreshold}
            onChange={(v) => onChange({ ...config, admissionThreshold: v })}
            min={0.25}
            max={0.75}
            step={0.05}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.highConfidenceThreshold', 'High-confidence admission threshold')}
            value={config.highConfidenceThreshold}
            onChange={(v) => onChange({ ...config, highConfidenceThreshold: v })}
            min={0.5}
            max={0.95}
            step={0.05}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.semanticScholarLimit', 'Semantic Scholar limit')}
            value={config.semanticScholarLimit}
            onChange={(v) => onChange({ ...config, semanticScholarLimit: v })}
            min={20}
            max={150}
            disabled={saving}
          />
          <EditableResearchMetric
            label={t('settings.metric.discoveryRounds', 'Discovery rounds')}
            value={config.discoveryRounds}
            onChange={(v) => onChange({ ...config, discoveryRounds: v })}
            min={2}
            max={10}
            disabled={saving}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SettingsMetric label={t('settings.metric.maxCandidates', 'Max candidates per stage')} value={String(config.maxCandidatesPerStage)} />
          <SettingsMetric label={t('settings.metric.discoveryLimit', 'Discovery query limit')} value={String(config.discoveryQueryLimit)} />
          <SettingsMetric label={t('settings.metric.maxPapersPerNode', 'Max papers per node')} value={String(config.maxPapersPerNode)} />
          <SettingsMetric label={t('settings.metric.minPapersPerNode', 'Minimum useful papers per node')} value={String(config.minPapersPerNode)} />
          <SettingsMetric label={t('settings.metric.targetCandidatesBeforeAdmission', 'Target candidates before admission')} value={String(config.targetCandidatesBeforeAdmission)} />
          <SettingsMetric label={t('settings.metric.admissionThreshold', 'Admission threshold')} value={String(config.admissionThreshold)} />
          <SettingsMetric label={t('settings.metric.highConfidenceThreshold', 'High-confidence admission threshold')} value={String(config.highConfidenceThreshold)} />
          <SettingsMetric label={t('settings.metric.semanticScholarLimit', 'Semantic Scholar limit')} value={String(config.semanticScholarLimit)} />
          <SettingsMetric label={t('settings.metric.discoveryRounds', 'Discovery rounds')} value={String(config.discoveryRounds)} />
        </div>
      )}

      {/* Status indicators */}
      {saved && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-[12px] text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('settings.researchSaved', 'Configuration saved')}
        </div>
      )}
      {error && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-[12px] text-red-700">
          <Sparkles className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {editing ? (
          <>
            <button
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-[13px] text-white transition hover:bg-black/92 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('settings.researchSaving', 'Saving...')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('settings.researchSave', 'Save configuration')}
                </>
              )}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2.5 text-[13px] text-black/64 transition hover:border-black/16 hover:text-black disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              {t('settings.researchCancel', 'Cancel')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-[13px] text-white transition hover:bg-black/92"
            >
              <Pencil className="h-4 w-4" />
              {t('settings.researchEdit', 'Edit parameters')}
            </button>
            <Link
              to={primaryHref}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2.5 text-[13px] text-black/64 transition hover:border-black/16 hover:text-black"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={secondaryHref}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2.5 text-[13px] text-black/64 transition hover:border-black/16 hover:text-black"
            >
              {secondaryLabel}
            </Link>
          </>
        )}
      </div>
    </article>
  )
}

export function SettingsPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [capabilities, setCapabilities] = useState<ModelCapabilitySummary | null>(null)
  const [bundle, setBundle] = useState<PromptStudioBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Research config state
  const [researchConfig, setResearchConfig] = useState<ResearchConfig>({
    maxCandidatesPerStage: 200,
    discoveryQueryLimit: 500,
    maxPapersPerNode: 20,
    minPapersPerNode: 10,
    targetCandidatesBeforeAdmission: 150,
    admissionThreshold: 0.45,
    highConfidenceThreshold: 0.75,
    semanticScholarLimit: 100,
    discoveryRounds: 10,
  })
  const [researchEditing, setResearchEditing] = useState(false)
  const [researchSaving, setResearchSaving] = useState(false)
  const [researchSaved, setResearchSaved] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)

  // Config version state
  const [currentConfigVersion, setCurrentConfigVersion] = useState<number | undefined>(undefined)

  const focusTab = normalizeFocusTab(searchParams.get('tab'))
  const focusLabel =
    focusTab === 'models'
      ? t('settings.focus.models', 'Models')
      : focusTab === 'pipeline'
        ? t('settings.focus.pipeline', 'Pipeline')
        : focusTab === 'prompts'
          ? t('settings.focus.prompts', 'Prompts')
          : focusTab === 'copy'
            ? t('settings.focus.copy', 'Copy')
            : focusTab === 'agents'
              ? t('settings.focus.agents', 'Agents')
              : t('settings.focus.research', 'Research Tracking')

  useDocumentTitle(t('nav.settings', 'Settings'))

  const handleSaveResearchConfig = async () => {
    setResearchSaving(true)
    setResearchError(null)
    setResearchSaved(false)

    try {
      const result = await apiPatch<ResearchConfig>('/api/topics/research-config', researchConfig)
      setResearchConfig(result)
      setResearchEditing(false)
      setResearchSaved(true)
      setTimeout(() => setResearchSaved(false), 3000)
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : t('settings.researchError', 'Failed to save'))
    } finally {
      setResearchSaving(false)
    }
  }

  const handleCancelResearchEdit = () => {
    setResearchEditing(false)
    setResearchError(null)
    // Reset to current saved values by re-fetching
    apiGet<ResearchConfig>('/api/topics/research-config').then(setResearchConfig).catch(() => {})
  }

  const roleEntries = useMemo(
    () => Object.values(capabilities?.roles ?? {}),
    [capabilities?.roles],
  )
  const configuredRoleCount = roleEntries.filter((role) => role.source === 'role').length
  const effectiveRoleCount = roleEntries.filter((role) => role.configured).length
  const totalRoleCount = roleEntries.length

useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    Promise.all([
      fetchModelCapabilitySummary(),
      apiGet<PromptStudioBundle>('/api/prompt-templates/studio'),
      apiGet<ResearchConfig>('/api/topics/research-config'),
      apiGet<{ history: Array<{ version: number }> }>('/api/omni/config/history?limit=1'),
    ])
      .then(([nextCapabilities, nextBundle, nextResearchConfig, historyResponse]) => {
        if (!alive) return
        setCapabilities(nextCapabilities)
        setBundle(nextBundle)
        setResearchConfig(nextResearchConfig)
        if (historyResponse.history.length > 0) {
          setCurrentConfigVersion(historyResponse.history[0].version)
        }
      })
      .catch((nextError) => {
        if (!alive) return
        setError(
          nextError instanceof Error
            ? nextError.message
            : t('settings.fallbackError', 'Settings center is temporarily unavailable.'),
        )
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [t])

  const topMetrics = useMemo(() => {
    const runtime = bundle?.runtime

    return [
      {
        label: t('settings.metric.languageModel', 'Language model'),
        value:
          capabilities?.slots.language.configured
            ? `${capabilities.slots.language.provider ?? ''} / ${capabilities.slots.language.model ?? ''}`
            : t('settings.value.unconfigured', 'Unconfigured'),
      },
      {
        label: t('settings.metric.multimodalModel', 'Multimodal model'),
        value:
          capabilities?.slots.multimodal.configured
            ? `${capabilities.slots.multimodal.provider ?? ''} / ${capabilities.slots.multimodal.model ?? ''}`
            : t('settings.value.unconfigured', 'Unconfigured'),
      },
      {
        label: t('settings.metric.researchRoles', 'Research roles'),
        value:
          totalRoleCount > 0
            ? renderTemplate(t('settings.count.rolesReady', '{ready}/{count} ready'), {
                ready: effectiveRoleCount,
                count: totalRoleCount,
              })
            : '--',
      },
      {
        label: t('settings.metric.promptTemplates', 'Prompt templates'),
        value: bundle
          ? renderTemplate(t('settings.count.templates', '{count} templates'), {
              count: bundle.templates.length,
            })
          : '--',
      },
      {
        label: t('settings.metric.defaultLanguage', 'Default language'),
        value: runtime?.defaultLanguage?.toUpperCase() ?? 'ZH',
      },
    ]
  }, [bundle, capabilities, effectiveRoleCount, t, totalRoleCount])

  const cards = useMemo(() => {
    const runtime = bundle?.runtime

    return [
      {
        id: 'models' as const,
        eyebrow: t('settings.modelsEyebrow', 'Model access'),
        title: t('settings.modelsTitle', 'Models and capabilities'),
        body: t(
          'settings.modelsBody',
          'Confirm the default language slot, multimodal slot, and research-role inheritance first. Go into the model center only when one part of the workflow truly needs a custom model.',
        ),
        metrics: [
          {
            label: t('settings.metric.languageSlot', 'Language slot'),
            value: capabilities?.slots.language.configured
              ? t('settings.value.configured', 'Configured')
              : t('settings.value.pending', 'Pending'),
          },
          {
            label: t('settings.metric.multimodalSlot', 'Multimodal slot'),
            value: capabilities?.slots.multimodal.configured
              ? t('settings.value.configured', 'Configured')
              : t('settings.value.pending', 'Pending'),
          },
          {
            label: t('settings.metric.languageModel', 'Language model'),
            value: capabilities?.slots.language.model ?? t('settings.value.notSet', 'Not set'),
          },
          {
            label: t('settings.metric.multimodalModel', 'Multimodal model'),
            value: capabilities?.slots.multimodal.model ?? t('settings.value.notSet', 'Not set'),
          },
          {
            label: t('settings.metric.customRoles', 'Custom research roles'),
            value: renderTemplate(t('settings.count.roles', '{count} roles'), {
              count: configuredRoleCount,
            }),
          },
          {
            label: t('settings.metric.roleCoverage', 'Role coverage'),
            value:
              totalRoleCount > 0
                ? renderTemplate(t('settings.count.rolesReady', '{ready}/{count} ready'), {
                    ready: effectiveRoleCount,
                    count: totalRoleCount,
                  })
                : '--',
          },
        ],
        primaryHref: '/prompt-studio?tab=models',
        primaryLabel: t('settings.modelsPrimary', 'Open model center'),
        secondaryHref: '/research',
        secondaryLabel: t('settings.modelsSecondary', 'View research workbench'),
        icon: Bot,
      },
      {
        id: 'pipeline' as const,
        eyebrow: t('settings.pipelineEyebrow', 'Research engine'),
        title: t('settings.pipelineTitle', 'Research orchestration and memory'),
        body: t(
          'settings.pipelineBody',
          'This layer covers ongoing research, long-term memory, self-refinement, and evidence preferences. Check the current switches and pass counts here before fine-tuning.',
        ),
        metrics: [
          {
            label: t('settings.metric.topicMemory', 'Topic memory'),
            value: formatSwitch(runtime?.useTopicMemory ?? false, t),
          },
          {
            label: t('settings.metric.sessionMemory', 'Session memory'),
            value: formatSwitch(runtime?.topicSessionMemoryEnabled ?? false, t),
          },
          {
            label: t('settings.metric.selfRefinePasses', 'Self-refine passes'),
            value: runtime
              ? renderTemplate(t('settings.count.rounds', '{count} rounds'), {
                  count: runtime.selfRefinePasses,
                })
              : '--',
          },
          {
            label: t('settings.metric.orchestrationPasses', 'Orchestration passes'),
            value: runtime
              ? renderTemplate(t('settings.count.rounds', '{count} rounds'), {
                  count: runtime.researchOrchestrationPasses,
                })
              : '--',
          },
        ],
        primaryHref: '/prompt-studio?tab=pipeline',
        primaryLabel: t('settings.pipelinePrimary', 'Open pipeline configuration'),
        secondaryHref: '/research',
        secondaryLabel: t('settings.pipelineSecondary', 'Go to orchestration workbench'),
        icon: Workflow,
      },
      {
        id: 'prompts' as const,
        eyebrow: t('settings.promptsEyebrow', 'Prompts and expression'),
        title: t('settings.promptsTitle', 'Prompts and interface copy'),
        body: t(
          'settings.promptsBody',
          'Prompt templates, interface copy, and language switching are separated here so all editing surfaces do not collapse into one page.',
        ),
        metrics: [
          {
            label: t('settings.metric.promptTemplates', 'Prompt templates'),
            value: bundle
              ? renderTemplate(t('settings.count.templates', '{count} templates'), {
                  count: bundle.templates.length,
                })
              : '--',
          },
          {
            label: t('settings.metric.productCopy', 'Interface copy'),
            value: bundle
              ? renderTemplate(t('settings.count.copyEntries', '{count} copy entries'), {
                  count: bundle.productCopies.length,
                })
              : '--',
          },
          {
            label: t('settings.metric.languages', 'Languages'),
            value: bundle
              ? renderTemplate(t('settings.count.languages', '{count} languages'), {
                  count: bundle.languages.length,
                })
              : '--',
          },
          {
            label: t('settings.metric.defaultLanguage', 'Default language'),
            value: runtime?.defaultLanguage?.toUpperCase() ?? '--',
          },
        ],
        primaryHref: '/prompt-studio?tab=prompts',
        primaryLabel: t('settings.promptsPrimary', 'Open Prompt Studio'),
        secondaryHref: '/prompt-studio?tab=copy',
        secondaryLabel: t('settings.promptsSecondary', 'View product copy'),
        icon: MessageSquare,
      },
      {
        id: 'agents' as const,
        eyebrow: t('settings.agentsEyebrow', 'External seams'),
        title: t('settings.agentsTitle', 'Agent assets and system seams'),
        body: t(
          'settings.agentsBody',
          'External agents, super prompts, and system assets stay managed at this layer so internal engineering detail does not leak into user-facing pages.',
        ),
        metrics: [
          {
            label: t('settings.metric.assets', 'Asset files'),
            value: bundle
              ? renderTemplate(t('settings.count.assets', '{count} assets'), {
                  count: bundle.externalAgents.assets.length,
                })
              : '--',
          },
          {
            label: t('settings.metric.rootDir', 'Root directory'),
            value: bundle?.externalAgents.rootDir
              ? t('settings.value.connected', 'Connected')
              : t('settings.value.notDetected', 'Not detected'),
          },
          {
            label: t('settings.metric.multilingualStrategy', 'Multilingual strategy'),
            value: runtime ? runtime.defaultLanguage.toUpperCase() : '--',
          },
          {
            label: t('settings.metric.runtimeCache', 'Runtime cache'),
            value: formatSwitch(runtime?.cacheGeneratedOutputs ?? false, t),
          },
        ],
        primaryHref: '/prompt-studio?tab=agents',
        primaryLabel: t('settings.agentsPrimary', 'Open agent assets'),
        secondaryHref: '/prompt-studio?tab=copy',
        secondaryLabel: t('settings.agentsSecondary', 'Review copy layer'),
        icon: Wand2,
      },
      {
        id: 'research' as const,
        eyebrow: t('settings.researchEyebrow', 'Research tracking'),
        title: t('settings.researchTitle', 'Paper discovery and admission'),
        body: t(
          'settings.researchBody',
          'Configure how the research tracking agent discovers and admits papers. Adjust discovery depth, admission thresholds, and per-stage limits to make the agent a master researcher in your domain.',
        ),
        metrics: [
          {
            label: t('settings.metric.maxCandidates', 'Max candidates per stage'),
            value: String(researchConfig.maxCandidatesPerStage),
          },
          {
            label: t('settings.metric.discoveryLimit', 'Discovery query limit'),
            value: String(researchConfig.discoveryQueryLimit),
          },
          {
            label: t('settings.metric.maxPapersPerNode', 'Max papers per node'),
            value: String(researchConfig.maxPapersPerNode),
          },
          {
            label: t('settings.metric.minPapersPerNode', 'Minimum useful papers per node'),
            value: String(researchConfig.minPapersPerNode),
          },
          {
            label: t('settings.metric.targetCandidatesBeforeAdmission', 'Target candidates before admission'),
            value: String(researchConfig.targetCandidatesBeforeAdmission),
          },
          {
            label: t('settings.metric.admissionThreshold', 'Admission threshold'),
            value: String(researchConfig.admissionThreshold),
          },
          {
            label: t('settings.metric.highConfidenceThreshold', 'High-confidence admission threshold'),
            value: String(researchConfig.highConfidenceThreshold),
          },
          {
            label: t('settings.metric.semanticScholarLimit', 'Semantic Scholar limit'),
            value: String(researchConfig.semanticScholarLimit),
          },
          {
            label: t('settings.metric.discoveryRounds', 'Discovery rounds'),
            value: String(researchConfig.discoveryRounds),
          },
        ],
        primaryHref: '/topic-manager',
        primaryLabel: t('settings.researchPrimary', 'Configure topics'),
        secondaryHref: '/settings?tab=pipeline',
        secondaryLabel: t('settings.researchSecondary', 'View pipeline'),
        icon: BookOpen,
      },
    ]
  }, [bundle, capabilities, configuredRoleCount, effectiveRoleCount, t, totalRoleCount, researchConfig])

  const advancedModulesOpen = focusTab === 'prompts' || focusTab === 'copy' || focusTab === 'agents'
  const primaryCards = cards.filter((card) => card.id === 'models' || card.id === 'pipeline')
  const advancedCards = cards.filter((card) => card.id === 'prompts' || card.id === 'agents')

  return (
    <main data-testid="settings-page" className="px-4 pb-20 pt-8 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1380px]">
        <header className="rounded-[32px] border border-black/8 bg-white px-6 py-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)] md:px-8">
          <div className="max-w-[820px]">
            <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">
              {t('settings.overviewEyebrow', 'Settings Center')}
            </div>
            <h1
              data-testid="settings-overview-title"
              className="mt-3 font-display text-[28px] leading-[1.04] text-black md:text-[36px]"
            >
              {t('settings.overviewTitle', 'Settings Overview')}
            </h1>
            <p className="mt-3 max-w-[720px] text-[13px] leading-6 text-black/58">
              {t(
                'settings.overviewDescription',
                'Confirm models, research orchestration, prompts and copy, and agent assets are connected here first. Open advanced configuration only when you need deeper control.',
              )}
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {topMetrics.map((metric) => (
              <SettingsMetric key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>

          <div
            data-testid="settings-current-focus"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/56"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('settings.currentFocus', 'Current focus')}: {focusLabel}
          </div>
        </header>

        {loading ? (
          <section className="mt-6 rounded-[30px] border border-black/8 bg-white px-6 py-12 text-center shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-black/42" />
            <p className="mt-4 text-[14px] text-black/56">
              {t('settings.loading', 'Loading current system configuration and capability status...')}
            </p>
          </section>
        ) : error ? (
          <section className="mt-6 rounded-[30px] border border-[#d1aa5c]/40 bg-white px-6 py-8 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#fff6e6] px-3 py-1 text-[12px] text-[#8a5a12]">
              <Sparkles className="h-4 w-4" />
              {t('settings.availableBadge', 'Settings center is still available')}
            </div>
            <p className="mt-4 max-w-[760px] text-[14px] leading-7 text-black/62">
              {renderTemplate(
                t(
                  'settings.errorDescription',
                  '{error} You can still open the advanced configuration pages to adjust models, prompts, copy, and agent assets.',
                ),
                { error },
              )}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/prompt-studio?tab=models"
                className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-[13px] text-white"
              >
                {t('settings.openAdvanced', 'Open advanced configuration')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : (
          <>
          <section className="mt-6 grid gap-5 xl:grid-cols-2">
            {primaryCards.map((card) => (
              <SettingsCard
                key={card.id}
                active={focusTab === card.id}
                eyebrow={card.eyebrow}
                title={card.title}
                body={card.body}
                metrics={card.metrics}
                primaryHref={card.primaryHref}
                primaryLabel={card.primaryLabel}
                secondaryHref={card.secondaryHref}
              secondaryLabel={card.secondaryLabel}
              icon={card.icon}
            />
            ))}
            <ResearchConfigCard
              active={focusTab === 'research'}
              eyebrow={t('settings.researchEyebrow', 'Research tracking')}
              title={t('settings.researchTitle', 'Paper discovery and admission')}
              body={t(
                'settings.researchBody',
                'Configure how the research tracking agent discovers and admits papers. Adjust discovery depth, admission thresholds, and per-stage limits to make the agent a master researcher in your domain.',
              )}
              icon={BookOpen}
              config={researchConfig}
              editing={researchEditing}
              saving={researchSaving}
              saved={researchSaved}
              error={researchError}
              onEdit={() => setResearchEditing(true)}
              onSave={handleSaveResearchConfig}
              onCancel={handleCancelResearchEdit}
              onChange={setResearchConfig}
              primaryHref="/topic-manager"
              primaryLabel={t('settings.researchPrimary', 'Configure topics')}
              secondaryHref="/settings?tab=pipeline"
              secondaryLabel={t('settings.researchSecondary', 'View pipeline')}
              t={t}
/>
          </section>

          <details open={advancedModulesOpen} className="mt-6 rounded-[24px] border border-black/8 bg-white px-5 py-5">
            <summary className="cursor-pointer list-none text-[14px] font-medium text-black">
              {t('settings.advancedModulesTitle', 'Advanced modules')}
            </summary>
            <p className="mt-2 max-w-[760px] text-[13px] leading-7 text-black/56">
              {t(
                'settings.advancedModulesDescription',
                'Prompt editing, interface copy, and agent assets stay here so the main settings page can stay easy to scan.',
              )}
            </p>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              {advancedCards.map((card) => (
                <SettingsCard
                  key={card.id}
                  active={focusTab === card.id || (focusTab === 'copy' && card.id === 'prompts')}
                  eyebrow={card.eyebrow}
                  title={card.title}
                  body={card.body}
                  metrics={card.metrics}
                  primaryHref={card.primaryHref}
                  primaryLabel={card.primaryLabel}
                  secondaryHref={card.secondaryHref}
                  secondaryLabel={card.secondaryLabel}
                  icon={card.icon}
                />
              ))}
            </div>
          </details>
          </>
         )}

        <details className="mt-6 rounded-[24px] border border-black/8 bg-white px-5 py-5">
          <summary className="cursor-pointer list-none text-[14px] font-medium text-black">
            {t('settings.historyTitle', 'History and rollback')}
          </summary>
          <div className="mt-4">
            <ConfigHistoryPanel
              currentVersion={currentConfigVersion}
              onRollback={() => {
                invalidateModelCapabilitySummary()
                fetchModelCapabilitySummary({ force: true }).then(setCapabilities)
                apiGet<{ history: Array<{ version: number }> }>('/api/omni/config/history?limit=1').then((res) => {
                  if (res.history.length > 0) {
                    setCurrentConfigVersion(res.history[0].version)
                  }
                })
              }}
            />
          </div>
        </details>

        <section className="mt-6 border-y border-black/8 px-4 py-5 md:px-2">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-black/44">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('settings.recommendationEyebrow', 'Usage guidance')}
            </div>
              <p className="mt-3 max-w-[760px] text-[14px] leading-7 text-black/62">
                {t(
                  'settings.recommendationDescription',
                  "If you only want to confirm the system's current state, this page is enough. Move into advanced configuration only when you are ready to fine-tune models, memory flow, prompt templates, or agent assets.",
                )}
              </p>
            </div>
            <Link
              to={`/prompt-studio?tab=${focusTab === 'copy' ? 'copy' : focusTab}`}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2.5 text-[13px] text-black/64 transition hover:border-black/16 hover:text-black"
            >
              {t('settings.openCurrentModule', 'Open advanced configuration for this module')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

export default SettingsPage
