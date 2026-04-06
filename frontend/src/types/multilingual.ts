// 多语言内容类型定义 - 统一前后端数据格式

import type { LanguageCode } from '@/i18n/types'

// 完整的8语言多语言内容对象
export interface MultilingualContent {
  zh?: string
  en?: string
  ja?: string
  ko?: string
  de?: string
  fr?: string
  es?: string
  ru?: string
}

// 多语言内容字段 - 用于API响应中的字段
export type MultilingualField = string | MultilingualContent

// 类型守卫：检查值是否为多语言内容对象
export function isMultilingualContent(value: unknown): value is MultilingualContent {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  const languageKeys: LanguageCode[] = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru']
  return languageKeys.some((key) => typeof obj[key] === 'string')
}

// 类型守卫：检查值是否为纯字符串
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

// 从多语言内容中提取最佳匹配
export function getBestMatch(
  content: MultilingualContent | string | undefined,
  preferredLanguage: LanguageCode,
  fallbackChain: LanguageCode[] = ['zh', 'en']
): string {
  // 如果是字符串，直接返回
  if (typeof content === 'string') return content
  if (!content) return ''

  // 优先返回首选语言
  if (content[preferredLanguage]) return content[preferredLanguage]!

  // 按 fallback 链查找
  for (const lang of fallbackChain) {
    if (content[lang]) return content[lang]!
  }

  // 返回任意可用语言
  const values = Object.values(content).filter((v): v is string => typeof v === 'string')
  return values[0] || ''
}

// 将多语言内容转换为双语显示格式
export function toBilingualContent(
  content: MultilingualContent | string | undefined,
  primaryLanguage: LanguageCode,
  secondaryLanguage: LanguageCode,
  isBilingualMode: boolean
): { primary: string; secondary?: string } {
  // 如果是纯字符串
  if (typeof content === 'string') {
    return { primary: content }
  }
  if (!content) {
    return { primary: '' }
  }

  const primary = content[primaryLanguage] || content['zh'] || content['en'] || ''
  const secondary = isBilingualMode
    ? (content[secondaryLanguage] || content['en'] || content['zh'])
    : undefined

  return { primary, secondary }
}

// API 响应中的多语言主题数据结构
export interface MultilingualTopicName {
  nameZh?: string
  nameEn?: string
  nameJa?: string
  nameKo?: string
  nameDe?: string
  nameFr?: string
  nameEs?: string
  nameRu?: string
}

export interface MultilingualTopicDescription {
  descriptionZh?: string
  descriptionEn?: string
  descriptionJa?: string
  descriptionKo?: string
  descriptionDe?: string
  descriptionFr?: string
  descriptionEs?: string
  descriptionRu?: string
}

// 将分离的多语言字段转换为 MultilingualContent 对象
export function topicNameToMultilingual(topic: MultilingualTopicName): MultilingualContent {
  return {
    zh: topic.nameZh,
    en: topic.nameEn,
    ja: topic.nameJa,
    ko: topic.nameKo,
    de: topic.nameDe,
    fr: topic.nameFr,
    es: topic.nameEs,
    ru: topic.nameRu,
  }
}

export function topicDescriptionToMultilingual(
  topic: MultilingualTopicDescription
): MultilingualContent {
  return {
    zh: topic.descriptionZh,
    en: topic.descriptionEn,
    ja: topic.descriptionJa,
    ko: topic.descriptionKo,
    de: topic.descriptionDe,
    fr: topic.descriptionFr,
    es: topic.descriptionEs,
    ru: topic.descriptionRu,
  }
}

// 统一的多语言文本组件 Props
export interface MultilingualTextProps {
  content: MultilingualContent | string | undefined
  primaryLanguage: LanguageCode
  secondaryLanguage?: LanguageCode
  isBilingual?: boolean
  layout?: 'stack' | 'inline' | 'side-by-side'
  sizeRatio?: 'normal' | 'emphasize-primary' | 'equal'
  className?: string
}
