/**
 * i18n integration for enhanced-scheduler.
 * Provides localized labels for stages, lenses, and research modes.
 */

import { getI18n, type BackendLanguageCode } from '../i18n'

/**
 * Lens configuration with i18n support.
 */
export interface LocalizedLens {
  id: string
  label: string
  labelZh: string
  labelEn: string
  focus: string
  prompts: string[]
}

/**
 * Get localized lens labels.
 */
export function getLocalizedLenses(locale?: BackendLanguageCode): LocalizedLens[] {
  const i18n = getI18n()
  const lang = locale ?? 'zh'

  const lensConfigs = [
    {
      id: 'core-mainline',
      focus: 'problem',
      prompts: ['core mechanism', 'mainline contribution', 'fundamental limitation'],
    },
    {
      id: 'method-design',
      focus: 'method',
      prompts: ['architecture', 'training objective', 'latent dynamics', 'planning'],
    },
    {
      id: 'evidence-audit',
      focus: 'citation',
      prompts: ['benchmark', 'ablation', 'evaluation protocol', 'closed-loop evidence'],
    },
    {
      id: 'boundary-failure',
      focus: 'merge',
      prompts: ['failure mode', 'robustness', 'safety', 'uncertainty'],
    },
    {
      id: 'artifact-grounding',
      focus: 'citation',
      prompts: ['dataset', 'figure analysis', 'table evidence', 'formula objective'],
    },
    {
      id: 'theoretical-foundation',
      focus: 'problem',
      prompts: ['mathematical proof', 'convergence guarantee', 'bound analysis', 'information theory'],
    },
    {
      id: 'scalability-efficiency',
      focus: 'method',
      prompts: ['computational cost', 'memory efficiency', 'scaling law', 'inference speed'],
    },
    {
      id: 'cross-domain-transfer',
      focus: 'merge',
      prompts: ['domain adaptation', 'transfer learning', 'generalization', 'zero-shot'],
    },
  ]

  const lensKeyMap: Record<string, string> = {
    'core-mainline': 'lens.coreMainline',
    'method-design': 'lens.methodDesign',
    'evidence-audit': 'lens.evidenceAudit',
    'boundary-failure': 'lens.boundaryFailure',
    'artifact-grounding': 'lens.artifactGrounding',
    'theoretical-foundation': 'lens.theoreticalFoundation',
    'scalability-efficiency': 'lens.scalabilityEfficiency',
    'cross-domain-transfer': 'lens.crossDomainTransfer',
  }

  return lensConfigs.map((config) => {
    const key = lensKeyMap[config.id] ?? config.id
    return {
      id: config.id,
      label: i18n.t(key, lang),
      labelZh: i18n.t(key, 'zh'),
      labelEn: i18n.t(key, 'en'),
      focus: config.focus,
      prompts: config.prompts,
    }
  })
}

/**
 * Get localized stage label.
 */
export function getLocalizedStageLabel(
  stage: 'discovery' | 'filtering' | 'extraction' | 'modeling' | 'synthesis' | 'generation',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`stage.${stage}`, lang)
}

/**
 * Get localized status label.
 */
export function getLocalizedStatusLabel(
  status: 'running' | 'paused' | 'completed' | 'failed' | 'pending',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`status.${status}`, lang)
}

/**
 * Get localized action label.
 */
export function getLocalizedActionLabel(
  action: 'discover' | 'refresh' | 'sync',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`action.${action}`, lang)
}

/**
 * Get localized mode label.
 */
export function getLocalizedModeLabel(
  mode: 'duration' | 'stageRounds',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`mode.${mode}`, lang)
}

/**
 * Format stage progress summary with i18n.
 */
export function formatLocalizedProgressSummary(
  currentStage: number,
  totalStages: number,
  currentRuns: number,
  targetRuns: number,
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'

  // Use template from translations
  const template = i18n.t('summary.stageRun', lang)
  return template
    .replace('{stage}', String(currentStage))
    .replace('{totalStages}', String(totalStages))
    .replace('{currentRuns}', String(currentRuns))
    .replace('{targetRuns}', String(targetRuns))
}

/**
 * Format duration progress summary with i18n.
 */
export function formatLocalizedDurationSummary(
  durationHours: number,
  currentStage: number,
  totalStages: number,
  stageStalls: number,
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'

  const template = i18n.t('summary.progressDuration', lang)
  return template
    .replace('{durationHours}', String(durationHours))
    .replace('{currentStage}', String(currentStage))
    .replace('{totalStages}', String(totalStages))
    .replace('{stageStalls}', String(stageStalls))
}

/**
 * Get bilingual lens labels for API responses.
 */
export function getBilingualLensLabels(): Array<{
  id: string
  labelZh: string
  labelEn: string
}> {
  return getLocalizedLenses().map((lens) => ({
    id: lens.id,
    labelZh: lens.labelZh,
    labelEn: lens.labelEn,
  }))
}

export default {
  getLocalizedLenses,
  getLocalizedStageLabel,
  getLocalizedStatusLabel,
  getLocalizedActionLabel,
  getLocalizedModeLabel,
  formatLocalizedProgressSummary,
  formatLocalizedDurationSummary,
  getBilingualLensLabels,
}
