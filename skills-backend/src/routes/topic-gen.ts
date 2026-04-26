import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { asyncHandler } from '../middleware/errorHandler'
import { logger } from '../utils/logger'
import {
  getGenerationRuntimeConfig,
  getPromptTemplate,
  PROMPT_LANGUAGES,
  PROMPT_TEMPLATE_IDS,
  renderPromptVariables,
  type GenerationEditorialPolicy,
  type PromptLanguage,
} from '../services/generation/prompt-registry'
import { inferResearchRoleForTemplate } from '../services/omni/routing'
import { getResolvedUserModelConfig, type ResolvedProviderModelConfig } from '../services/omni/config-store'
import { omniGateway } from '../services/omni/gateway'
import type { OmniCompleteRequest, OmniIssue } from '../services/omni/types'

const router = Router()

const TOPIC_LANGUAGE_CODES = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru'] as const
const TOPIC_LANGUAGE_MODES = [...TOPIC_LANGUAGE_CODES, 'bilingual'] as const

type TopicLanguageMode = (typeof TOPIC_LANGUAGE_MODES)[number]

const promptLanguageSchema = z.enum(TOPIC_LANGUAGE_CODES)
const languageSchema = z.enum(TOPIC_LANGUAGE_MODES)

const localizedTopicLocaleSchema = z.object({
  name: z.string().trim().default(''),
  summary: z.string().trim().default(''),
  focusLabel: z.string().trim().default(''),
  description: z.string().trim().default(''),
})

const localizedStageLocaleSchema = z.object({
  name: z.string().trim().default(''),
  description: z.string().trim().default(''),
})

const topicLocalesSchema = z.object({
  zh: localizedTopicLocaleSchema,
  en: localizedTopicLocaleSchema,
  ja: localizedTopicLocaleSchema,
  ko: localizedTopicLocaleSchema,
  de: localizedTopicLocaleSchema,
  fr: localizedTopicLocaleSchema,
  es: localizedTopicLocaleSchema,
  ru: localizedTopicLocaleSchema,
})

const stageLocalesSchema = z.object({
  zh: localizedStageLocaleSchema,
  en: localizedStageLocaleSchema,
  ja: localizedStageLocaleSchema,
  ko: localizedStageLocaleSchema,
  de: localizedStageLocaleSchema,
  fr: localizedStageLocaleSchema,
  es: localizedStageLocaleSchema,
  ru: localizedStageLocaleSchema,
})

const localizedKeywordSchema = z.object({
  zh: z.string().trim().default(''),
  en: z.string().trim().default(''),
  localized: z.object({
    zh: z.string().trim().default(''),
    en: z.string().trim().default(''),
    ja: z.string().trim().default(''),
    ko: z.string().trim().default(''),
    de: z.string().trim().default(''),
    fr: z.string().trim().default(''),
    es: z.string().trim().default(''),
    ru: z.string().trim().default(''),
  }),
})

const previewPayloadSchema = z
  .object({
    nameZh: z.string().trim().default(''),
    nameEn: z.string().trim().default(''),
    keywords: z
      .array(
        z.object({
          zh: z.string().trim().default(''),
          en: z.string().trim().default(''),
        }),
      )
      .max(6)
      .default([]),
    summary: z.string().trim().default(''),
    summaryZh: z.string().trim().default(''),
    summaryEn: z.string().trim().default(''),
    recommendedStages: z.number().int().min(3).max(5).default(4),
    focusLabel: z.string().trim().default(''),
    focusLabelZh: z.string().trim().default(''),
    focusLabelEn: z.string().trim().default(''),
    primaryLanguage: promptLanguageSchema.optional(),
    locales: topicLocalesSchema.optional(),
  })
  .passthrough()

const blueprintSchema = z.object({
  topic: z.object({
    primaryLanguage: promptLanguageSchema.default('zh'),
    recommendedStages: z.number().int().min(3).max(5).default(4),
    nameZh: z.string().trim().default(''),
    nameEn: z.string().trim().default(''),
    summary: z.string().trim().default(''),
    summaryZh: z.string().trim().default(''),
    summaryEn: z.string().trim().default(''),
    focusLabel: z.string().trim().default(''),
    focusLabelZh: z.string().trim().default(''),
    focusLabelEn: z.string().trim().default(''),
    keywords: z.array(localizedKeywordSchema).max(6).default([]),
    locales: topicLocalesSchema,
  }),
  stages: z
    .array(
      z.object({
        order: z.number().int().min(1),
        name: z.string().trim().default(''),
        nameEn: z.string().trim().default(''),
        description: z.string().trim().default(''),
        descriptionEn: z.string().trim().default(''),
        locales: stageLocalesSchema,
      }),
    )
    .min(3)
    .max(5),
})

const blueprintCoreSchema = z.object({
  topic: z.object({
    primaryLanguage: promptLanguageSchema.default('zh'),
    recommendedStages: z.number().int().min(3).max(5).default(4),
    name: z.string().trim().default(''),
    nameEn: z.string().trim().default(''),
    summary: z.string().trim().default(''),
    summaryEn: z.string().trim().default(''),
    focusLabel: z.string().trim().default(''),
    focusLabelEn: z.string().trim().default(''),
    keywords: z
      .array(
        z.object({
          source: z.string().trim().default(''),
          en: z.string().trim().default(''),
        }),
      )
      .max(6)
      .default([]),
  }),
  stages: z
    .array(
      z.object({
        order: z.number().int().min(1),
        name: z.string().trim().default(''),
        nameEn: z.string().trim().default(''),
        description: z.string().trim().default(''),
        descriptionEn: z.string().trim().default(''),
      }),
    )
    .min(3)
    .max(5),
})

const localizedTopicPatchSchema = z.object({
  name: z.string().trim().default(''),
  summary: z.string().trim().default(''),
  focusLabel: z.string().trim().default(''),
  description: z.string().trim().default(''),
  keywords: z.array(z.string().trim().default('')).max(6).default([]),
})

const localizationPatchSchema = z.object({
  language: promptLanguageSchema,
  topic: localizedTopicPatchSchema,
  stages: z
    .array(
      z.object({
        order: z.number().int().min(1),
        name: z.string().trim().default(''),
        description: z.string().trim().default(''),
      }),
    )
    .min(1)
    .max(5),
})

const localizedInputDescriptionsSchema = z.object({
  zh: z.string().trim().optional(),
  en: z.string().trim().optional(),
  ja: z.string().trim().optional(),
  ko: z.string().trim().optional(),
  de: z.string().trim().optional(),
  fr: z.string().trim().optional(),
  es: z.string().trim().optional(),
  ru: z.string().trim().optional(),
})

const previewInputSchema = z.object({
  sourceLanguage: promptLanguageSchema.optional(),
  sourceDescription: z.string().trim().optional(),
  anchorDescriptions: localizedInputDescriptionsSchema.optional(),
  descriptionByLanguage: localizedInputDescriptionsSchema.optional(),
  description: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  language: languageSchema.default('zh'),
  provider: z.enum(['openai', 'anthropic']).optional(),
})

function validateTopicGenerationInput(
  value: z.infer<typeof previewInputSchema>,
  ctx: z.RefinementCtx,
) {
    const languageMode = value.language ?? 'zh'
    const sourceLanguage = value.sourceLanguage ?? resolvePromptLanguage(languageMode)
    const localizedDescriptions = {
      ...(value.anchorDescriptions ?? {}),
      ...(value.descriptionByLanguage ?? {}),
    }
    const sourceDescription = pickNonEmpty(
      value.sourceDescription,
      localizedDescriptions[sourceLanguage],
      value.description,
      sourceLanguage === 'en' ? value.descriptionEn : undefined,
      value.descriptionEn,
    )

    if (sourceDescription.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Source description must be at least 10 characters.',
        path: ['sourceDescription'],
      })
    }
}

const previewSchema = previewInputSchema.superRefine((value, ctx) => {
  validateTopicGenerationInput(value, ctx)
})

const createSchema = previewInputSchema
  .extend({
  preview: previewPayloadSchema.optional(),
  })
  .superRefine((value, ctx) => {
    validateTopicGenerationInput(value, ctx)
  })

type TopicPreview = z.infer<typeof previewPayloadSchema>
type TopicBlueprint = z.infer<typeof blueprintSchema>
type TopicBlueprintCore = z.infer<typeof blueprintCoreSchema>
type TopicLocalizationPatch = z.infer<typeof localizationPatchSchema>
type TopicKeyword = TopicBlueprint['topic']['keywords'][number]
type TopicLocaleMap = TopicBlueprint['topic']['locales']
type StageLocaleMap = TopicBlueprint['stages'][number]['locales']
type TopicInputDescriptions = Partial<Record<PromptLanguage, string>>

interface TopicGenerationInput {
  languageMode: TopicLanguageMode
  sourceLanguage: PromptLanguage
  sourceDescription: string
  anchorDescriptions: TopicInputDescriptions
  descriptionByLanguage: TopicInputDescriptions
  provider?: 'openai' | 'anthropic'
}

type FallbackKeywordConcept = {
  slug: string
  zh: string
  en: string
  patterns: RegExp[]
}

const TOPIC_PREVIEW_MODEL_TIMEOUT_MS = 4000
// Some OpenAI-compatible gateways trickle SSE chunks for tens of seconds even on
// small non-stream requests. Keep preview responsive and fall back quickly.
const TOPIC_PREVIEW_MODEL_TIMEOUT_MS_COMPATIBLE = 7000
const TOPIC_BLUEPRINT_MODEL_TIMEOUT_MS = 30000
const TOPIC_BLUEPRINT_MODEL_TIMEOUT_MS_COMPATIBLE = 120000
const TOPIC_BLUEPRINT_CREATE_TIMEOUT_MS = 7000
const TOPIC_BLUEPRINT_CREATE_TIMEOUT_MS_COMPATIBLE = 8500
const TOPIC_LOCALIZATION_MODEL_TIMEOUT_MS = 22000
const TOPIC_LOCALIZATION_MODEL_TIMEOUT_MS_COMPATIBLE = 42000
const TOPIC_LOCALIZATION_CONCURRENCY = 7
const TOPIC_LOCALIZATION_CONCURRENCY_COMPATIBLE = 2
const TOPIC_PREVIEW_MAX_TOKENS = 1200
const TOPIC_PREVIEW_MAX_TOKENS_COMPATIBLE = 1024
const TOPIC_LOCALIZATION_MAX_TOKENS = 750
const TOPIC_LOCALIZATION_MAX_TOKENS_COMPATIBLE = 760

const FALLBACK_KEYWORD_CONCEPTS: FallbackKeywordConcept[] = [
  {
    slug: 'autonomous-driving',
    zh: '自动驾驶',
    en: 'Autonomous Driving',
    patterns: [/\bautonomous driving\b/iu, /\bself-driving\b/iu, /自动驾驶/u],
  },
  {
    slug: 'vla',
    zh: 'VLA',
    en: 'VLA',
    patterns: [/\bvision-language-action\b/iu, /\bvla\b/iu, /视觉语言动作/u],
  },
  {
    slug: 'world-models',
    zh: '世界模型',
    en: 'World Models',
    patterns: [/\bworld models?\b/iu, /世界模型/u],
  },
  {
    slug: 'closed-loop-planning',
    zh: '闭环规划',
    en: 'Closed-Loop Planning',
    patterns: [/\bclosed[- ]loop\b/iu, /\bplanning[- ]control\b/iu, /闭环规划/u, /规划与控制/u],
  },
  {
    slug: 'simulation',
    zh: '仿真与数据合成',
    en: 'Simulation and Synthetic Data',
    patterns: [/\bsimulation\b/iu, /\bsynthetic data\b/iu, /仿真/u, /数据合成/u],
  },
  {
    slug: 'memory-retrieval',
    zh: '记忆与检索',
    en: 'Memory and Retrieval',
    patterns: [/\bmemory\b/iu, /\bretrieval\b/iu, /记忆/u, /检索/u],
  },
  {
    slug: 'action-tokenization',
    zh: '行动 Token 化',
    en: 'Action Tokenization',
    patterns: [/\baction token(?:ization)?\b/iu, /\btokeni[sz]ation\b/iu, /token 化/u, /token化/u],
  },
  {
    slug: 'driving-agents',
    zh: '驾驶智能体',
    en: 'Driving Agents',
    patterns: [/\bdriving agents?\b/iu, /\bend-to-end driving agents?\b/iu, /驾驶智能体/u, /端到端驾驶智能体/u],
  },
]

const TOPIC_KEYWORD_SCAFFOLD_RE =
  /^(?:围绕|关于|聚焦|关注|重点覆盖|尤其关注|要求|建立|创建|搭建|开展|进行|build|create|establish|craft|follow|track|study|research|topic|focus|covering|including|priorit(?:y|ize|izing))\b/iu

const TOPIC_KEYWORD_NOISE_RE =
  /(?:长期研究|研究主题|研究追踪|广纳贤文|最终节点页|完整文章|原文跳转|保留图|保留表|保留关键公式|主线|支线|节点|阶段|时间线|时间窗|分期|源头论文|mainline|problem-oriented|stage-local|stage local|time window|publication-time window)/iu

function resolveRequestUserId(req: { header(name: string): string | undefined }) {
  const candidate = req.header('x-alpha-user-id')?.trim()
  if (!candidate) return undefined
  const normalized = candidate.replace(/[^a-zA-Z0-9:_-]/gu, '').slice(0, 64)
  return normalized || undefined
}

const STAGE_LABEL_LIBRARY: Record<PromptLanguage, string[]> = {
  zh: ['问题框定', '核心机制', '证据扩展', '比较张力', '综合判断'],
  en: ['Problem Framing', 'Core Mechanisms', 'Evidence Expansion', 'Comparative Tensions', 'Synthesis'],
  ja: ['問題設定', '中核メカニズム', '証拠拡張', '比較の緊張', '総合判断'],
  ko: ['문제 설정', '핵심 메커니즘', '증거 확장', '비교 긴장', '종합 판단'],
  de: ['Problemrahmen', 'Kernmechanismen', 'Evidenzaufbau', 'Vergleichsspannung', 'Synthese'],
  fr: ['Cadre du problème', 'Mécanismes centraux', 'Extension des preuves', 'Tensions comparatives', 'Synthèse'],
  es: ['Marco del problema', 'Mecanismos clave', 'Expansión de evidencia', 'Tensión comparativa', 'Síntesis'],
  ru: ['Постановка проблемы', 'Ключевые механизмы', 'Расширение доказательств', 'Сравнительное напряжение', 'Синтез'],
}

const PROMPT_LANGUAGE_LABELS = Object.fromEntries(
  PROMPT_LANGUAGES.map((language) => [language.code, language.label]),
) as Record<PromptLanguage, string>

function clipText(value: string, maxLength = 64) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function pickNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  return ''
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildFallbackStageDescription(
  language: PromptLanguage,
  focusLabel: string,
  order: number,
) {
  switch (language) {
    case 'zh':
      return `${focusLabel}的第 ${order} 个推进阶段，强调这一轮真正解决了什么。`
    case 'ja':
      return `${focusLabel}に関する第${order}段階で、このラウンドが何を前進させたのかを見極める。`
    case 'ko':
      return `${focusLabel}에 관한 ${order}단계로, 이번 라운드가 실제로 무엇을 진전시켰는지 분명히 한다.`
    case 'de':
      return `${focusLabel}: Phase ${order}, in der klar wird, was dieser Schritt wirklich voranbringt.`
    case 'fr':
      return `${focusLabel} : étape ${order}, pour clarifier ce que cette avancée fait réellement progresser.`
    case 'es':
      return `${focusLabel}: etapa ${order}, para aclarar qué avance real introduce este paso.`
    case 'ru':
      return `${focusLabel}: этап ${order}, который проясняет, что именно продвигает этот шаг.`
    default:
      return `${focusLabel} stage ${order}, clarifying what this round truly advances.`
  }
}

function titleCase(value: string) {
  return value
    .split(/[\s\-_/]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function sanitizeTopicText(value: string) {
  return value
    .replace(/\s+/gu, ' ')
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/gu, '')
    .trim()
}

function looksTooGenericTopicSubject(value: string | null | undefined) {
  const normalized = sanitizeTopicText(value ?? '').toLowerCase()
  if (!normalized) return true

  return [
    'around',
    'about',
    'for',
    'on',
    'regarding',
    'topic',
    'research topic',
    'research focus',
    'focus',
    'study',
  ].includes(normalized)
}

function extractEnglishTopicSubject(value: string) {
  const normalized = sanitizeTopicText(value)
  if (!normalized) return ''

  let candidate = normalized
  const patterns = [
    /(?:create|build|establish|craft)\s+(?:a|an)?\s*(?:sustained|long(?:-| )horizon|long-term|persistent)?\s*(?:research\s+)?topic\s+(?:around|on|about|for|regarding)\s+(.+)/iu,
    /(?:create|build|establish)\s+(?:a|an)?\s*(?:research\s+)?track(?:er)?\s+(?:around|on|about|for|regarding)\s+(.+)/iu,
    /(?:focus(?:ing)? on|track|follow)\s+(.+)/iu,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      candidate = match[1].trim()
      break
    }
  }

  return sanitizeTopicText(
    candidate
      .replace(
        /^(?:build|create|establish|craft|follow|track)\s+(?:a|an)?\s*(?:sustained|long(?:-| )horizon|long-term|persistent)?\s*(?:research\s+)?(?:topic|track(?:er)?|study)\s+(?:around|on|about|for|regarding)\s+/iu,
        '',
      )
      .replace(/^(?:around|about|for|on|regarding)\s+/iu, '')
      .replace(/\bfrom\s+20\d{2}\s+(?:to|-)\s+20\d{2}\b.*$/iu, '')
      .replace(
        /\b(?:with|while|where|that|including|covering|ensure|ensuring|prioriti[sz]e|prioriti[sz]ing|distinguish(?:ing)?|focusing on)\b.*$/iu,
        '',
      )
      .replace(/[.?!].*$/u, '')
      .replace(/[,\s;:]+$/u, ''),
  )
}

function extractChineseTopicSubject(value: string) {
  const normalized = sanitizeTopicText(value)
  if (!normalized) return ''

  let candidate = normalized
  const patterns = [
    /(?:\u8bf7)?(?:\u56f4\u7ed5|\u805a\u7126|\u5173\u6ce8)(.+?)(?:\u5efa\u7acb|\u521b\u5efa|\u642d\u5efa).*(?:\u4e3b\u9898|\u7814\u7a76\u4e3b\u9898|\u7814\u7a76\u8ffd\u8e2a)/u,
    /(?:\u5efa\u7acb|\u521b\u5efa|\u642d\u5efa)(?:\u4e00\u4e2a)?(?:\u5173\u4e8e|\u56f4\u7ed5)?(.+?)(?:\u7684)?(?:\u957f\u671f)?(?:\u7814\u7a76)?(?:\u4e3b\u9898|\u7814\u7a76\u8ffd\u8e2a)/u,
    /(?:\u5173\u4e8e|\u56f4\u7ed5)(.+?)(?:\u7684)?(?:\u7814\u7a76)?(?:\u8ffd\u8e2a|\u4e3b\u9898)/u,
    /(?:\u56f4\u7ed5)(.+?)(?:\u5f00\u5c55|\u5c55\u5f00|\u8fdb\u884c|\u5efa\u7acb|\u521b\u5efa|\u642d\u5efa)/u,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      candidate = match[1].trim()
      break
    }
  }

  return sanitizeTopicText(
    candidate
      .replace(/^(?:\u56f4\u7ed5|\u805a\u7126|\u5173\u6ce8|\u5173\u4e8e)\s*/u, '')
      .replace(
        /(?:\u5efa\u7acb|\u521b\u5efa|\u642d\u5efa).*(?:\u4e3b\u9898|\u7814\u7a76\u4e3b\u9898|\u7814\u7a76\u8ffd\u8e2a).*$/u,
        '',
      )
      .replace(/\u4ece?\s*20\d{2}\s*(?:\u5230|-|to)\s*20\d{2}(?:\u5e74)?/u, '')
      .replace(
        /(?:\u91cd\u70b9|\u5e76\u4e14|\u5e76|\u8981\u6c42|\u4e0d\u8981|\u4ee5\u53ca).*$|\b(?:with|that|distinguish(?:ing)?|prioriti[sz]e|focusing on)\b.*$/iu,
        '',
      )
      .replace(/[。！？].*$/u, '')
      .replace(/[.?!].*$/u, ''),
  )
}

function extractTopicSubject(value: string, language: PromptLanguage) {
  const normalized = sanitizeTopicText(value)
  if (!normalized) return ''

  if (language === 'zh' || /[\u4e00-\u9fff]/u.test(normalized)) {
    const chinese = extractChineseTopicSubject(normalized)
    if (chinese && !looksTooGenericTopicSubject(chinese)) return chinese
  }

  const english = extractEnglishTopicSubject(normalized)
  if (english && !looksTooGenericTopicSubject(english)) return english

  return sanitizeTopicText(normalized.replace(/[.。!?！？].*$/u, ''))
}

function resolveFallbackKeywordConcept(value: string) {
  const normalized = sanitizeTopicText(value)
  if (!normalized) return null

  return resolveFallbackKeywordConcepts(normalized)[0] ?? null
}

function resolveFallbackKeywordConcepts(value: string) {
  const normalized = sanitizeTopicText(value)
  if (!normalized) return []

  return FALLBACK_KEYWORD_CONCEPTS
    .map((concept) => {
      const matches = concept.patterns
        .map((pattern) => normalized.search(pattern))
        .filter((index) => index >= 0)

      if (!matches.length) return null
      return {
        concept,
        index: Math.min(...matches),
      }
    })
    .filter((entry): entry is { concept: FallbackKeywordConcept; index: number } => Boolean(entry))
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.concept)
}

function keywordLooksUseful(value: string) {
  const normalized = sanitizeTopicText(value)
  if (!normalized) return false
  if (TOPIC_KEYWORD_SCAFFOLD_RE.test(normalized)) return false
  if (TOPIC_KEYWORD_NOISE_RE.test(normalized)) return false
  if (looksPromptScaffoldedTopicValue(normalized)) return false
  if (looksTooGenericTopicSubject(normalized)) return false

  const latinWordCount = (normalized.match(/[a-zA-Z]+/gu) ?? []).length
  if (!/[\u4e00-\u9fff]/u.test(normalized) && latinWordCount > 5) return false
  if (/^[\p{Script=Han}]{13,}$/u.test(normalized)) return false

  return true
}

function cleanKeywordClause(value: string) {
  return sanitizeTopicText(
    value
      .replace(
        /^(?:围绕|关于|聚焦|关注|重点覆盖|尤其关注|覆盖|包括|涵盖|涉及|建立|创建|搭建|开展|进行|要求)\s*/u,
        '',
      )
      .replace(
        /^(?:build|create|establish|craft|follow|track|study|research|focus(?:ing)? on|covering|including|prioriti[sz](?:e|ing))\s+/iu,
        '',
      )
      .replace(/^(?:可用于|用于|面向|针对)\S{0,12}?的/u, '')
      .replace(/^(?:for|toward|towards|about|around|on)\s+/iu, '')
      .replace(/\b(?:papers?|nodes?|stages?|timeline|research topic)\b.*$/iu, '')
      .replace(/[，,、;；:.。]+$/u, ''),
  )
}

function splitTopicSubjectSegments(subject: string) {
  const normalized = sanitizeTopicText(subject)
  if (!normalized) return []

  const segments =
    normalized.match(
      /[\p{Script=Han}]{2,12}|[A-Z]{2,10}(?:-[A-Z]{2,10})*|[A-Za-z]+(?:[\s-][A-Za-z]+){0,2}/gu,
    ) ?? []

  return Array.from(
    new Set(
      segments
        .map((segment) => cleanKeywordClause(segment))
        .filter((segment) => keywordLooksUseful(segment)),
    ),
  )
}

function extractFocusSegments(value: string, language: PromptLanguage) {
  const normalized = sanitizeTopicText(value)
  if (!normalized) return []

  const marker =
    language === 'zh'
      ? /(?:重点覆盖|尤其关注|覆盖|包括|涵盖|涉及|关注)(.+)$/u
      : /\b(?:including|covering|especially|focusing on|prioriti[sz](?:e|ing))\b(.+)$/iu
  const sentences = normalized
    .split(/[。！？!?]/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  const segments: string[] = []
  for (const sentence of sentences) {
    const source = sentence.match(marker)?.[1]?.trim()
    if (!source) continue

    const clauses = source
      .split(
        language === 'zh'
          ? /[、，,；;]|(?:以及|及|和|与)/u
          : /,|;|\band\b|\bor\b/iu,
      )
      .map((clause) => cleanKeywordClause(clause))
      .filter((clause) => keywordLooksUseful(clause))

    segments.push(...clauses)
  }

  return Array.from(new Set(segments))
}

function buildFallbackKeywordPairs(
  input: TopicGenerationInput,
  subjects: {
    sourceSubject: string
    zhSubject: string
    enSubject: string
  },
) {
  const conceptSources = [
    input.sourceDescription,
    subjects.sourceSubject,
    subjects.zhSubject,
    subjects.enSubject,
    ...Object.values(input.anchorDescriptions),
    ...Object.values(input.descriptionByLanguage),
  ].filter(Boolean)

  const values = [
    subjects.sourceSubject,
    subjects.zhSubject,
    subjects.enSubject,
    ...splitTopicSubjectSegments(subjects.sourceSubject),
    ...splitTopicSubjectSegments(subjects.zhSubject),
    ...splitTopicSubjectSegments(subjects.enSubject),
    ...extractFocusSegments(pickInputDescription(input, 'zh'), 'zh'),
    ...extractFocusSegments(pickInputDescription(input, 'en'), 'en'),
  ].filter(Boolean)

  const pairs: Array<{ key: string; zh: string; en: string }> = []
  const seen = new Set<string>()

  const pushPair = (value: string) => {
    const normalized = cleanKeywordClause(value)
    if (!keywordLooksUseful(normalized)) return

    const concept = resolveFallbackKeywordConcept(normalized)
    const pair = concept
      ? { key: concept.slug, zh: concept.zh, en: concept.en }
      : /[\u4e00-\u9fff]/u.test(normalized)
        ? { key: normalized.toLowerCase(), zh: normalized, en: normalized }
        : {
            key: normalized.toLowerCase(),
            zh: normalized.toUpperCase() === normalized ? normalized : normalized,
            en: titleCase(normalized),
          }

    if (seen.has(pair.key)) return
    seen.add(pair.key)
    pairs.push(pair)
  }

  const pushConcepts = (value: string) => {
    const concepts = resolveFallbackKeywordConcepts(value)
    if (!concepts.length) return false

    for (const concept of concepts) {
      pushPair(concept.zh)
    }

    return true
  }

  for (const value of conceptSources) {
    pushConcepts(value)
  }

  for (const value of values) {
    if (pushConcepts(value)) {
      continue
    }

    pushPair(value)
  }

  return pairs.slice(0, 6).map(({ zh, en }) => ({ zh, en }))
}

function buildFallbackTopicName(keywordPairs: Array<{ zh: string; en: string }>, language: 'zh' | 'en') {
  const values = keywordPairs
    .map((pair) => (language === 'zh' ? pair.zh : pair.en))
    .filter((value) => value && !(language === 'en' && containsHanScript(value)))

  return clipText(values.slice(0, 3).join(' '), language === 'zh' ? 24 : 42)
}

function collectKeywords(value: string, limit = 6) {
  const tokens =
    value
      .toLowerCase()
      .match(/[\p{Script=Han}\p{Letter}\p{Number}][\p{Script=Han}\p{Letter}\p{Number}\-+]{1,}/gu) ?? []

  const stopwords = new Set([
    'the',
    'and',
    'for',
    'around',
    'with',
    'including',
    'from',
    'that',
    'this',
    'into',
    'using',
    'research',
    'study',
    'about',
    'on',
    'topic',
    'create',
    'build',
    'establish',
    'craft',
    'please',
    'sustained',
    'long',
    'horizon',
    'long-horizon',
    'long-term',
    'explicit',
    'evidence',
    'aware',
    'node',
    'structure',
    'focus',
    'follow',
    'track',
    'tracking',
    'prioritize',
    'distinguish',
    'mechanism',
    'judgment',
    'judgments',
    '问题',
    '研究',
    '方向',
    '相关',
  ])

  return Array.from(new Set(tokens.filter((token) => !stopwords.has(token)))).slice(0, limit)
}

function containsHanScript(value: string | null | undefined) {
  return /[\u4e00-\u9fff]/u.test(value ?? '')
}

function looksPromptScaffoldedTopicValue(value: string | null | undefined) {
  const normalized = sanitizeTopicText(value ?? '')
  if (!normalized) return true

  const lowered = normalized.toLowerCase()
  return (
    /^(?:build|create|establish|craft|follow|track)\b/iu.test(normalized) ||
    /\bresearch topic\b/iu.test(normalized) ||
    /\bresearch focus\b/iu.test(normalized) ||
    /\b(?:including|covering)\b/iu.test(normalized) ||
    /,\s*(?:in|incl|including)\.\.\.$/iu.test(normalized) ||
    lowered === 'autonomous-driving'
  )
}

function shouldPreferFallbackTopicValue(
  current: string | null | undefined,
  fallback: string | null | undefined,
  language: PromptLanguage,
) {
  const normalizedFallback = sanitizeTopicText(fallback ?? '')
  if (!normalizedFallback) return false

  const normalizedCurrent = sanitizeTopicText(current ?? '')
  if (!normalizedCurrent) return true
  if (looksTooGenericTopicSubject(normalizedCurrent)) return true
  if (looksPromptScaffoldedTopicValue(normalizedCurrent)) return true

  if (language === 'zh' && containsHanScript(normalizedFallback) && !containsHanScript(normalizedCurrent)) {
    return true
  }

  return false
}

function previewKeywordsNeedFallback(
  current: Array<{ zh: string; en: string }>,
  fallback: Array<{ zh: string; en: string }>,
  sourceLanguage: PromptLanguage,
) {
  if (fallback.length === 0) return false
  if (current.length === 0) return true

  if (sourceLanguage === 'zh') {
    const currentHasHan = current.some((keyword) => containsHanScript(keyword.zh))
    const fallbackHasHan = fallback.some((keyword) => containsHanScript(keyword.zh))
    if (fallbackHasHan && !currentHasHan) {
      return true
    }
  }

  const weakKeywordCount = current.filter((keyword) => {
    const candidate = sourceLanguage === 'zh' ? keyword.zh : keyword.en
    return shouldPreferFallbackTopicValue(candidate, candidate, sourceLanguage)
  }).length

  return weakKeywordCount >= Math.max(2, Math.ceil(current.length / 2))
}

function blueprintKeywordsNeedFallback(
  current: TopicKeyword[],
  fallback: TopicKeyword[],
  sourceLanguage: PromptLanguage,
) {
  if (fallback.length === 0) return false
  if (current.length === 0) return true

  if (sourceLanguage === 'zh') {
    const currentHasHan = current.some((keyword) => containsHanScript(keyword.localized.zh || keyword.zh))
    const fallbackHasHan = fallback.some((keyword) => containsHanScript(keyword.localized.zh || keyword.zh))
    if (fallbackHasHan && !currentHasHan) {
      return true
    }
  }

  const weakKeywordCount = current.filter((keyword) => {
    const candidate =
      sourceLanguage === 'zh'
        ? pickNonEmpty(keyword.localized.zh, keyword.zh)
        : pickNonEmpty(keyword.localized.en, keyword.en)
    return shouldPreferFallbackTopicValue(candidate, candidate, sourceLanguage)
  }).length

  return weakKeywordCount >= Math.max(2, Math.ceil(current.length / 2))
}

function resolvePromptLanguage(language: TopicLanguageMode): PromptLanguage {
  return language === 'bilingual' ? 'zh' : language
}

function resolveStoredLanguage(language: TopicLanguageMode, primaryLanguage: PromptLanguage) {
  return language === 'bilingual' ? primaryLanguage : language
}

function getLanguageRule(language: TopicLanguageMode) {
  switch (language) {
    case 'zh':
      return '以中文为主，但保留稳定的英文锚点，便于跨语言检索与展示。'
    case 'en':
      return '以英文为主，但必须同时给出中文与英文锚点，保证中文界面与检索链路可直接使用。'
    case 'ja':
      return '以日语表述为主，但必须同时给出中文和英文锚点，避免与主题主线脱节。'
    case 'ko':
      return '以韩语表述为主，但必须同时给出中文和英文锚点，避免与主题主线脱节。'
    case 'de':
      return '以德语表述为主，但必须同时给出中文和英文锚点，保证后续多语言展示稳定。'
    case 'fr':
      return '以法语表述为主，但必须同时给出中文和英文锚点，保证后续多语言展示稳定。'
    case 'es':
      return '以西班牙语表述为主，但必须同时给出中文和英文锚点，保证后续多语言展示稳定。'
    case 'ru':
      return '以俄语表述为主，但必须同时给出中文和英文锚点，保证后续多语言展示稳定。'
    default:
      return '必须同时保证中文与英文锚点完整，而且八种语言都要保持语义一致、命名正式。'
  }
}

function buildSystemPrompt(templateSystemPrompt: string, editorialPolicy: GenerationEditorialPolicy) {
  return [
    editorialPolicy.identity,
    'Global generation charter:',
    `Mission: ${editorialPolicy.mission}`,
    `Reasoning: ${editorialPolicy.reasoning}`,
    `Style: ${editorialPolicy.style}`,
    `Evidence: ${editorialPolicy.evidence}`,
    `Industry lens: ${editorialPolicy.industryLens}`,
    `Continuity: ${editorialPolicy.continuity}`,
    '',
    'Template-specific instruction:',
    templateSystemPrompt,
  ].join('\n')
}

function safeParseJsonBlock<T>(value: string) {
  try {
    return JSON.parse(value) as T
  } catch {
    const match = value.match(/\{[\s\S]*\}/u)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as T
    } catch {
      return null
    }
  }
}

function withOperationTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function normalizeOperationTimeoutMs(timeoutMs: number | null | undefined) {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return null
  }

  return timeoutMs
}

type TopicGenerationMode = 'native' | 'patches-only' | 'scaffold'

type TopicGenerationStrategy = {
  mode: TopicGenerationMode
  usesCompatibleGateway: boolean
}

function normalizeTopicGenerationMode(value: unknown): TopicGenerationMode | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  switch (normalized) {
    case 'native':
      return 'native'
    case 'patches-only':
    case 'patches_only':
    case 'patches':
      return 'patches-only'
    case 'scaffold':
    case 'scaffold-only':
    case 'deterministic':
      return 'scaffold'
    default:
      return null
  }
}

function resolveTopicGenerationStrategy(
  slotConfig: Pick<ResolvedProviderModelConfig, 'provider' | 'providerOptions'> | null | undefined,
): TopicGenerationStrategy {
  const usesCompatibleGateway = slotConfig?.provider === 'openai_compatible'
  const configuredMode = normalizeTopicGenerationMode(slotConfig?.providerOptions?.topicGenerationMode)

  return {
    mode: configuredMode ?? 'native',
    usesCompatibleGateway,
  }
}

function buildTopicGenerationPassProfile(
  slotConfig: Pick<ResolvedProviderModelConfig, 'provider' | 'providerOptions'> | null | undefined,
  requestedAttempts: number,
) {
  const strategy = resolveTopicGenerationStrategy(slotConfig)

  return {
    requestJson: true,
    attemptLimit: strategy.usesCompatibleGateway
      ? 1
      : Math.max(1, requestedAttempts),
  }
}

async function resolveTopicGenerationPassProfile(
  slot: 'language' | 'multimodal',
  requestedAttempts: number,
  userId?: string,
) {
  const config = await getResolvedUserModelConfig(userId)
  const slotConfig =
    slot === 'multimodal'
      ? config.multimodal ?? config.language
      : config.language ?? config.multimodal

  return buildTopicGenerationPassProfile(slotConfig, requestedAttempts)
}

async function getTopicGenerationStrategy(
  slot: 'language' | 'multimodal' = 'language',
  userId?: string,
) {
  const config = await getResolvedUserModelConfig(userId)
  const slotConfig =
    slot === 'multimodal'
      ? config.multimodal ?? config.language
      : config.language ?? config.multimodal

  return resolveTopicGenerationStrategy(slotConfig)
}

async function completePromptJson<T>(args: {
  templateId: (typeof PROMPT_TEMPLATE_IDS)[keyof typeof PROMPT_TEMPLATE_IDS]
  language: PromptLanguage
  variableContext?: Record<string, string | number | null | undefined>
  input: Record<string, unknown>
  outputContract: unknown
  attemptLimit: number
  maxTokens?: number
  timeoutMs?: number | null
  userId?: string
}): Promise<{ parsed: T | null; issue?: OmniIssue | null }> {
  const [runtime, template] = await Promise.all([
    getGenerationRuntimeConfig(),
    getPromptTemplate(args.templateId),
  ])
  const passProfile = await resolveTopicGenerationPassProfile(
    template.slot,
    args.attemptLimit,
    args.userId,
  )

  const templateContent = template.languageContents[args.language] ?? template.languageContents.zh
  const editorialPolicy = runtime.editorialPolicies[args.language] ?? runtime.editorialPolicies.zh
  const structuredPayload = JSON.stringify(
    {
      input: args.input,
      outputContract: args.outputContract,
    },
    null,
    passProfile.attemptLimit === 1 ? 0 : 2,
  )
  const request: OmniCompleteRequest = {
    task: 'topic_summary',
    preferredSlot: template.slot,
    role: inferResearchRoleForTemplate(args.templateId),
    userId: args.userId,
    json: passProfile.requestJson,
    temperature: runtime.languageTemperature,
    maxTokens: args.maxTokens ?? 2200,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt(templateContent.system, editorialPolicy),
      },
      {
        role: 'user',
        content: [
          renderPromptVariables(templateContent.user, args.variableContext ?? {}),
          'Structured input:',
          structuredPayload,
          'Return exactly one valid JSON object.',
          'Do not include markdown fences, commentary, or reasoning outside the JSON object.',
        ].join('\n\n'),
      },
    ],
  }

  let lastIssue: OmniIssue | null | undefined = null
  const timeoutMs = normalizeOperationTimeoutMs(args.timeoutMs)

  const hasAvailableModel = await omniGateway.hasAvailableModel(request)
  if (!hasAvailableModel) {
    return {
      parsed: null,
      issue: {
        code: 'missing_key',
        title: 'No available language model',
        message: 'Configure a language model in Prompt Studio before creating topics.',
        provider: 'backend',
        model: 'backend-fallback',
        slot: 'language',
      },
    }
  }

  for (let attempt = 0; attempt < passProfile.attemptLimit; attempt += 1) {
    let result
    try {
      result = timeoutMs
        ? await withOperationTimeout(
            omniGateway.complete(request),
            timeoutMs,
            `${args.templateId} generation`,
          )
        : await omniGateway.complete(request)
    } catch (error) {
      lastIssue = {
        code: 'provider_error',
        title: 'Topic generation timed out',
        message: error instanceof Error ? error.message : 'Topic generation timed out.',
        provider: 'backend',
        model: 'timeout-guard',
        slot: template.slot,
      }
      break
    }

    lastIssue = result.issue ?? null
    const parsed = safeParseJsonBlock<T>(result.text)
    if (parsed) {
      return { parsed, issue: lastIssue }
    }
  }

  return { parsed: null, issue: lastIssue }
}

function createTopicLocaleMap(factory: (language: PromptLanguage) => z.infer<typeof localizedTopicLocaleSchema>) {
  return Object.fromEntries(
    TOPIC_LANGUAGE_CODES.map((language) => [language, factory(language)]),
  ) as TopicLocaleMap
}

function createStageLocaleMap(factory: (language: PromptLanguage) => z.infer<typeof localizedStageLocaleSchema>) {
  return Object.fromEntries(
    TOPIC_LANGUAGE_CODES.map((language) => [language, factory(language)]),
  ) as StageLocaleMap
}

function buildPreviewOutputContract(primaryLanguage: PromptLanguage) {
  return previewPayloadSchema.parse({
    nameZh: '',
    nameEn: '',
    keywords: [],
    summary: '',
    summaryZh: '',
    summaryEn: '',
    recommendedStages: 4,
    focusLabel: '',
    focusLabelZh: '',
    focusLabelEn: '',
    primaryLanguage,
    locales: createTopicLocaleMap(() => ({
      name: '',
      summary: '',
      focusLabel: '',
      description: '',
    })),
  })
}

function buildLocalizationPatchOutputContract(
  blueprint: TopicBlueprint,
  language: PromptLanguage,
) {
  return localizationPatchSchema.parse({
    language,
    topic: {
      name: '',
      summary: '',
      focusLabel: '',
      description: '',
      keywords: blueprint.topic.keywords.map(() => ''),
    },
    stages: blueprint.stages.map((stage) => ({
      order: stage.order,
      name: '',
      description: '',
    })),
  })
}

function normalizeLocalizedDescriptions(
  value?: z.infer<typeof localizedInputDescriptionsSchema>,
): TopicInputDescriptions {
  return Object.fromEntries(
    Object.entries(value ?? {}).flatMap(([language, description]) => {
      const normalized = description?.trim()
      return normalized ? [[language, normalized]] : []
    }),
  ) as TopicInputDescriptions
}

function normalizeTopicGenerationInput(input: z.infer<typeof previewSchema>): TopicGenerationInput {
  const languageMode = input.language ?? 'zh'
  const sourceLanguage = input.sourceLanguage ?? resolvePromptLanguage(languageMode)
  const explicitDescriptions = normalizeLocalizedDescriptions(input.descriptionByLanguage)
  const anchorDescriptions = normalizeLocalizedDescriptions(input.anchorDescriptions)
  const sourceDescription = pickNonEmpty(
    input.sourceDescription,
    explicitDescriptions[sourceLanguage],
    input.description,
    sourceLanguage === 'en' ? input.descriptionEn : undefined,
    input.descriptionEn,
  )

  const descriptionByLanguage: TopicInputDescriptions = {
    ...anchorDescriptions,
    ...explicitDescriptions,
    [sourceLanguage]: sourceDescription,
  }

  if (input.descriptionEn?.trim() && sourceLanguage !== 'en' && !descriptionByLanguage.en) {
    descriptionByLanguage.en = input.descriptionEn.trim()
  }

  const normalizedAnchors = Object.fromEntries(
    Object.entries(descriptionByLanguage).flatMap(([language, description]) =>
      language === sourceLanguage || !description
        ? []
        : [[language, description]],
    ),
  ) as TopicInputDescriptions

  return {
    languageMode,
    sourceLanguage,
    sourceDescription,
    anchorDescriptions: normalizedAnchors,
    descriptionByLanguage,
    provider: input.provider,
  }
}

function pickInputDescription(input: TopicGenerationInput, language: PromptLanguage) {
  if (language === input.sourceLanguage) {
    return pickNonEmpty(
      input.descriptionByLanguage[language],
      input.sourceDescription,
      input.descriptionByLanguage.en,
      input.descriptionByLanguage.zh,
    )
  }

  if (language === 'en') {
    return pickNonEmpty(
      input.descriptionByLanguage.en,
      input.descriptionByLanguage[input.sourceLanguage],
      input.descriptionByLanguage.zh,
      input.sourceDescription,
    )
  }

  if (language === 'zh') {
    return pickNonEmpty(
      input.descriptionByLanguage.zh,
      input.descriptionByLanguage.en,
      input.descriptionByLanguage[input.sourceLanguage],
      input.sourceDescription,
    )
  }

  return pickNonEmpty(
    input.descriptionByLanguage[language],
    input.descriptionByLanguage.en,
    input.descriptionByLanguage.zh,
    input.descriptionByLanguage[input.sourceLanguage],
    input.sourceDescription,
  )
}

function buildLocalizedKeywords(baseKeywords: Array<{ zh: string; en: string }>) {
  return baseKeywords.map((keyword) => {
    const zh = pickNonEmpty(keyword.zh, keyword.en, '研究主题')
    const en = pickNonEmpty(keyword.en, titleCase(keyword.zh), 'Research Topic')
    return {
      zh,
      en,
      localized: {
        zh,
        en,
        ja: en,
        ko: en,
        de: en,
        fr: en,
        es: en,
        ru: en,
      },
    } satisfies TopicKeyword
  })
}

function createFallbackPreview(input: TopicGenerationInput): TopicPreview {
  const zhSource = pickInputDescription(input, 'zh')
  const enSource = pickInputDescription(input, 'en')
  const sourceSubject = extractTopicSubject(input.sourceDescription, input.sourceLanguage)
  const zhSubject = extractTopicSubject(zhSource, 'zh')
  const enSubject = extractTopicSubject(enSource, 'en')
  const keywords = buildFallbackKeywordPairs(input, {
    sourceSubject,
    zhSubject,
    enSubject,
  })
  const sourceSeed = clipText(pickNonEmpty(sourceSubject, input.sourceDescription), 42)
  const zhSeed = clipText(
    pickNonEmpty(zhSubject, buildFallbackTopicName(keywords, 'zh'), sourceSubject, sourceSeed),
    18,
  )
  const englishSubject = containsHanScript(enSubject) ? '' : enSubject
  const enSeed = titleCase(
    clipText(
      pickNonEmpty(englishSubject, buildFallbackTopicName(keywords, 'en'), sourceSeed),
      42,
    ),
  )
  const stageCount = Math.min(5, Math.max(3, keywords.length >= 4 ? 5 : 4))
  const nameZh = pickNonEmpty(zhSeed, clipText(sourceSeed, 24), '新研究主题')
  const nameEn = pickNonEmpty(enSeed, buildFallbackTopicName(keywords, 'en'), 'New Research Topic')
  const summaryZh = clipText(zhSource, 120)
  const summaryEn = clipText(enSource, 120)
  const focusLabelZh = pickNonEmpty(clipText(zhSubject, 18), keywords[0]?.zh, nameZh, '研究焦点')
  const focusLabelEn = pickNonEmpty(
    titleCase(clipText(englishSubject, 42)),
    buildFallbackTopicName(keywords, 'en'),
    nameEn,
    'Research Focus',
  )
  const locales = createTopicLocaleMap((language) => {
    const localizedInput = input.descriptionByLanguage[language]
    const localizedSubject = localizedInput ? extractTopicSubject(localizedInput, language) : ''
    const localizedSummary = clipText(localizedInput ?? pickInputDescription(input, language), 120)
    return {
      name:
        language === 'zh'
          ? nameZh
          : language === 'en'
            ? nameEn
            : pickNonEmpty(clipText(localizedSubject, 42), nameEn),
      summary:
        language === 'zh'
          ? summaryZh
          : language === 'en'
            ? summaryEn
            : pickNonEmpty(localizedSummary, summaryEn),
      focusLabel:
        language === 'zh'
          ? focusLabelZh
          : language === 'en'
            ? focusLabelEn
            : pickNonEmpty(
                clipText(localizedSubject, 24),
                collectKeywords(localizedInput ?? '', 1)[0],
                focusLabelEn,
              ),
      description: clipText(localizedInput ?? pickInputDescription(input, language), 160),
    }
  })

  return previewPayloadSchema.parse({
    nameZh,
    nameEn,
    keywords,
    summary: `${summaryEn} | ${summaryZh}`,
    summaryZh,
    summaryEn,
    recommendedStages: stageCount,
    focusLabel: `${focusLabelEn} | ${focusLabelZh}`,
    focusLabelZh,
    focusLabelEn,
    primaryLanguage: input.sourceLanguage,
    locales,
  })
}

function repairPreviewWithFallback(
  preview: TopicPreview,
  fallback: TopicPreview,
  sourceLanguage: PromptLanguage,
): TopicPreview {
  const fallbackLocales =
    fallback.locales ??
    createTopicLocaleMap(() => ({
      name: '',
      summary: '',
      focusLabel: '',
      description: '',
    }))
  const locales = createTopicLocaleMap((language) => {
    const currentLocale = preview.locales?.[language] ?? fallbackLocales[language]
    const fallbackLocale = fallbackLocales[language]
    return {
      name: shouldPreferFallbackTopicValue(currentLocale?.name, fallbackLocale.name, language)
        ? fallbackLocale.name
        : pickNonEmpty(currentLocale?.name, fallbackLocale.name),
      summary: shouldPreferFallbackTopicValue(currentLocale?.summary, fallbackLocale.summary, language)
        ? fallbackLocale.summary
        : pickNonEmpty(currentLocale?.summary, fallbackLocale.summary),
      focusLabel: shouldPreferFallbackTopicValue(currentLocale?.focusLabel, fallbackLocale.focusLabel, language)
        ? fallbackLocale.focusLabel
        : pickNonEmpty(currentLocale?.focusLabel, fallbackLocale.focusLabel),
      description: shouldPreferFallbackTopicValue(currentLocale?.description, fallbackLocale.description, language)
        ? fallbackLocale.description
        : pickNonEmpty(currentLocale?.description, fallbackLocale.description),
    }
  })

  const nameZh = shouldPreferFallbackTopicValue(preview.nameZh, fallback.nameZh, 'zh')
    ? fallback.nameZh
    : pickNonEmpty(preview.nameZh, locales.zh.name, fallback.nameZh)
  const nameEn = shouldPreferFallbackTopicValue(preview.nameEn, fallback.nameEn, 'en')
    ? fallback.nameEn
    : pickNonEmpty(preview.nameEn, locales.en.name, fallback.nameEn)
  const summaryZh = shouldPreferFallbackTopicValue(preview.summaryZh, fallback.summaryZh, 'zh')
    ? fallback.summaryZh
    : pickNonEmpty(preview.summaryZh, locales.zh.summary, fallback.summaryZh)
  const summaryEn = shouldPreferFallbackTopicValue(preview.summaryEn, fallback.summaryEn, 'en')
    ? fallback.summaryEn
    : pickNonEmpty(preview.summaryEn, locales.en.summary, fallback.summaryEn)
  const focusLabelZh = shouldPreferFallbackTopicValue(preview.focusLabelZh, fallback.focusLabelZh, 'zh')
    ? fallback.focusLabelZh
    : pickNonEmpty(preview.focusLabelZh, locales.zh.focusLabel, fallback.focusLabelZh)
  const focusLabelEn = shouldPreferFallbackTopicValue(preview.focusLabelEn, fallback.focusLabelEn, 'en')
    ? fallback.focusLabelEn
    : pickNonEmpty(preview.focusLabelEn, locales.en.focusLabel, fallback.focusLabelEn)

  return previewPayloadSchema.parse({
    ...preview,
    nameZh,
    nameEn,
    summaryZh,
    summaryEn,
    summary: `${summaryEn} | ${summaryZh}`,
    focusLabelZh,
    focusLabelEn,
    focusLabel: `${focusLabelEn} | ${focusLabelZh}`,
    keywords: previewKeywordsNeedFallback(preview.keywords, fallback.keywords, sourceLanguage)
      ? fallback.keywords
      : preview.keywords,
    locales,
  })
}

function mergeTopicLocales(base: TopicLocaleMap, next?: Partial<TopicLocaleMap>) {
  return createTopicLocaleMap((language) => {
    const fallback = base[language]
    const incoming = next?.[language]
    return {
      name: pickNonEmpty(incoming?.name, fallback.name),
      summary: pickNonEmpty(incoming?.summary, fallback.summary),
      focusLabel: pickNonEmpty(incoming?.focusLabel, fallback.focusLabel),
      description: pickNonEmpty(incoming?.description, fallback.description),
    }
  })
}

function mergeStageLocales(base: StageLocaleMap, next?: Partial<StageLocaleMap>) {
  return createStageLocaleMap((language) => {
    const fallback = base[language]
    const incoming = next?.[language]
    return {
      name: pickNonEmpty(incoming?.name, fallback.name),
      description: pickNonEmpty(incoming?.description, fallback.description),
    }
  })
}

function buildFallbackBlueprint(
  input: TopicGenerationInput,
  preview: TopicPreview,
): TopicBlueprint {
  const primaryLanguage = input.sourceLanguage
  const recommendedStages = clamp(preview.recommendedStages, 3, 5)
  const focusZh = pickNonEmpty(preview.focusLabelZh, preview.focusLabel, '研究焦点')
  const focusEn = pickNonEmpty(preview.focusLabelEn, preview.focusLabel, 'Research Focus')
  const topicLocales = createTopicLocaleMap((language) => ({
    name: pickNonEmpty(
      preview.locales?.[language]?.name,
      language === 'zh' ? preview.nameZh : language === 'en' ? preview.nameEn : '',
      clipText(pickInputDescription(input, language).replace(/[.。!?！？].*$/u, ''), 42),
      language === 'zh' ? focusZh : focusEn,
    ),
    summary: pickNonEmpty(
      preview.locales?.[language]?.summary,
      language === 'zh' ? preview.summaryZh : language === 'en' ? preview.summaryEn : '',
      preview.summary,
      pickInputDescription(input, language),
    ),
    focusLabel: pickNonEmpty(
      preview.locales?.[language]?.focusLabel,
      language === 'zh' ? preview.focusLabelZh : language === 'en' ? preview.focusLabelEn : '',
      language === 'zh' ? focusZh : focusEn,
    ),
    description: clipText(pickInputDescription(input, language), 180),
  }))

  return blueprintSchema.parse({
    topic: {
      primaryLanguage,
      recommendedStages,
      nameZh: pickNonEmpty(preview.nameZh, topicLocales.zh.name, focusZh),
      nameEn: pickNonEmpty(preview.nameEn, topicLocales.en.name, focusEn),
      summary: pickNonEmpty(preview.summary, `${preview.summaryEn} | ${preview.summaryZh}`),
      summaryZh: pickNonEmpty(preview.summaryZh, topicLocales.zh.summary, pickInputDescription(input, 'zh')),
      summaryEn: pickNonEmpty(preview.summaryEn, topicLocales.en.summary, pickInputDescription(input, 'en')),
      focusLabel: pickNonEmpty(preview.focusLabel, `${focusEn} | ${focusZh}`),
      focusLabelZh: pickNonEmpty(preview.focusLabelZh, topicLocales.zh.focusLabel, focusZh),
      focusLabelEn: pickNonEmpty(preview.focusLabelEn, topicLocales.en.focusLabel, focusEn),
      keywords: buildLocalizedKeywords(preview.keywords),
      locales: topicLocales,
    },
    stages: Array.from({ length: recommendedStages }, (_, index) => {
      const order = index + 1
      const stageLocales = createStageLocaleMap((language) => ({
        name: STAGE_LABEL_LIBRARY[language][index] || `${STAGE_LABEL_LIBRARY[language][0]} ${order}`,
        description: buildFallbackStageDescription(
          language,
          pickNonEmpty(
            topicLocales[language].focusLabel,
            language === 'zh' ? focusZh : '',
            language === 'en' ? focusEn : '',
            topicLocales.en.focusLabel,
            focusEn,
          ),
          order,
        ),
      }))

      return {
        order,
        name: stageLocales.zh.name,
        nameEn: stageLocales.en.name,
        description: stageLocales.zh.description,
        descriptionEn: stageLocales.en.description,
        locales: stageLocales,
      }
    }),
  })
}

function createSeedKeyword(
  sourceLanguage: PromptLanguage,
  sourceValue: string,
  englishValue: string,
): TopicKeyword {
  const zh = sourceLanguage === 'zh' ? sourceValue : titleCase(sourceValue || englishValue)
  const en = pickNonEmpty(englishValue, titleCase(sourceValue), 'Research Topic')

  return {
    zh,
    en,
    localized: {
      zh,
      en,
      ja: en,
      ko: en,
      de: en,
      fr: en,
      es: en,
      ru: en,
      [sourceLanguage]: pickNonEmpty(sourceValue, sourceLanguage === 'zh' ? zh : en),
    },
  }
}

function _buildBlueprintCoreFallback(
  blueprint: TopicBlueprint,
  sourceLanguage: PromptLanguage,
): TopicBlueprintCore {
  const sourceTopicLocale = blueprint.topic.locales[sourceLanguage]

  return blueprintCoreSchema.parse({
    topic: {
      primaryLanguage: blueprint.topic.primaryLanguage,
      recommendedStages: blueprint.topic.recommendedStages,
      name: pickNonEmpty(
        sourceTopicLocale.name,
        sourceLanguage === 'zh' ? blueprint.topic.nameZh : '',
        sourceLanguage === 'en' ? blueprint.topic.nameEn : '',
      ),
      nameEn: pickNonEmpty(blueprint.topic.nameEn, blueprint.topic.locales.en.name),
      summary: pickNonEmpty(
        sourceTopicLocale.summary,
        sourceLanguage === 'zh' ? blueprint.topic.summaryZh : '',
        sourceLanguage === 'en' ? blueprint.topic.summaryEn : '',
        blueprint.topic.summary,
      ),
      summaryEn: pickNonEmpty(blueprint.topic.summaryEn, blueprint.topic.locales.en.summary),
      focusLabel: pickNonEmpty(
        sourceTopicLocale.focusLabel,
        sourceLanguage === 'zh' ? blueprint.topic.focusLabelZh : '',
        sourceLanguage === 'en' ? blueprint.topic.focusLabelEn : '',
        blueprint.topic.focusLabel,
      ),
      focusLabelEn: pickNonEmpty(blueprint.topic.focusLabelEn, blueprint.topic.locales.en.focusLabel),
      keywords: blueprint.topic.keywords.map((keyword) => ({
        source: pickNonEmpty(
          keyword.localized[sourceLanguage],
          sourceLanguage === 'zh' ? keyword.zh : '',
          sourceLanguage === 'en' ? keyword.en : '',
        ),
        en: pickNonEmpty(keyword.en, keyword.localized.en),
      })),
    },
    stages: blueprint.stages.map((stage) => ({
      order: stage.order,
      name: pickNonEmpty(
        stage.locales[sourceLanguage].name,
        sourceLanguage === 'zh' ? stage.name : '',
        sourceLanguage === 'en' ? stage.nameEn : '',
      ),
      nameEn: pickNonEmpty(stage.nameEn, stage.locales.en.name),
      description: pickNonEmpty(
        stage.locales[sourceLanguage].description,
        sourceLanguage === 'zh' ? stage.description : '',
        sourceLanguage === 'en' ? stage.descriptionEn : '',
      ),
      descriptionEn: pickNonEmpty(stage.descriptionEn, stage.locales.en.description),
    })),
  })
}

function _mergeBlueprintCore(
  fallback: TopicBlueprint,
  raw: unknown,
  sourceLanguage: PromptLanguage,
): TopicBlueprint {
  const parsedResult = blueprintCoreSchema.safeParse(raw)
  if (!parsedResult.success) return fallback

  const parsed = parsedResult.data
  const recommendedStages = clamp(
    parsed.topic.recommendedStages || parsed.stages.length || fallback.topic.recommendedStages,
    3,
    5,
  )

  const sourceTopicLocale = {
    ...fallback.topic.locales[sourceLanguage],
    name: pickNonEmpty(parsed.topic.name, fallback.topic.locales[sourceLanguage].name),
    summary: pickNonEmpty(parsed.topic.summary, fallback.topic.locales[sourceLanguage].summary),
    focusLabel: pickNonEmpty(parsed.topic.focusLabel, fallback.topic.locales[sourceLanguage].focusLabel),
    description: pickNonEmpty(parsed.topic.summary, fallback.topic.locales[sourceLanguage].description),
  }
  const englishTopicLocale = {
    ...fallback.topic.locales.en,
    name: pickNonEmpty(parsed.topic.nameEn, fallback.topic.locales.en.name),
    summary: pickNonEmpty(parsed.topic.summaryEn, fallback.topic.locales.en.summary),
    focusLabel: pickNonEmpty(parsed.topic.focusLabelEn, fallback.topic.locales.en.focusLabel),
    description: pickNonEmpty(parsed.topic.summaryEn, fallback.topic.locales.en.description),
  }
  const topicLocales = mergeTopicLocales(fallback.topic.locales, {
    [sourceLanguage]: sourceTopicLocale,
    en: englishTopicLocale,
  })

  const topicKeywords =
    parsed.topic.keywords.length > 0
      ? parsed.topic.keywords.map((keyword, index) => {
          const sourceValue = pickNonEmpty(keyword.source, keyword.en)
          const englishValue = pickNonEmpty(keyword.en, titleCase(sourceValue))
          const fallbackKeyword =
            fallback.topic.keywords[index] ??
            createSeedKeyword(sourceLanguage, sourceValue, englishValue)

          return {
            zh:
              sourceLanguage === 'zh'
                ? pickNonEmpty(sourceValue, fallbackKeyword.zh)
                : fallbackKeyword.zh,
            en: pickNonEmpty(englishValue, fallbackKeyword.en),
            localized: {
              ...fallbackKeyword.localized,
              en: pickNonEmpty(englishValue, fallbackKeyword.localized.en, fallbackKeyword.en),
              [sourceLanguage]: pickNonEmpty(
                sourceValue,
                fallbackKeyword.localized[sourceLanguage],
                sourceLanguage === 'zh' ? fallbackKeyword.zh : fallbackKeyword.en,
              ),
              ...(sourceLanguage === 'zh'
                ? { zh: pickNonEmpty(sourceValue, fallbackKeyword.localized.zh, fallbackKeyword.zh) }
                : {}),
            },
          } satisfies TopicKeyword
        })
      : fallback.topic.keywords

  return blueprintSchema.parse({
    topic: {
      primaryLanguage: parsed.topic.primaryLanguage ?? fallback.topic.primaryLanguage,
      recommendedStages,
      nameZh:
        sourceLanguage === 'zh'
          ? pickNonEmpty(parsed.topic.name, topicLocales.zh.name, fallback.topic.nameZh)
          : pickNonEmpty(topicLocales.zh.name, fallback.topic.nameZh),
      nameEn: pickNonEmpty(
        parsed.topic.nameEn,
        sourceLanguage === 'en' ? parsed.topic.name : '',
        topicLocales.en.name,
        fallback.topic.nameEn,
      ),
      summary: pickNonEmpty(
        parsed.topic.summary,
        `${parsed.topic.summaryEn} | ${parsed.topic.summary}`,
        fallback.topic.summary,
      ),
      summaryZh:
        sourceLanguage === 'zh'
          ? pickNonEmpty(parsed.topic.summary, topicLocales.zh.summary, fallback.topic.summaryZh)
          : pickNonEmpty(topicLocales.zh.summary, fallback.topic.summaryZh),
      summaryEn: pickNonEmpty(
        parsed.topic.summaryEn,
        sourceLanguage === 'en' ? parsed.topic.summary : '',
        topicLocales.en.summary,
        fallback.topic.summaryEn,
      ),
      focusLabel: pickNonEmpty(
        parsed.topic.focusLabel,
        parsed.topic.focusLabelEn,
        fallback.topic.focusLabel,
      ),
      focusLabelZh:
        sourceLanguage === 'zh'
          ? pickNonEmpty(parsed.topic.focusLabel, topicLocales.zh.focusLabel, fallback.topic.focusLabelZh)
          : pickNonEmpty(topicLocales.zh.focusLabel, fallback.topic.focusLabelZh),
      focusLabelEn: pickNonEmpty(
        parsed.topic.focusLabelEn,
        sourceLanguage === 'en' ? parsed.topic.focusLabel : '',
        topicLocales.en.focusLabel,
        fallback.topic.focusLabelEn,
      ),
      keywords: topicKeywords,
      locales: topicLocales,
    },
    stages: Array.from({ length: recommendedStages }, (_, index) => {
      const order = index + 1
      const fallbackStage = fallback.stages[index]
      const parsedStage =
        parsed.stages.find((stage) => stage.order === order) ??
        parsed.stages[index] ??
        fallbackStage
      const locales = mergeStageLocales(fallbackStage.locales, {
        [sourceLanguage]: {
          name: pickNonEmpty(parsedStage?.name, fallbackStage.locales[sourceLanguage].name),
          description: pickNonEmpty(
            parsedStage?.description,
            fallbackStage.locales[sourceLanguage].description,
          ),
        },
        en: {
          name: pickNonEmpty(parsedStage?.nameEn, fallbackStage.locales.en.name),
          description: pickNonEmpty(
            parsedStage?.descriptionEn,
            fallbackStage.locales.en.description,
          ),
        },
      })

      return {
        order,
        name:
          sourceLanguage === 'zh'
            ? pickNonEmpty(parsedStage?.name, locales.zh.name, fallbackStage.name)
            : pickNonEmpty(locales.zh.name, fallbackStage.name),
        nameEn: pickNonEmpty(
          parsedStage?.nameEn,
          sourceLanguage === 'en' ? parsedStage?.name : '',
          locales.en.name,
          fallbackStage.nameEn,
        ),
        description:
          sourceLanguage === 'zh'
            ? pickNonEmpty(parsedStage?.description, locales.zh.description, fallbackStage.description)
            : pickNonEmpty(locales.zh.description, fallbackStage.description),
        descriptionEn: pickNonEmpty(
          parsedStage?.descriptionEn,
          sourceLanguage === 'en' ? parsedStage?.description : '',
          locales.en.description,
          fallbackStage.descriptionEn,
        ),
        locales,
      }
    }),
  })
}

function buildLocalizationPatchFallback(
  blueprint: TopicBlueprint,
  language: PromptLanguage,
): TopicLocalizationPatch {
  return localizationPatchSchema.parse({
    language,
    topic: {
      name: blueprint.topic.locales[language].name,
      summary: blueprint.topic.locales[language].summary,
      focusLabel: blueprint.topic.locales[language].focusLabel,
      description: blueprint.topic.locales[language].description,
      keywords: blueprint.topic.keywords.map((keyword) =>
        pickNonEmpty(
          keyword.localized[language],
          language === 'zh' ? keyword.zh : '',
          language === 'en' ? keyword.en : '',
          keyword.en,
        ),
      ),
    },
    stages: blueprint.stages.map((stage) => ({
      order: stage.order,
      name: stage.locales[language].name,
      description: stage.locales[language].description,
    })),
  })
}

function applyLocalizationPatch(
  blueprint: TopicBlueprint,
  raw: unknown,
): TopicBlueprint {
  const parsedResult = localizationPatchSchema.safeParse(raw)
  if (!parsedResult.success) return blueprint

  const parsed = parsedResult.data
  const language = parsed.language
  const topicLocales = mergeTopicLocales(blueprint.topic.locales, {
    [language]: {
      name: pickNonEmpty(parsed.topic.name, blueprint.topic.locales[language].name),
      summary: pickNonEmpty(parsed.topic.summary, blueprint.topic.locales[language].summary),
      focusLabel: pickNonEmpty(parsed.topic.focusLabel, blueprint.topic.locales[language].focusLabel),
      description: pickNonEmpty(parsed.topic.description, blueprint.topic.locales[language].description),
    },
  })

  const keywords = blueprint.topic.keywords.map((keyword, index) => {
    const localizedValue = pickNonEmpty(
      parsed.topic.keywords[index],
      keyword.localized[language],
      language === 'zh' ? keyword.zh : '',
      language === 'en' ? keyword.en : '',
      keyword.en,
    )

    return {
      zh: language === 'zh' ? pickNonEmpty(localizedValue, keyword.zh) : keyword.zh,
      en: language === 'en' ? pickNonEmpty(localizedValue, keyword.en) : keyword.en,
      localized: {
        ...keyword.localized,
        [language]: localizedValue,
      },
    } satisfies TopicKeyword
  })

  return blueprintSchema.parse({
    topic: {
      ...blueprint.topic,
      nameZh:
        language === 'zh'
          ? pickNonEmpty(parsed.topic.name, topicLocales.zh.name, blueprint.topic.nameZh)
          : blueprint.topic.nameZh,
      nameEn:
        language === 'en'
          ? pickNonEmpty(parsed.topic.name, topicLocales.en.name, blueprint.topic.nameEn)
          : blueprint.topic.nameEn,
      summaryZh:
        language === 'zh'
          ? pickNonEmpty(parsed.topic.summary, topicLocales.zh.summary, blueprint.topic.summaryZh)
          : blueprint.topic.summaryZh,
      summaryEn:
        language === 'en'
          ? pickNonEmpty(parsed.topic.summary, topicLocales.en.summary, blueprint.topic.summaryEn)
          : blueprint.topic.summaryEn,
      focusLabelZh:
        language === 'zh'
          ? pickNonEmpty(parsed.topic.focusLabel, topicLocales.zh.focusLabel, blueprint.topic.focusLabelZh)
          : blueprint.topic.focusLabelZh,
      focusLabelEn:
        language === 'en'
          ? pickNonEmpty(parsed.topic.focusLabel, topicLocales.en.focusLabel, blueprint.topic.focusLabelEn)
          : blueprint.topic.focusLabelEn,
      keywords,
      locales: topicLocales,
    },
    stages: blueprint.stages.map((stage) => {
      const parsedStage = parsed.stages.find((candidate) => candidate.order === stage.order)
      const locales = mergeStageLocales(stage.locales, parsedStage
        ? {
            [language]: {
              name: pickNonEmpty(parsedStage.name, stage.locales[language].name),
              description: pickNonEmpty(
                parsedStage.description,
                stage.locales[language].description,
              ),
            },
          }
        : undefined)

      return {
        ...stage,
        name:
          language === 'zh'
            ? pickNonEmpty(parsedStage?.name, locales.zh.name, stage.name)
            : stage.name,
        nameEn:
          language === 'en'
            ? pickNonEmpty(parsedStage?.name, locales.en.name, stage.nameEn)
            : stage.nameEn,
        description:
          language === 'zh'
            ? pickNonEmpty(parsedStage?.description, locales.zh.description, stage.description)
            : stage.description,
        descriptionEn:
          language === 'en'
            ? pickNonEmpty(parsedStage?.description, locales.en.description, stage.descriptionEn)
            : stage.descriptionEn,
        locales,
      }
    }),
  })
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1
      if (currentIndex >= items.length) return
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function mergeBlueprint(
  fallback: TopicBlueprint,
  raw: unknown,
): TopicBlueprint {
  const parsedResult = blueprintSchema.safeParse(raw)
  if (!parsedResult.success) return fallback

  const parsed = parsedResult.data
  const recommendedStages = clamp(
    parsed.topic.recommendedStages || parsed.stages.length || fallback.topic.recommendedStages,
    3,
    5,
  )

  const topicLocales = mergeTopicLocales(fallback.topic.locales, parsed.topic.locales)
  const topicKeywords =
    parsed.topic.keywords.length > 0
      ? parsed.topic.keywords.map((keyword, index) => {
          const fallbackKeyword = fallback.topic.keywords[index] ?? fallback.topic.keywords[0]
          const zh = pickNonEmpty(keyword.zh, keyword.localized.zh, fallbackKeyword?.zh, '研究主题')
          const en = pickNonEmpty(keyword.en, keyword.localized.en, fallbackKeyword?.en, titleCase(zh))
          return {
            zh,
            en,
            localized: {
              zh,
              en,
              ja: pickNonEmpty(keyword.localized.ja, fallbackKeyword?.localized.ja, en),
              ko: pickNonEmpty(keyword.localized.ko, fallbackKeyword?.localized.ko, en),
              de: pickNonEmpty(keyword.localized.de, fallbackKeyword?.localized.de, en),
              fr: pickNonEmpty(keyword.localized.fr, fallbackKeyword?.localized.fr, en),
              es: pickNonEmpty(keyword.localized.es, fallbackKeyword?.localized.es, en),
              ru: pickNonEmpty(keyword.localized.ru, fallbackKeyword?.localized.ru, en),
            },
          } satisfies TopicKeyword
        })
      : fallback.topic.keywords

  return blueprintSchema.parse({
    topic: {
      primaryLanguage: parsed.topic.primaryLanguage ?? fallback.topic.primaryLanguage,
      recommendedStages,
      nameZh: pickNonEmpty(parsed.topic.nameZh, topicLocales.zh.name, fallback.topic.nameZh),
      nameEn: pickNonEmpty(parsed.topic.nameEn, topicLocales.en.name, fallback.topic.nameEn),
      summary: pickNonEmpty(parsed.topic.summary, `${parsed.topic.summaryEn} | ${parsed.topic.summaryZh}`, fallback.topic.summary),
      summaryZh: pickNonEmpty(parsed.topic.summaryZh, topicLocales.zh.summary, fallback.topic.summaryZh),
      summaryEn: pickNonEmpty(parsed.topic.summaryEn, topicLocales.en.summary, fallback.topic.summaryEn),
      focusLabel: pickNonEmpty(parsed.topic.focusLabel, `${parsed.topic.focusLabelEn} | ${parsed.topic.focusLabelZh}`, fallback.topic.focusLabel),
      focusLabelZh: pickNonEmpty(parsed.topic.focusLabelZh, topicLocales.zh.focusLabel, fallback.topic.focusLabelZh),
      focusLabelEn: pickNonEmpty(parsed.topic.focusLabelEn, topicLocales.en.focusLabel, fallback.topic.focusLabelEn),
      keywords: topicKeywords,
      locales: topicLocales,
    },
    stages: Array.from({ length: recommendedStages }, (_, index) => {
      const order = index + 1
      const fallbackStage = fallback.stages[index]
      const parsedStage =
        parsed.stages.find((stage) => stage.order === order) ??
        parsed.stages[index] ??
        fallbackStage
      const locales = mergeStageLocales(fallbackStage.locales, parsedStage?.locales)

      return {
        order,
        name: pickNonEmpty(parsedStage?.name, locales.zh.name, fallbackStage.name),
        nameEn: pickNonEmpty(parsedStage?.nameEn, locales.en.name, fallbackStage.nameEn),
        description: pickNonEmpty(parsedStage?.description, locales.zh.description, fallbackStage.description),
        descriptionEn: pickNonEmpty(parsedStage?.descriptionEn, locales.en.description, fallbackStage.descriptionEn),
        locales,
      }
    }),
  })
}

function repairBlueprintWithFallback(
  blueprint: TopicBlueprint,
  fallback: TopicBlueprint,
  sourceLanguage: PromptLanguage,
): TopicBlueprint {
  const topicLocales = createTopicLocaleMap((language) => {
    const currentLocale = blueprint.topic.locales[language]
    const fallbackLocale = fallback.topic.locales[language]
    return {
      name: shouldPreferFallbackTopicValue(currentLocale?.name, fallbackLocale.name, language)
        ? fallbackLocale.name
        : pickNonEmpty(currentLocale?.name, fallbackLocale.name),
      summary: shouldPreferFallbackTopicValue(currentLocale?.summary, fallbackLocale.summary, language)
        ? fallbackLocale.summary
        : pickNonEmpty(currentLocale?.summary, fallbackLocale.summary),
      focusLabel: shouldPreferFallbackTopicValue(currentLocale?.focusLabel, fallbackLocale.focusLabel, language)
        ? fallbackLocale.focusLabel
        : pickNonEmpty(currentLocale?.focusLabel, fallbackLocale.focusLabel),
      description: shouldPreferFallbackTopicValue(currentLocale?.description, fallbackLocale.description, language)
        ? fallbackLocale.description
        : pickNonEmpty(currentLocale?.description, fallbackLocale.description),
    }
  })

  const nameZh = shouldPreferFallbackTopicValue(blueprint.topic.nameZh, fallback.topic.nameZh, 'zh')
    ? fallback.topic.nameZh
    : pickNonEmpty(blueprint.topic.nameZh, topicLocales.zh.name, fallback.topic.nameZh)
  const nameEn = shouldPreferFallbackTopicValue(blueprint.topic.nameEn, fallback.topic.nameEn, 'en')
    ? fallback.topic.nameEn
    : pickNonEmpty(blueprint.topic.nameEn, topicLocales.en.name, fallback.topic.nameEn)
  const summaryZh = shouldPreferFallbackTopicValue(blueprint.topic.summaryZh, fallback.topic.summaryZh, 'zh')
    ? fallback.topic.summaryZh
    : pickNonEmpty(blueprint.topic.summaryZh, topicLocales.zh.summary, fallback.topic.summaryZh)
  const summaryEn = shouldPreferFallbackTopicValue(blueprint.topic.summaryEn, fallback.topic.summaryEn, 'en')
    ? fallback.topic.summaryEn
    : pickNonEmpty(blueprint.topic.summaryEn, topicLocales.en.summary, fallback.topic.summaryEn)
  const focusLabelZh = shouldPreferFallbackTopicValue(
    blueprint.topic.focusLabelZh,
    fallback.topic.focusLabelZh,
    'zh',
  )
    ? fallback.topic.focusLabelZh
    : pickNonEmpty(blueprint.topic.focusLabelZh, topicLocales.zh.focusLabel, fallback.topic.focusLabelZh)
  const focusLabelEn = shouldPreferFallbackTopicValue(
    blueprint.topic.focusLabelEn,
    fallback.topic.focusLabelEn,
    'en',
  )
    ? fallback.topic.focusLabelEn
    : pickNonEmpty(blueprint.topic.focusLabelEn, topicLocales.en.focusLabel, fallback.topic.focusLabelEn)

  return blueprintSchema.parse({
    ...blueprint,
    topic: {
      ...blueprint.topic,
      nameZh,
      nameEn,
      summaryZh,
      summaryEn,
      summary: `${summaryEn} | ${summaryZh}`,
      focusLabelZh,
      focusLabelEn,
      focusLabel: `${focusLabelEn} | ${focusLabelZh}`,
      keywords: blueprintKeywordsNeedFallback(blueprint.topic.keywords, fallback.topic.keywords, sourceLanguage)
        ? fallback.topic.keywords
        : blueprint.topic.keywords,
      locales: topicLocales,
    },
  })
}

function previewFromBlueprint(blueprint: TopicBlueprint): TopicPreview {
  return previewPayloadSchema.parse({
    nameZh: pickNonEmpty(blueprint.topic.nameZh, blueprint.topic.locales.zh.name),
    nameEn: pickNonEmpty(blueprint.topic.nameEn, blueprint.topic.locales.en.name),
    keywords: blueprint.topic.keywords.map((keyword) => ({
      zh: pickNonEmpty(keyword.zh, keyword.localized.zh),
      en: pickNonEmpty(keyword.en, keyword.localized.en),
    })),
    summary: pickNonEmpty(blueprint.topic.summary, `${blueprint.topic.summaryEn} | ${blueprint.topic.summaryZh}`),
    summaryZh: pickNonEmpty(blueprint.topic.summaryZh, blueprint.topic.locales.zh.summary),
    summaryEn: pickNonEmpty(blueprint.topic.summaryEn, blueprint.topic.locales.en.summary),
    recommendedStages: blueprint.topic.recommendedStages,
    focusLabel: pickNonEmpty(blueprint.topic.focusLabel, `${blueprint.topic.focusLabelEn} | ${blueprint.topic.focusLabelZh}`),
    focusLabelZh: pickNonEmpty(blueprint.topic.focusLabelZh, blueprint.topic.locales.zh.focusLabel),
    focusLabelEn: pickNonEmpty(blueprint.topic.focusLabelEn, blueprint.topic.locales.en.focusLabel),
    primaryLanguage: blueprint.topic.primaryLanguage,
    locales: blueprint.topic.locales,
  })
}

function normalizePreviewLocaleValue(value: string | null | undefined) {
  return sanitizeTopicText(value ?? '').toLowerCase()
}

function previewLocaleLooksReused(
  preview: TopicPreview,
  language: PromptLanguage,
  sourceLanguage: PromptLanguage,
) {
  const locales = preview.locales
  if (!locales) return true

  const locale = locales[language]
  if (!locale) return true

  const sourceLocale = locales[sourceLanguage]
  const englishLocale = locales.en

  const name = normalizePreviewLocaleValue(locale.name)
  const summary = normalizePreviewLocaleValue(locale.summary)
  const focusLabel = normalizePreviewLocaleValue(locale.focusLabel)
  const description = normalizePreviewLocaleValue(locale.description)

  if (!name || !summary || !focusLabel || !description) {
    return true
  }

  const sameAsEnglish =
    name === normalizePreviewLocaleValue(englishLocale.name) &&
    summary === normalizePreviewLocaleValue(englishLocale.summary)
  const sameAsSource =
    summary === normalizePreviewLocaleValue(sourceLocale.summary) &&
    description === normalizePreviewLocaleValue(sourceLocale.description)
  const weakFocus =
    focusLabel === normalizePreviewLocaleValue(englishLocale.focusLabel) ||
    focusLabel === normalizePreviewLocaleValue(sourceLocale.focusLabel)

  return sameAsEnglish || sameAsSource || weakFocus
}

function previewNeedsLocaleRepair(preview: TopicPreview, sourceLanguage: PromptLanguage) {
  const candidateLanguages = TOPIC_LANGUAGE_CODES.filter(
    (language) => language !== sourceLanguage && language !== 'en',
  )

  const reusedCount = candidateLanguages.filter((language) =>
    previewLocaleLooksReused(preview, language, sourceLanguage),
  ).length

  return reusedCount >= Math.max(2, Math.ceil(candidateLanguages.length / 2))
}

async function localizeBlueprintWithLanguagePatches(
  input: TopicGenerationInput,
  blueprint: TopicBlueprint,
  options?: {
    strategy?: TopicGenerationStrategy
    allowModelPatches?: boolean
    userId?: string
  },
) {
  const runtime = await getGenerationRuntimeConfig()
  const strategy =
    options?.strategy ?? (await getTopicGenerationStrategy('language', options?.userId))
  const usesCompatibleProvider = strategy.usesCompatibleGateway
  const allowModelPatches = options?.allowModelPatches ?? true
  const targetLanguages = TOPIC_LANGUAGE_CODES.filter((language) => language !== input.sourceLanguage)

  const patchPayloads = await mapWithConcurrency(
    targetLanguages,
    usesCompatibleProvider
      ? TOPIC_LOCALIZATION_CONCURRENCY_COMPATIBLE
      : TOPIC_LOCALIZATION_CONCURRENCY,
    async (language) => {
      const fallbackPatch = buildLocalizationPatchFallback(blueprint, language)
      if (!allowModelPatches) {
        return {
          language,
          issue: null,
          usedFallback: true,
          patch: fallbackPatch,
        }
      }

      const { parsed, issue } = await completePromptJson<TopicLocalizationPatch>({
        templateId: PROMPT_TEMPLATE_IDS.TOPIC_LOCALE_PATCH,
        language: input.sourceLanguage,
        variableContext: {
          targetLanguage: language,
          targetLanguageLabel: PROMPT_LANGUAGE_LABELS[language],
          sourceLanguage: input.sourceLanguage,
          sourceLanguageLabel: PROMPT_LANGUAGE_LABELS[input.sourceLanguage],
        },
        input: {
          targetLanguage: language,
          targetLanguageLabel: PROMPT_LANGUAGE_LABELS[language],
          sourceLanguage: input.sourceLanguage,
          sourceLanguageLabel: PROMPT_LANGUAGE_LABELS[input.sourceLanguage],
          targetDescription: pickInputDescription(input, language),
          topic: {
            primaryLanguage: blueprint.topic.primaryLanguage,
            sourceName: blueprint.topic.locales[input.sourceLanguage].name,
            sourceSummary: blueprint.topic.locales[input.sourceLanguage].summary,
            sourceFocusLabel: blueprint.topic.locales[input.sourceLanguage].focusLabel,
            englishName: blueprint.topic.locales.en.name,
            englishSummary: blueprint.topic.locales.en.summary,
            englishFocusLabel: blueprint.topic.locales.en.focusLabel,
            currentLocale: blueprint.topic.locales[language],
            keywords: blueprint.topic.keywords.map((keyword) => ({
              source: pickNonEmpty(
                keyword.localized[input.sourceLanguage],
                input.sourceLanguage === 'zh' ? keyword.zh : '',
                input.sourceLanguage === 'en' ? keyword.en : '',
              ),
              en: pickNonEmpty(keyword.en, keyword.localized.en),
              current: pickNonEmpty(
                keyword.localized[language],
                language === 'zh' ? keyword.zh : '',
                language === 'en' ? keyword.en : '',
                keyword.en,
              ),
            })),
          },
          stages: blueprint.stages.map((stage) => ({
            order: stage.order,
            sourceName: stage.locales[input.sourceLanguage].name,
            sourceDescription: stage.locales[input.sourceLanguage].description,
            englishName: stage.locales.en.name,
            englishDescription: stage.locales.en.description,
            currentLocale: stage.locales[language],
          })),
        },
    outputContract: buildLocalizationPatchOutputContract(blueprint, language),
    attemptLimit: runtime.topicLocalizationPasses,
    maxTokens: usesCompatibleProvider
      ? TOPIC_LOCALIZATION_MAX_TOKENS_COMPATIBLE
      : TOPIC_LOCALIZATION_MAX_TOKENS,
    timeoutMs: usesCompatibleProvider
      ? TOPIC_LOCALIZATION_MODEL_TIMEOUT_MS_COMPATIBLE
      : TOPIC_LOCALIZATION_MODEL_TIMEOUT_MS,
    userId: options?.userId,
  })

      return {
        language,
        issue,
        usedFallback: !parsed,
        patch: parsed ?? fallbackPatch,
      }
    },
  )

  const fallbackLanguages = patchPayloads.filter((entry) => entry.usedFallback)
  if (fallbackLanguages.length > 0) {
    if (allowModelPatches) {
      logger.warn('Topic localization patches fell back for some languages.', {
        sourceLanguage: input.sourceLanguage,
        languages: fallbackLanguages.map((entry) => entry.language),
        issues: fallbackLanguages
          .map((entry) => entry.issue?.message)
          .filter((message): message is string => Boolean(message)),
        service: 'tracemind',
      })
    } else {
      logger.info('Topic localization uses deterministic fallback patches.', {
        sourceLanguage: input.sourceLanguage,
        languages: fallbackLanguages.map((entry) => entry.language),
        service: 'tracemind',
      })
    }
  }

  return patchPayloads.reduce(
    (currentBlueprint, entry) => applyLocalizationPatch(currentBlueprint, entry.patch),
    blueprint,
  )
}

async function generatePreview(input: TopicGenerationInput, userId?: string) {
  const fallback = createFallbackPreview(input)
  const runtime = await getGenerationRuntimeConfig()
  const strategy = await getTopicGenerationStrategy('language', userId)
  const usesCompatibleProvider = strategy.usesCompatibleGateway

  const language = input.sourceLanguage
  const englishAnchor = pickNonEmpty(input.descriptionByLanguage.en, input.sourceLanguage === 'en' ? input.sourceDescription : '')
  const { parsed, issue } = await completePromptJson<Partial<TopicPreview>>({
    templateId: PROMPT_TEMPLATE_IDS.TOPIC_PREVIEW,
    language,
    variableContext: {
      languageModeRule: getLanguageRule(input.languageMode),
    },
    input: {
      description: input.sourceDescription,
      descriptionEn: englishAnchor,
      sourceLanguage: input.sourceLanguage,
      sourceDescription: input.sourceDescription,
      anchorDescriptions: input.anchorDescriptions,
      descriptionByLanguage: input.descriptionByLanguage,
      languageMode: input.languageMode,
      languageModeRule: getLanguageRule(input.languageMode),
    },
    outputContract: buildPreviewOutputContract(input.sourceLanguage),
    attemptLimit: runtime.topicPreviewPasses,
    maxTokens: usesCompatibleProvider ? TOPIC_PREVIEW_MAX_TOKENS_COMPATIBLE : TOPIC_PREVIEW_MAX_TOKENS,
    timeoutMs: usesCompatibleProvider
      ? TOPIC_PREVIEW_MODEL_TIMEOUT_MS_COMPATIBLE
      : TOPIC_PREVIEW_MODEL_TIMEOUT_MS,
    userId,
  })

  const parsedResult = previewPayloadSchema.safeParse({
    ...fallback,
    ...(parsed ?? {}),
  })

  if (!parsed) {
    logger.warn('Topic preview generation fell back to heuristic preview.', {
      sourceLanguage: input.sourceLanguage,
      issue: issue?.message ?? null,
      service: 'tracemind',
    })
  }

  return parsedResult.success
    ? repairPreviewWithFallback(parsedResult.data, fallback, input.sourceLanguage)
    : fallback
}

async function generateBlueprint(
  input: TopicGenerationInput,
  preview: TopicPreview,
  options?: {
    attemptLimit?: number
    timeoutMs?: number | null
    userId?: string
  },
) {
  const fallback = buildFallbackBlueprint(input, preview)
  const strategy = await getTopicGenerationStrategy('language', options?.userId)

  if (strategy.mode === 'scaffold') {
    logger.info('Topic blueprint uses deterministic scaffold strategy override.', {
      sourceLanguage: input.sourceLanguage,
      service: 'tracemind',
    })
    return fallback
  }

  const language = input.sourceLanguage
  const englishAnchor = pickNonEmpty(
    input.descriptionByLanguage.en,
    input.sourceLanguage === 'en' ? input.sourceDescription : '',
  )
  const runtime = await getGenerationRuntimeConfig()
  const usesCompatibleProvider = strategy.usesCompatibleGateway
  const timeoutMs =
    options && Object.prototype.hasOwnProperty.call(options, 'timeoutMs')
      ? options.timeoutMs ?? null
      : usesCompatibleProvider
        ? TOPIC_BLUEPRINT_MODEL_TIMEOUT_MS_COMPATIBLE
        : TOPIC_BLUEPRINT_MODEL_TIMEOUT_MS

  const { parsed, issue } = await completePromptJson<TopicBlueprint>({
    templateId: PROMPT_TEMPLATE_IDS.TOPIC_BLUEPRINT,
    language,
    variableContext: {
      languageModeRule: getLanguageRule(input.languageMode),
    },
    input: {
      description: input.sourceDescription,
      descriptionEn: englishAnchor,
      sourceLanguage: input.sourceLanguage,
      sourceDescription: input.sourceDescription,
      anchorDescriptions: input.anchorDescriptions,
      descriptionByLanguage: input.descriptionByLanguage,
      languageMode: input.languageMode,
      languageModeRule: getLanguageRule(input.languageMode),
      preview,
    },
    outputContract: fallback,
    attemptLimit: options?.attemptLimit ?? runtime.topicBlueprintPasses,
    maxTokens: 2800,
    timeoutMs,
    userId: options?.userId,
  })

  if (!parsed) {
    logger.warn('Topic blueprint generation fell back to scaffold.', {
      sourceLanguage: input.sourceLanguage,
      issue: issue?.message ?? null,
      service: 'tracemind',
    })
  }

  return repairBlueprintWithFallback(
    mergeBlueprint(fallback, parsed),
    fallback,
    input.sourceLanguage,
  )
}

async function localizeBlueprint(
  input: TopicGenerationInput,
  preview: TopicPreview,
  blueprint: TopicBlueprint,
  userId?: string,
) {
  const strategy = await getTopicGenerationStrategy('language', userId)
  const usesCompatibleProvider = strategy.usesCompatibleGateway

  if (strategy.mode === 'scaffold') {
    return localizeBlueprintWithLanguagePatches(input, blueprint, {
      strategy,
      userId,
      allowModelPatches: false,
    })
  }

  if (strategy.mode === 'patches-only' || usesCompatibleProvider) {
    if (usesCompatibleProvider && strategy.mode === 'native') {
      logger.info('Topic localization uses language patch pipeline for compatible provider.', {
        sourceLanguage: input.sourceLanguage,
        service: 'tracemind',
      })
    }

    return localizeBlueprintWithLanguagePatches(input, blueprint, {
      strategy,
      userId,
    })
  }

  const runtime = await getGenerationRuntimeConfig()
  const { parsed, issue } = await completePromptJson<TopicBlueprint>({
    templateId: PROMPT_TEMPLATE_IDS.TOPIC_LOCALIZATION,
    language: input.sourceLanguage,
    input: {
      sourceLanguage: input.sourceLanguage,
      sourceDescription: input.sourceDescription,
      descriptionByLanguage: input.descriptionByLanguage,
      anchorDescriptions: input.anchorDescriptions,
      preview,
      blueprint,
    },
    outputContract: blueprint,
    attemptLimit: runtime.topicLocalizationPasses,
    maxTokens: 3200,
    timeoutMs: usesCompatibleProvider
      ? null
      : TOPIC_LOCALIZATION_MODEL_TIMEOUT_MS,
    userId,
  })

  if (!parsed) {
    logger.warn('Topic localization generation fell back to language patches.', {
      sourceLanguage: input.sourceLanguage,
      issue: issue?.message ?? null,
      service: 'tracemind',
    })
    return localizeBlueprintWithLanguagePatches(input, blueprint, {
      strategy,
      userId,
    })
  }

  return mergeBlueprint(blueprint, parsed)
}

async function runTopicGenerationPipeline(
  input: TopicGenerationInput,
  providedPreview?: TopicPreview,
  options?: {
    preferFastCreate?: boolean
    userId?: string
  },
) {
  const strategy = await getTopicGenerationStrategy('language', options?.userId)
  const preview = providedPreview
    ? previewPayloadSchema.parse(providedPreview)
    : await generatePreview(input, options?.userId)
  const shouldUseFastCreate = strategy.usesCompatibleGateway || Boolean(providedPreview && options?.preferFastCreate)

  if (shouldUseFastCreate) {
    logger.info('Topic create uses fast materialization path with localization.', {
      sourceLanguage: input.sourceLanguage,
      usesCompatibleGateway: strategy.usesCompatibleGateway,
      usesProvidedPreview: Boolean(providedPreview && options?.preferFastCreate),
      service: 'tracemind',
    })

    const blueprint = await generateBlueprint(input, preview, {
      attemptLimit: 1,
      timeoutMs: strategy.usesCompatibleGateway
        ? TOPIC_BLUEPRINT_CREATE_TIMEOUT_MS_COMPATIBLE
        : TOPIC_BLUEPRINT_CREATE_TIMEOUT_MS,
      userId: options?.userId,
    })
    const localizedBlueprint =
      strategy.mode === 'scaffold' ||
      strategy.mode === 'patches-only' ||
      strategy.usesCompatibleGateway
        ? await localizeBlueprintWithLanguagePatches(input, blueprint, {
            strategy,
            userId: options?.userId,
            allowModelPatches: !strategy.usesCompatibleGateway,
          })
        : await localizeBlueprint(input, preview, blueprint, options?.userId)

    return {
      preview: previewFromBlueprint(localizedBlueprint),
      blueprint: localizedBlueprint,
    }
  }

  const blueprint = await generateBlueprint(input, preview, {
    userId: options?.userId,
  })
  const localizedBlueprint = await localizeBlueprint(input, preview, blueprint, options?.userId)

  return {
    preview: previewFromBlueprint(localizedBlueprint),
    blueprint: localizedBlueprint,
  }
}

async function saveTopicBlueprint(
  input: TopicGenerationInput,
  preview: TopicPreview,
  blueprint: TopicBlueprint,
) {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      updatedAt: new Date(),
      nameZh: pickNonEmpty(blueprint.topic.locales.zh.name, blueprint.topic.nameZh, preview.nameZh, '新主题'),
      nameEn: pickNonEmpty(blueprint.topic.locales.en.name, blueprint.topic.nameEn, preview.nameEn, 'New Topic'),
      focusLabel: pickNonEmpty(blueprint.topic.locales.zh.focusLabel, blueprint.topic.focusLabelZh, preview.focusLabelZh, '研究焦点'),
      summary: pickNonEmpty(blueprint.topic.locales.zh.summary, blueprint.topic.summaryZh, preview.summaryZh, pickInputDescription(input, 'zh')),
      description: input.sourceDescription,
      language: resolveStoredLanguage(input.languageMode, blueprint.topic.primaryLanguage),
      status: 'active',
    },
  })

  // Create topic stages separately
  await prisma.topic_stages.createMany({
    data: blueprint.stages.map((stage) => ({
      id: crypto.randomUUID(),
      topicId: topic.id,
      order: stage.order,
      name: pickNonEmpty(stage.locales.zh.name, stage.name, `阶段 ${stage.order}`),
      nameEn: pickNonEmpty(stage.locales.en.name, stage.nameEn, `Stage ${stage.order}`),
      description: pickNonEmpty(stage.locales.zh.description, stage.description),
      descriptionEn: pickNonEmpty(stage.locales.en.description, stage.descriptionEn),
    })),
  })

  const localizationPayload = {
    schemaVersion: 'topic-localization-v2',
    languageMode: input.languageMode,
    primaryLanguage: blueprint.topic.primaryLanguage,
    sourceLanguage: input.sourceLanguage,
    sourceDescription: input.sourceDescription,
    anchorDescriptions: input.anchorDescriptions,
    descriptionByLanguage: input.descriptionByLanguage,
    topic: blueprint.topic,
    stages: blueprint.stages,
    preview,
    createdAt: new Date().toISOString(),
  }

  await prisma.$transaction([
    prisma.system_configs.upsert({
      where: { key: `topic:${topic.id}:keywords` },
      update: { value: JSON.stringify(blueprint.topic.keywords), updatedAt: new Date() },
      create: { id: crypto.randomUUID(), key: `topic:${topic.id}:keywords`, value: JSON.stringify(blueprint.topic.keywords), updatedAt: new Date() },
    }),
    prisma.system_configs.upsert({
      where: { key: `topic:${topic.id}:summaryEn` },
      update: { value: pickNonEmpty(blueprint.topic.summaryEn, blueprint.topic.locales.en.summary, preview.summaryEn), updatedAt: new Date() },
      create: {
        id: crypto.randomUUID(),
        updatedAt: new Date(),
        key: `topic:${topic.id}:summaryEn`,
        value: pickNonEmpty(blueprint.topic.summaryEn, blueprint.topic.locales.en.summary, preview.summaryEn),
      },
    }),
    prisma.system_configs.upsert({
      where: { key: `topic:${topic.id}:localization` },
      update: { value: JSON.stringify(localizationPayload), updatedAt: new Date() },
      create: { id: crypto.randomUUID(), key: `topic:${topic.id}:localization`, value: JSON.stringify(localizationPayload), updatedAt: new Date() },
    }),
    prisma.system_configs.upsert({
      where: { key: `topic:${topic.id}:creation` },
      update: {
        value: JSON.stringify({
          description: input.sourceDescription,
          descriptionEn: pickNonEmpty(input.descriptionByLanguage.en, input.sourceLanguage === 'en' ? input.sourceDescription : ''),
          languageMode: input.languageMode,
          sourceLanguage: input.sourceLanguage,
          sourceDescription: input.sourceDescription,
          anchorDescriptions: input.anchorDescriptions,
          descriptionByLanguage: input.descriptionByLanguage,
          preview,
          updatedAt: new Date().toISOString(),
        }),
      },
      create: {
        id: crypto.randomUUID(),
        updatedAt: new Date(),
        key: `topic:${topic.id}:creation`,
        value: JSON.stringify({
          description: input.sourceDescription,
          descriptionEn: pickNonEmpty(input.descriptionByLanguage.en, input.sourceLanguage === 'en' ? input.sourceDescription : ''),
          languageMode: input.languageMode,
          sourceLanguage: input.sourceLanguage,
          sourceDescription: input.sourceDescription,
          anchorDescriptions: input.anchorDescriptions,
          descriptionByLanguage: input.descriptionByLanguage,
          preview,
          updatedAt: new Date().toISOString(),
        }),
      },
    }),
  ])

  return topic
}

router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const input = normalizeTopicGenerationInput(previewSchema.parse(req.body))
    const preview = await generatePreview(input, resolveRequestUserId(req))
    res.json({
      success: true,
      data: preview,
    })
  }),
)

router.post(
  '/create',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.parse(req.body)
    const input = normalizeTopicGenerationInput(parsed)
    const userId = resolveRequestUserId(req)
    const { preview: normalizedPreview, blueprint } = await runTopicGenerationPipeline(
      input,
      parsed.preview ? previewPayloadSchema.parse(parsed.preview) : undefined,
      {
        preferFastCreate: Boolean(parsed.preview),
        userId,
      },
    )
    const topic = await saveTopicBlueprint(input, normalizedPreview, blueprint)

    res.status(201).json({
      success: true,
      data: {
        topicId: topic.id,
        topic,
        preview: normalizedPreview,
        blueprint,
      },
    })
  }),
)

router.get(
  '/languages',
  asyncHandler(async (_req, res) => {
    const runtimeLanguages = PROMPT_LANGUAGES.filter((language) =>
      TOPIC_LANGUAGE_CODES.includes(language.code),
    ).map((language) => ({
      code: language.code,
      name: language.label,
      nativeName: language.nativeName,
      isDefault: language.isDefault ?? false,
      mode: 'native' as const,
    }))

    res.json({
      success: true,
      data: [
        ...runtimeLanguages,
        {
          code: 'bilingual',
          name: 'Bilingual',
          nativeName: '中英双语',
          isDefault: false,
          mode: 'legacy',
        },
      ],
    })
  }),
)

export default router

export const __testing = {
  buildTopicGenerationPassProfile,
  createFallbackPreview,
  extractTopicSubject,
  pickInputDescription,
  previewNeedsLocaleRepair,
  repairBlueprintWithFallback,
  repairPreviewWithFallback,
  resolveTopicGenerationStrategy,
}
