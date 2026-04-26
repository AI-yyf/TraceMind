/**
 * i18n integration for editorial services.
 * Provides bilingual content generation support.
 */

import { getI18n, type BackendLanguageCode } from '../../i18n'
import type { PromptLanguage } from '../generation/prompt-registry'

/**
 * Bilingual content result.
 */
export interface BilingualContent {
  zh: string
  en: string
}

/**
 * Get localized content label.
 */
export function getLocalizedContentLabel(
  label: 'introduction' | 'background' | 'methodology' | 'results' | 'discussion' | 'conclusion' | 'references' | 'abstract' | 'summary' | 'synthesis' | 'closing',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`content.${label}`, lang)
}

/**
 * Get bilingual content labels.
 */
export function getBilingualContentLabels(): Record<string, BilingualContent> {
  const i18n = getI18n()
  const labels = [
    'introduction',
    'background',
    'methodology',
    'results',
    'discussion',
    'conclusion',
    'references',
    'abstract',
    'summary',
    'synthesis',
    'closing',
  ]

  const result: Record<string, BilingualContent> = {}
  for (const label of labels) {
    result[label] = {
      zh: i18n.t(`content.${label}`, 'zh'),
      en: i18n.t(`content.${label}`, 'en'),
    }
  }
  return result
}

/**
 * Get localized generation prompt.
 */
export function getLocalizedPrompt(
  promptKey: 'generateIntroduction' | 'generateSummary' | 'generateSynthesis' | 'analyzeEvidence' | 'compareMethods',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`prompt.${promptKey}`, lang)
}

/**
 * Convert BackendLanguageCode to PromptLanguage.
 */
export function toPromptLanguage(locale: BackendLanguageCode): PromptLanguage {
  return locale === 'zh' ? 'zh' : 'en'
}

/**
 * Convert PromptLanguage to BackendLanguageCode.
 */
export function fromPromptLanguage(lang: PromptLanguage): BackendLanguageCode {
  return lang === 'zh' ? 'zh' : 'en'
}

/**
 * Create bilingual content structure.
 */
export function createBilingualContent(zhContent: string, enContent: string): BilingualContent {
  return { zh: zhContent, en: enContent }
}

/**
 * Get content status label.
 */
export function getLocalizedContentStatus(
  status: 'draft' | 'reviewing' | 'published' | 'archived',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`content.status.${status}`, lang)
}

/**
 * Get figure/table/formula label.
 */
export function getLocalizedArtifactLabel(
  type: 'figure' | 'table' | 'formula' | 'equation',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`content.${type}`, lang)
}

/**
 * Format bilingual caption.
 */
export function formatBilingualCaption(
  type: 'figure' | 'table' | 'formula',
  number: number | string,
  captionZh: string,
  captionEn: string,
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  const typeLabel = i18n.t(`content.${type}`, lang)

  if (lang === 'zh') {
    return `${typeLabel} ${number}: ${captionZh}`
  }
  return `${typeLabel} ${number}: ${captionEn}`
}

/**
 * Get metadata label.
 */
export function getLocalizedMetadataLabel(
  label: 'author' | 'date' | 'version' | 'lastModified',
  locale?: BackendLanguageCode,
): string {
  const i18n = getI18n()
  const lang = locale ?? 'zh'
  return i18n.t(`content.metadata.${label}`, lang)
}

/**
 * Create bilingual article structure.
 */
export function createBilingualArticleStructure(): {
  sections: Array<{ key: string; labelZh: string; labelEn: string }>
} {
  const i18n = getI18n()
  const sections = ['introduction', 'background', 'methodology', 'results', 'discussion', 'conclusion', 'references']

  return {
    sections: sections.map((key) => ({
      key,
      labelZh: i18n.t(`content.${key}`, 'zh'),
      labelEn: i18n.t(`content.${key}`, 'en'),
    })),
  }
}

export default {
  getLocalizedContentLabel,
  getBilingualContentLabels,
  getLocalizedPrompt,
  toPromptLanguage,
  fromPromptLanguage,
  createBilingualContent,
  getLocalizedContentStatus,
  getLocalizedArtifactLabel,
  formatBilingualCaption,
  getLocalizedMetadataLabel,
  createBilingualArticleStructure,
}
