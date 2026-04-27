export type TopicPresentationLike = {
  id?: string | null
  title?: string | null
  titleSecondary?: string | null
  nameZh?: string | null
  nameEn?: string | null
  summary?: string | null
  focusLabel?: string | null
  createdAt?: string | null
}

const TOPIC_SURFACE_PROMPT_PATTERNS = [
  /\bthe user wants\b/iu,
  /\bkey requirements?\b/iu,
  /\bstructure plan\b/iu,
  /\bsummary context\b/iu,
  /\breference paper\b/iu,
  /\brelated papers? to mention\b/iu,
  /\btone\s*:/iu,
  /\bnote\s*:/iu,
  /\b500-800\s*word\b/iu,
  /\bchinese narrative\b/iu,
  /\bcritical judgment\b/iu,
  /\bevidence awareness\b/iu,
  /\blimitations?\b/iu,
  /\bconclusion\s*:/iu,
]

const TOPIC_SURFACE_PROCESS_PATTERNS = [
  /研究已暂停/u,
  /研究已完成/u,
  /本轮/u,
  /小时研究/u,
  /研究循环/u,
  /候选论文/u,
  /纳入/u,
  /内容重建/u,
  /当前停留/u,
  /持续检索/u,
  /回看已有节点/u,
  /正在检索并筛选新的论文候选/u,
  /\bpipeline\b/iu,
  /\bresearch run\b/iu,
  /\bcandidate papers?\b/iu,
  /\badmitted\b/iu,
  /\bdiscovered\b/iu,
  /\bgenerated\b/iu,
  /\bpaused\b/iu,
  /\bcompleted\b/iu,
  /\bcycle\b/iu,
  /\bdeadline\b/iu,
  /\bscheduler\b/iu,
]

const TOPIC_SURFACE_PLACEHOLDER_PATTERNS = [/^\.{2,}$/u, /^…{2,}$/u]
const TOPIC_SURFACE_LOW_SIGNAL_PATTERNS = [
  /并不是单篇论文结论/u,
  /围绕同一问题形成的一段研究推进/u,
  /如果节点目前主要由一篇论文支撑/u,
  /节点总结不能只停在/u,
  /多篇论文共同坐实/u,
  /证据真空/u,
  /结构性证据真空/u,
  /零实证可视化/u,
  /零统计图表/u,
  /零数学模型/u,
  /零架构图/u,
  /零数学公式/u,
  /零系统对比/u,
  /无法核实/u,
  /过早纳入/u,
  /闭环驾驶性能增益/u,
  /缺乏[^。]{0,40}实证支撑/u,
  /this node is not a single-paper conclusion/iu,
  /formed around the same question/iu,
]

function collapseWhitespace(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function clipText(value: string, maxLength = 180) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function stripTopicSurfaceIds(value: string | null | undefined) {
  return collapseWhitespace(value)
    .replace(/[\(（]\s*(?:node|paper|stage)[-:][^)）\s]+[\)）]/giu, ' ')
    .replace(/\b(?:node|paper|stage)[-:][\w-]+\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function compactEnglishTopicSurfaceTitle(value: string, maxLength = 34) {
  let compact = collapseWhitespace(value)
    .replace(
      /^(analysis|study|understanding|rethinking|exploring|revisiting|investigating|examining)\s+of\s+/iu,
      '',
    )
    .replace(/^(towards|toward)\s+/iu, '')
    .replace(/^(a|an|the)\s+/iu, '')

  const connector = compact.match(/\s+(using|with|via|through|from|for|based on|under)\s+/iu)
  if (connector?.index && connector.index >= 16) {
    compact = compact.slice(0, connector.index)
  }

  compact = compact
    .replace(/\b(large[- ]scale|dataset|datasets)\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim()

  return clipText(compact || value, maxLength)
}

function normalizePresentationText(value: string | null | undefined, maxLength = 180) {
  const normalized = collapseWhitespace(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu, ' ')
    .trim()

  if (normalized.length <= maxLength) return normalized
  return normalized.slice(0, maxLength)
}

function hasReadableGlyph(value: string | null | undefined) {
  return /[\p{Letter}\p{Number}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
    value ?? '',
  )
}

function buildPrimaryTitle(topic: TopicPresentationLike) {
  return collapseWhitespace(topic.title ?? topic.nameZh ?? topic.nameEn)
}

function buildSecondaryTitle(topic: TopicPresentationLike) {
  return collapseWhitespace(topic.titleSecondary ?? topic.nameEn)
}

function buildTopicSignature(topic: TopicPresentationLike) {
  const primary = normalizePresentationText(buildPrimaryTitle(topic), 96)
  const secondary = normalizePresentationText(buildSecondaryTitle(topic), 96)
  const summary = normalizePresentationText(topic.summary, 160)
  const focusLabel = normalizePresentationText(topic.focusLabel, 48)

  const signature = [primary, secondary, focusLabel, summary].filter(Boolean).join('::')
  return signature || `topic:${collapseWhitespace(topic.id)}`
}

export function isRegressionSeedTopic(topic: TopicPresentationLike) {
  const id = collapseWhitespace(topic.id).toLowerCase()
  const text = `${topic.nameZh ?? ''} ${topic.nameEn ?? ''} ${topic.title ?? ''} ${topic.summary ?? ''}`.toLowerCase()
  return (
    id.startsWith('topic-alpha-route-') ||
    id.startsWith('prompt-templates-route-') ||
    text.includes('create a regression topic') ||
    text.includes('create a regres') ||
    text.includes('seeded for regression coverage') ||
    text.includes('external agent route test topic') ||
    text.includes('外部代理测试主题')
  )
}

export function isPresentationNoiseTopic(topic: TopicPresentationLike) {
  if (isRegressionSeedTopic(topic)) return true

  const primaryTitle = buildPrimaryTitle(topic)
  const secondaryTitle = buildSecondaryTitle(topic)
  const summary = collapseWhitespace(topic.summary)

  const combined = `${primaryTitle} ${secondaryTitle} ${summary}`.trim()
  if (!combined) return true

  const questionOnly = /^[?？!！.。·•\-_~=+|/\\[\](){}<>:;"'`，、]+$/u
  if ((primaryTitle && questionOnly.test(primaryTitle)) || (secondaryTitle && questionOnly.test(secondaryTitle))) {
    return true
  }

  if (!hasReadableGlyph(primaryTitle) && !hasReadableGlyph(secondaryTitle) && !hasReadableGlyph(summary)) {
    return true
  }

  return false
}

export function isTopicSurfaceNoiseText(value: string | null | undefined) {
  const normalized = stripTopicSurfaceIds(value)
  if (!normalized) return true
  if (TOPIC_SURFACE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  if (TOPIC_SURFACE_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  if (TOPIC_SURFACE_PROCESS_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  if (TOPIC_SURFACE_LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  return false
}

export function sanitizeTopicSurfaceText(value: string | null | undefined, maxLength = 140) {
  const normalized = stripTopicSurfaceIds(value)
    .replace(/\.{3,}|…{2,}/gu, '。')
    .replace(/\s+/gu, ' ')
    .trim()

  if (!normalized || isTopicSurfaceNoiseText(normalized)) return ''

  const sentences = normalized
    .split(/(?<=[。！？!?；;])\s*|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  for (const sentence of sentences) {
    if (!isTopicSurfaceNoiseText(sentence)) {
      return clipText(sentence, maxLength)
    }
  }

  return clipText(normalized, maxLength)
}

export function compactTopicSurfaceTitle(
  value: string | null | undefined,
  fallback = 'Research Node',
  maxLength = 40,
) {
  const normalized = stripTopicSurfaceIds(value)
  if (!normalized || isTopicSurfaceNoiseText(normalized)) return fallback

  if (!/[\p{Script=Han}]/u.test(normalized) && normalized.split(/\s+/u).length >= 6) {
    return compactEnglishTopicSurfaceTitle(normalized, maxLength)
  }

  if (/[:：]/u.test(normalized)) {
    const compactSegment = normalized
      .split(/[:：]/u)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .sort((left, right) => left.length - right.length)[0]

    if (compactSegment) return clipText(compactSegment, maxLength)
  }

  return clipText(normalized, maxLength)
}

export function dedupeTopicPresentation<T extends TopicPresentationLike>(topics: T[]) {
  const seen = new Map<string, T>()

  for (const topic of topics) {
    if (isPresentationNoiseTopic(topic)) continue

    const signature = buildTopicSignature(topic)
    if (!seen.has(signature)) {
      seen.set(signature, topic)
    }
  }

  return Array.from(seen.values())
}
