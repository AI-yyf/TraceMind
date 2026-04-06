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
} from 'lucide-react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import type { ModelCapabilitySummary, PromptStudioBundle } from '@/types/alpha'
import { apiGet } from '@/utils/api'

type SettingsFocusTab = 'models' | 'pipeline' | 'prompts' | 'copy' | 'agents'

const focusTabs: SettingsFocusTab[] = ['models', 'pipeline', 'prompts', 'copy', 'agents']

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

export function SettingsPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [capabilities, setCapabilities] = useState<ModelCapabilitySummary | null>(null)
  const [bundle, setBundle] = useState<PromptStudioBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
            : t('settings.focus.agents', 'Agents')

  useDocumentTitle(t('nav.settings', 'Settings'))

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
      apiGet<ModelCapabilitySummary>('/api/model-capabilities'),
      apiGet<PromptStudioBundle>('/api/prompt-templates/studio'),
    ])
      .then(([nextCapabilities, nextBundle]) => {
        if (!alive) return
        setCapabilities(nextCapabilities)
        setBundle(nextBundle)
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
    ]
  }, [bundle, capabilities, configuredRoleCount, effectiveRoleCount, t, totalRoleCount])

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
          <section className="mt-6 grid gap-5 xl:grid-cols-2">
            {cards.map((card) => (
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
          </section>
        )}

        <section className="mt-6 rounded-[30px] border border-black/8 bg-white px-6 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:px-8">
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
