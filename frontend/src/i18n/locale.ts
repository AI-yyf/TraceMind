import type { LanguageCode } from './types'

const LANGUAGE_TAG_MAP: Record<LanguageCode, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  ru: 'ru-RU',
}

export function resolveLanguageLocale(language: LanguageCode) {
  return LANGUAGE_TAG_MAP[language] ?? LANGUAGE_TAG_MAP.zh
}

export function formatDateTimeByLanguage(
  value: string | number | Date,
  language: LanguageCode,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(resolveLanguageLocale(language), options).format(date)
}
