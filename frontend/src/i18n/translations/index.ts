import type { LanguageCode, TranslationDictionary, TranslationRecord } from '../types'

import brand from './brand'
import common from './common'
import create from './create'
import dashboard from './dashboard'
import error from './error'
import favorites from './favorites'
import home from './home'
import mainPath from './main-path'
import navigation from './navigation'
import node from './node'
import onboarding from './onboarding'
import paper from './paper'
import polish from './polish'
import quality from './quality'
import qualityLongtail from './quality-longtail'
import qualityMainflow from './quality-mainflow'
import research from './research'
import search from './search'
import settings from './settings'
import studio from './studio'
import topic from './topic'
import workbench from './workbench'

const LANGUAGE_CODES: LanguageCode[] = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru']
const SUSPICIOUS_FRAGMENT_PATTERNS = [
  /\uFFFD/u,
  /[鈥銆锛]/u,
  /鍔犺浇|鐮旂┒|涓婚|璁剧疆|妯″瀷|绯荤粺|鐣岄潰|璇█|涓枃|鑻辨枃|闃舵|鍒涘缓|杩斿洖|鎼滅储|鍏抽棴|璁烘枃|鍒ゆ柇|鏀舵潫/u,
  /[搿靸氚鞐頃袪褟携鏇閫]{2,}/u,
] as const
const SUSPICIOUS_CHAR_RE = /[鈥銆锛鍔鐮璁妯绯鎼鍏鍒杩璇闃浜鏀缁搿靸氚鞐頃袪褟携鏇閫]/gu

function normalizeCandidate(value?: string | null) {
  const text = value?.trim() ?? ''
  return text || null
}

export function looksCorruptedTranslation(value?: string | null) {
  const text = normalizeCandidate(value)
  if (!text) return false

  if (SUSPICIOUS_FRAGMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true
  }

  const suspiciousCharCount = text.match(SUSPICIOUS_CHAR_RE)?.length ?? 0
  return suspiciousCharCount >= 3
}

export function pickBestLocalizedValue(
  candidates: Array<string | null | undefined>,
  finalFallback = '',
) {
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate)
    if (normalized && !looksCorruptedTranslation(normalized)) {
      return normalized
    }
  }

  return normalizeCandidate(finalFallback) ?? ''
}

function mergeTranslationModules(...modules: TranslationDictionary[]) {
  return modules.reduce<TranslationDictionary>((dictionary, module) => {
    for (const [key, incomingRecord] of Object.entries(module)) {
      const nextRecord: TranslationRecord = { ...(dictionary[key] ?? {}) }

      for (const language of LANGUAGE_CODES) {
        const incomingValue = incomingRecord[language]
        if (!incomingValue) continue

        const currentValue = nextRecord[language]
        const incomingIsCorrupted = looksCorruptedTranslation(incomingValue)
        const currentIsCorrupted = looksCorruptedTranslation(currentValue)

        if (!currentValue || (currentIsCorrupted && !incomingIsCorrupted) || !incomingIsCorrupted) {
          nextRecord[language] = incomingValue
        }
      }

      dictionary[key] = nextRecord
    }
    return dictionary
  }, {})
}

const TRANSLATIONS: TranslationDictionary = mergeTranslationModules(
  common,
  brand,
  navigation,
  favorites,
  error,
  home,
  topic,
  paper,
  node,
  create,
  search,
  workbench,
  settings,
  research,
  studio,
  polish,
  quality,
  qualityMainflow,
  qualityLongtail,
  mainPath,
  dashboard,
  onboarding,
)

function resolveTranslationRecord(
  record: TranslationRecord | undefined,
  language: LanguageCode,
  fallback?: string,
) {
  if (!record) {
    return fallback || ''
  }

  return pickBestLocalizedValue([record[language], record.en, record.zh, fallback], fallback || '')
}

export default TRANSLATIONS

export {
  common,
  brand,
  navigation,
  favorites,
  error,
  home,
  topic,
  paper,
  node,
  create,
  search,
  workbench,
  settings,
  research,
  studio,
  polish,
  quality,
  qualityMainflow,
  qualityLongtail,
  mainPath,
  dashboard,
  onboarding,
}

export function getTranslation(
  key: string,
  language: LanguageCode,
  fallback?: string,
): string {
  return resolveTranslationRecord(TRANSLATIONS[key], language, fallback || key) || key
}

export function getBilingualTranslation(
  key: string,
  primary: LanguageCode,
  secondary: LanguageCode,
): { primary: string; secondary: string } {
  const record = TRANSLATIONS[key]
  return {
    primary: resolveTranslationRecord(record, primary, key) || key,
    secondary: resolveTranslationRecord(record, secondary, key) || key,
  }
}
