/**
 * Backend Internationalization Infrastructure
 * Supports 8 languages: zh, en, ja, ko, de, fr, es, ru
 */

import type { Request } from 'express'

// Supported language codes - matching frontend
export type BackendLanguageCode = 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'

// Translation record structure
export type TranslationRecord = Partial<Record<BackendLanguageCode, string>>

// Translation dictionary type
export type TranslationDictionary = Record<string, TranslationRecord>

// All valid language codes as array
export const VALID_LANGUAGE_CODES: BackendLanguageCode[] = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru']

// Language preference from request
export interface LanguagePreference {
  primary: BackendLanguageCode
  secondary?: BackendLanguageCode
  mode: 'monolingual' | 'bilingual'
}

// Request context with locale
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      locale?: LanguagePreference
    }
  }
}

/**
 * Detect locale from request headers.
 * Priority: x-alpha-language > Accept-Language > default to 'zh'
 */
export function detectLocaleFromRequest(req: Request): LanguagePreference {
  // Check custom header first (from frontend)
  const alphaLanguage = req.headers['x-alpha-language'] as string | undefined
  if (alphaLanguage && isValidLanguage(alphaLanguage)) {
    return {
      primary: alphaLanguage,
      secondary: getSecondaryLanguage(alphaLanguage),
      mode: 'monolingual',
    }
  }

  // Parse Accept-Language header
  const acceptLanguage = req.headers['accept-language']
  if (acceptLanguage) {
    const detected = parseAcceptLanguage(acceptLanguage)
    if (detected) {
      return {
        primary: detected,
        secondary: getSecondaryLanguage(detected),
        mode: 'monolingual',
      }
    }
  }

  // Default to Chinese
  return {
    primary: 'zh',
    secondary: 'en',
    mode: 'monolingual',
  }
}

/**
 * Get secondary language for a given primary language.
 * For Chinese -> English, otherwise -> Chinese
 */
function getSecondaryLanguage(primary: BackendLanguageCode): BackendLanguageCode {
  if (primary === 'zh') return 'en'
  if (primary === 'en') return 'zh'
  // For other languages, secondary is Chinese
  return 'zh'
}

/**
 * Parse Accept-Language header and return best matching language.
 */
function parseAcceptLanguage(header: string): BackendLanguageCode | null {
  const languages = header
    .split(',')
    .map((lang) => {
      const [code, qPart] = lang.trim().split(';')
      const q = qPart ? parseFloat(qPart.replace('q=', '')) : 1
      return { code: code.trim().toLowerCase(), q }
    })
    .sort((a, b) => b.q - a.q)

  for (const { code } of languages) {
    // Match zh, zh-CN, zh-TW, zh-Hans, zh-Hant
    if (code.startsWith('zh')) {
      return 'zh'
    }
    // Match en, en-US, en-GB
    if (code.startsWith('en')) {
      return 'en'
    }
    // Match ja, ja-JP
    if (code.startsWith('ja')) {
      return 'ja'
    }
    // Match ko, ko-KR
    if (code.startsWith('ko')) {
      return 'ko'
    }
    // Match de, de-DE, de-AT
    if (code.startsWith('de')) {
      return 'de'
    }
    // Match fr, fr-FR, fr-CA
    if (code.startsWith('fr')) {
      return 'fr'
    }
    // Match es, es-ES, es-MX
    if (code.startsWith('es')) {
      return 'es'
    }
    // Match ru, ru-RU
    if (code.startsWith('ru')) {
      return 'ru'
    }
  }

  return null
}

/**
 * Check if language code is valid.
 */
export function isValidLanguage(code: string): code is BackendLanguageCode {
  return VALID_LANGUAGE_CODES.includes(code as BackendLanguageCode)
}

/**
 * Backend i18n class for translation lookup.
 */
export class BackendI18n {
  private dictionaries: Map<string, TranslationDictionary> = new Map()
  private defaultLocale: BackendLanguageCode = 'zh'

  constructor(defaultLocale: BackendLanguageCode = 'zh') {
    this.defaultLocale = defaultLocale
  }

  /**
   * Register a translation dictionary.
   */
  registerDictionary(namespace: string, dictionary: TranslationDictionary): void {
    this.dictionaries.set(namespace, dictionary)
  }

  /**
   * Get translation for a key.
   * Key format: "namespace.key" or just "key" (uses first matching namespace).
   */
  t(key: string, locale?: BackendLanguageCode, fallback?: string): string {
    const lang = locale ?? this.defaultLocale
    const [namespace, ...keyParts] = key.split('.')
    const translationKey = keyParts.join('.')

    // Try namespace-specific lookup
    const dict = this.dictionaries.get(namespace)
    if (dict && translationKey) {
      const record = dict[translationKey]
      if (record) {
        return this.resolveRecord(record, lang, fallback ?? key)
      }
    }

    // Try global lookup across all dictionaries
    for (const [, dictionary] of this.dictionaries) {
      const record = dictionary[key]
      if (record) {
        return this.resolveRecord(record, lang, fallback ?? key)
      }
    }

    return fallback ?? key
  }

  /**
   * Get bilingual translation for a key.
   */
  tb(
    key: string,
    primary: BackendLanguageCode,
    secondary: BackendLanguageCode,
  ): { primary: string; secondary: string } {
    return {
      primary: this.t(key, primary),
      secondary: this.t(key, secondary),
    }
  }

  /**
   * Resolve translation record to string.
   * Fallback order: requested lang -> Chinese -> English -> first available
   */
  private resolveRecord(record: TranslationRecord, lang: BackendLanguageCode, fallback: string): string {
    // Try requested language
    if (record[lang]) {
      return record[lang]!
    }
    // Fallback to Chinese (default)
    if (record.zh) {
      return record.zh
    }
    // Fallback to English
    if (record.en) {
      return record.en
    }
    // Fallback to first available language in record
    const availableKeys = Object.keys(record) as BackendLanguageCode[]
    if (availableKeys.length > 0) {
      return record[availableKeys[0]]!
    }
    return fallback
  }

  /**
   * Set default locale.
   */
  setDefaultLocale(locale: BackendLanguageCode): void {
    this.defaultLocale = locale
  }

  /**
   * Get default locale.
   */
  getDefaultLocale(): BackendLanguageCode {
    return this.defaultLocale
  }

  /**
   * Create a scoped translator for a specific namespace.
   */
  scope(namespace: string): ScopedTranslator {
    return new ScopedTranslator(this, namespace)
  }
}

/**
 * Scoped translator for a specific namespace.
 */
export class ScopedTranslator {
  constructor(
    private i18n: BackendI18n,
    private namespace: string,
  ) {}

  t(key: string, locale?: BackendLanguageCode, fallback?: string): string {
    return this.i18n.t(`${this.namespace}.${key}`, locale, fallback)
  }

  tb(
    key: string,
    primary: BackendLanguageCode,
    secondary: BackendLanguageCode,
  ): { primary: string; secondary: string } {
    return this.i18n.tb(`${this.namespace}.${key}`, primary, secondary)
  }
}

// Global i18n instance
let globalI18n: BackendI18n | null = null

/**
 * Get or create the global i18n instance.
 */
export function getI18n(): BackendI18n {
  if (!globalI18n) {
    globalI18n = new BackendI18n()
  }
  return globalI18n
}

/**
 * Initialize i18n with dictionaries.
 */
export function initializeI18n(dictionaries: Record<string, TranslationDictionary>): void {
  const i18n = getI18n()
  for (const [namespace, dict] of Object.entries(dictionaries)) {
    i18n.registerDictionary(namespace, dict)
  }
}

/**
 * Create a request-scoped i18n helper.
 */
export function createRequestI18n(locale: LanguagePreference): RequestI18nHelper {
  return new RequestI18nHelper(getI18n(), locale)
}

/**
 * Request-scoped i18n helper for convenient translation.
 */
export class RequestI18nHelper {
  constructor(
    private i18n: BackendI18n,
    private locale: LanguagePreference,
  ) {}

  /**
   * Translate a key using request locale.
   */
  t(key: string, fallback?: string): string {
    return this.i18n.t(key, this.locale.primary, fallback)
  }

  /**
   * Get bilingual translation.
   */
  tb(key: string): { primary: string; secondary: string } {
    return this.i18n.tb(key, this.locale.primary, this.locale.secondary ?? 'en')
  }

  /**
   * Check if bilingual mode.
   */
  isBilingual(): boolean {
    return this.locale.mode === 'bilingual'
  }

  /**
   * Get primary language.
   */
  get primaryLanguage(): BackendLanguageCode {
    return this.locale.primary
  }

  /**
   * Get secondary language.
   */
  get secondaryLanguage(): BackendLanguageCode {
    return this.locale.secondary ?? 'en'
  }
}

export default BackendI18n
