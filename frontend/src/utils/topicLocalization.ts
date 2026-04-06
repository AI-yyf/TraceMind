import type { LanguageCode, LanguagePreference } from '@/i18n/types'
import type {
  PromptLanguageCode,
  StageLocaleMap,
  TopicLocalizationPayload,
  TopicLocaleMap,
} from '@/types/alpha'

const LANGUAGE_FALLBACK_ORDER: PromptLanguageCode[] = [
  'zh',
  'en',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'ru',
]

function uniqueLanguages(
  primary: LanguageCode,
  secondary?: LanguageCode,
) {
  return Array.from(
    new Set<PromptLanguageCode>([
      primary,
      ...(secondary ? [secondary] : []),
      ...LANGUAGE_FALLBACK_ORDER,
    ]),
  )
}

function pickValue(
  values: Partial<Record<PromptLanguageCode, string>>,
  primary: LanguageCode,
  secondary?: LanguageCode,
  fallback = '',
) {
  for (const language of uniqueLanguages(primary, secondary)) {
    const value = values[language]?.trim()
    if (value) return value
  }

  return fallback
}

export function resolveLocalizedPair(
  values: Partial<Record<PromptLanguageCode, string>>,
  preference: LanguagePreference,
  fallbackPrimary = '',
  fallbackSecondary = '',
) {
  return {
    primary: pickValue(values, preference.primary, undefined, fallbackPrimary),
    secondary:
      preference.mode === 'bilingual'
        ? pickValue(
            values,
            preference.secondary ?? 'en',
            preference.primary,
            fallbackSecondary,
          )
        : '',
  }
}

export function getTopicLocalizedPair(
  localization: TopicLocalizationPayload | null | undefined,
  field: keyof TopicLocaleMap[PromptLanguageCode],
  preference: LanguagePreference,
  fallbackPrimary = '',
  fallbackSecondary = '',
) {
  const values = localization
    ? Object.fromEntries(
        LANGUAGE_FALLBACK_ORDER.map((language) => [
          language,
          localization.topic.locales[language]?.[field] ?? '',
        ]),
      )
    : {}

  return resolveLocalizedPair(values, preference, fallbackPrimary, fallbackSecondary)
}

export function getStageLocalizedPair(
  locales: StageLocaleMap | undefined,
  field: keyof StageLocaleMap[PromptLanguageCode],
  preference: LanguagePreference,
  fallbackPrimary = '',
  fallbackSecondary = '',
) {
  const values = locales
    ? Object.fromEntries(
        LANGUAGE_FALLBACK_ORDER.map((language) => [language, locales[language]?.[field] ?? '']),
      )
    : {}

  return resolveLocalizedPair(values, preference, fallbackPrimary, fallbackSecondary)
}
