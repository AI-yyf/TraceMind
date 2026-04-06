import type { PromptLanguageCode } from '@/types/alpha'

export type TopicCreateLanguage = PromptLanguageCode | 'bilingual'

export const TOPIC_LANGUAGE_LABELS: Record<PromptLanguageCode, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  ru: 'Русский',
}

export const TOPIC_SOURCE_PLACEHOLDERS: Record<PromptLanguageCode, string> = {
  zh: '描述你要长期追踪的问题、关键方法、重要论文线索，以及它为什么值得做成持续研究主题。',
  en: 'Describe the research direction, key methods, important paper threads, and why it deserves long-term tracking.',
  ja: '追跡したい研究テーマ、重要な手法、主要な論文の流れ、そして長期テーマにする価値を説明してください。',
  ko: '장기적으로 추적할 연구 방향, 핵심 방법, 중요한 논문 흐름, 그리고 왜 지속 연구 주제로 삼을 가치가 있는지 설명해 주세요.',
  de: 'Beschreibe die Forschungsrichtung, zentrale Methoden, wichtige Paper-Linien und warum sich ein langfristiges Thema lohnt.',
  fr: 'Décrivez l’orientation de recherche, les méthodes clés, les fils de papiers importants et pourquoi ce sujet mérite un suivi durable.',
  es: 'Describe la dirección de investigación, los métodos clave, los hilos de artículos importantes y por qué merece un seguimiento continuo.',
  ru: 'Опишите исследовательское направление, ключевые методы, важные линии работ и почему тему стоит отслеживать в долгую.',
}

export type TopicPreviewLocale = {
  name: string
  summary: string
  focusLabel: string
  description: string
}

export type TopicPreview = {
  nameZh: string
  nameEn: string
  keywords: Array<{ zh: string; en: string }>
  summary: string
  summaryZh: string
  summaryEn: string
  recommendedStages: number
  focusLabel: string
  focusLabelZh: string
  focusLabelEn: string
  primaryLanguage?: PromptLanguageCode
  locales?: Record<PromptLanguageCode, TopicPreviewLocale>
}

export const TOPIC_PROMPT_LANGUAGES: PromptLanguageCode[] = [
  'zh',
  'en',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'ru',
]

export const TOPIC_CREATE_LANGUAGE_OPTIONS: Array<{
  value: TopicCreateLanguage
  title: string
  description: string
  badge: string
}> = [
  {
    value: 'zh',
    title: '简体中文',
    description: '以中文原生创建主题，并同步生成完整的 8 语言主题蓝图。',
    badge: 'ZH',
  },
  {
    value: 'en',
    title: 'English',
    description: 'Use English as the source language and generate a full multilingual topic blueprint.',
    badge: 'EN',
  },
  {
    value: 'ja',
    title: '日本語',
    description: '日本語をソース言語として、そのまま 8 言語のテーマ設計へ展开します。',
    badge: 'JA',
  },
  {
    value: 'ko',
    title: '한국어',
    description: '한국어를 원문 입력으로 사용해 8개 언어 주제 청사진을 생성합니다.',
    badge: 'KO',
  },
  {
    value: 'de',
    title: 'Deutsch',
    description: 'Nutze Deutsch als Ausgangssprache und erzeuge daraus eine vollständige 8-Sprachen-Struktur.',
    badge: 'DE',
  },
  {
    value: 'fr',
    title: 'Français',
    description: 'Utilisez le français comme langue source pour générer un plan de thème complet en 8 langues.',
    badge: 'FR',
  },
  {
    value: 'es',
    title: 'Español',
    description: 'Usa español como idioma de origen y genera una estructura temática completa en 8 idiomas.',
    badge: 'ES',
  },
  {
    value: 'ru',
    title: 'Русский',
    description: 'Используйте русский как исходный язык и создайте полную 8-язычную структуру темы.',
    badge: 'RU',
  },
  {
    value: 'bilingual',
    title: '中英双语（兼容）',
    description: '保留旧的中英双语入口，适合需要中文主叙述加英文锚点的创建方式。',
    badge: 'LEGACY',
  },
]

export function resolveTopicSourceLanguage(language: TopicCreateLanguage): PromptLanguageCode {
  return language === 'bilingual' ? 'zh' : language
}

export function buildTopicAnchorLanguageOrder(sourceLanguage: PromptLanguageCode) {
  const priority: PromptLanguageCode[] = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru']
  return priority.filter((language) => language !== sourceLanguage)
}

export function normalizeTopicBuilderLanguage(language: string): TopicCreateLanguage {
  if (TOPIC_PROMPT_LANGUAGES.includes(language as PromptLanguageCode)) {
    return language as TopicCreateLanguage
  }
  return 'zh'
}

export function normalizeAnchorDescriptions(
  sourceLanguage: PromptLanguageCode,
  anchorDescriptions: Partial<Record<PromptLanguageCode, string>>,
) {
  return Object.fromEntries(
    Object.entries(anchorDescriptions).flatMap(([language, value]) => {
      const normalized = value?.trim()
      return normalized && language !== sourceLanguage ? [[language, normalized]] : []
    }),
  ) as Partial<Record<PromptLanguageCode, string>>
}

export function resolvePreviewLocale(
  preview: TopicPreview | null | undefined,
  language: PromptLanguageCode,
) {
  if (!preview) return null
  return preview.locales?.[language] ?? preview.locales?.[preview.primaryLanguage ?? language] ?? null
}
