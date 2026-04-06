export type LanguageCode = 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'

export type DisplayMode = 'monolingual' | 'bilingual'

export interface LanguagePreference {
  primary: LanguageCode
  secondary?: LanguageCode
  mode: DisplayMode
}

export type TranslationRecord = Partial<Record<LanguageCode, string>>

export type TranslationDictionary = Record<string, TranslationRecord>

export interface LanguageMetadata {
  code: LanguageCode
  name: string
  nameLocal: string
  direction: 'ltr' | 'rtl'
  isRTL: boolean
}

export const SUPPORTED_LANGUAGES: LanguageMetadata[] = [
  { code: 'zh', name: 'Chinese', nameLocal: '中文', direction: 'ltr', isRTL: false },
  { code: 'en', name: 'English', nameLocal: 'English', direction: 'ltr', isRTL: false },
  { code: 'ja', name: 'Japanese', nameLocal: '日本語', direction: 'ltr', isRTL: false },
  { code: 'ko', name: 'Korean', nameLocal: '한국어', direction: 'ltr', isRTL: false },
  { code: 'de', name: 'German', nameLocal: 'Deutsch', direction: 'ltr', isRTL: false },
  { code: 'fr', name: 'French', nameLocal: 'Français', direction: 'ltr', isRTL: false },
  { code: 'es', name: 'Spanish', nameLocal: 'Español', direction: 'ltr', isRTL: false },
  { code: 'ru', name: 'Russian', nameLocal: 'Русский', direction: 'ltr', isRTL: false },
]

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = {
  primary: 'zh',
  secondary: 'en',
  mode: 'monolingual',
}

export function getLanguageMetadata(code: LanguageCode): LanguageMetadata {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code) || SUPPORTED_LANGUAGES[0]
}

export function isLanguageSupported(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code)
}
