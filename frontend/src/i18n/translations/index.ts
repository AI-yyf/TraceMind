import type { LanguageCode, TranslationDictionary, TranslationRecord } from '../types'

import brand from './brand'
import common from './common'
import create from './create'
import error from './error'
import favorites from './favorites'
import home from './home'
import navigation from './navigation'
import node from './node'
import paper from './paper'
import polish from './polish'
import quality from './quality'
import qualityMainflow from './quality-mainflow'
import qualityLongtail from './quality-longtail'
import research from './research'
import search from './search'
import settings from './settings'
import studio from './studio'
import topic from './topic'
import workbench from './workbench'

function mergeTranslationModules(...modules: TranslationDictionary[]) {
  return modules.reduce<TranslationDictionary>((dictionary, module) => {
    for (const [key, record] of Object.entries(module)) {
      dictionary[key] = {
        ...(dictionary[key] ?? {}),
        ...record,
      }
    }
    return dictionary
  }, {})
}

const CORRUPTION_FRAGMENTS = [
  '\uFFFD',
  '鈥',
  '銆?',
  '锛?',
  '銉',
  '瑾',
  '鞀',
  '頃',
  '褍',
  '袩',
  '鍒涘缓',
  '璁剧疆',
  '鐮旂┒',
  '鎼滅储',
  '鍔犺浇',
  '涓婚',
  '鏄剧ず',
  '鍙岃',
  '閰嶇疆',
  '鏈',
  '宸查',
]

function normalizeCandidate(value?: string | null) {
  const text = value?.trim() ?? ''
  return text || null
}

export function looksCorruptedTranslation(value?: string | null) {
  const text = normalizeCandidate(value)
  if (!text) return false

  let hits = 0
  for (const fragment of CORRUPTION_FRAGMENTS) {
    if (text.includes(fragment)) {
      hits += fragment.length > 1 ? 2 : 1
    }
  }

  return hits >= 2
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
)

function resolveTranslationRecord(
  record: TranslationRecord | undefined,
  language: LanguageCode,
  fallback?: string,
) {
  if (!record) {
    return fallback || ''
  }

  return pickBestLocalizedValue(
    [record[language], record.en, record.zh, fallback],
    fallback || '',
  )
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
