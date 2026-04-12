import { prisma } from '../../lib/prisma'

export const TOPIC_LOCALIZATION_LANGUAGES = [
  'zh',
  'en',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'ru',
] as const

export type TopicLocalizationLanguage =
  (typeof TOPIC_LOCALIZATION_LANGUAGES)[number]

export interface TopicLocaleRecord {
  name: string
  summary: string
  focusLabel: string
  description: string
}

export interface StageLocaleRecord {
  name: string
  description: string
}

export type TopicLocaleMap = Record<TopicLocalizationLanguage, TopicLocaleRecord>
export type StageLocaleMap = Record<TopicLocalizationLanguage, StageLocaleRecord>

export interface TopicLocalizationPayload {
  schemaVersion: string
  languageMode: string
  primaryLanguage: TopicLocalizationLanguage
  topic: {
    primaryLanguage: TopicLocalizationLanguage
    recommendedStages: number
    nameZh: string
    nameEn: string
    summary: string
    summaryZh: string
    summaryEn: string
    focusLabel: string
    focusLabelZh: string
    focusLabelEn: string
    keywords: Array<{
      zh: string
      en: string
      localized: Record<TopicLocalizationLanguage, string>
    }>
    locales: TopicLocaleMap
  }
  stages: Array<{
    order: number
    name: string
    nameEn: string
    description: string
    descriptionEn: string
    locales: StageLocaleMap
  }>
  preview?: unknown
  createdAt?: string
}

function localizationConfigKey(topicId: string) {
  return `topic:${topicId}:localization`
}

function parseTopicLocalization(value: string | null | undefined) {
  if (!value) return null

  try {
    return JSON.parse(value) as TopicLocalizationPayload
  } catch {
    return null
  }
}

export async function getTopicLocalization(topicId: string) {
  const record = await prisma.system_configs.findUnique({
    where: { key: localizationConfigKey(topicId) },
  })

  return parseTopicLocalization(record?.value)
}

export async function getTopicLocalizationMap(topicIds: string[]) {
  if (topicIds.length === 0) {
    return new Map<string, TopicLocalizationPayload>()
  }

  const records = await prisma.system_configs.findMany({
    where: {
      key: {
        in: topicIds.map((topicId) => localizationConfigKey(topicId)),
      },
    },
  })

  return new Map(
    records
      .map((record) => {
        const topicId = record.key.slice('topic:'.length, -':localization'.length)
        const parsed = parseTopicLocalization(record.value)
        return parsed ? ([topicId, parsed] as const) : null
      })
      .filter((entry): entry is readonly [string, TopicLocalizationPayload] => Boolean(entry)),
  )
}

export function getStageLocalization(
  payload: TopicLocalizationPayload | null | undefined,
  stageIndex: number,
) {
  return payload?.stages.find((stage) => stage.order === stageIndex) ?? null
}
