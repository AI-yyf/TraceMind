import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AssistantEmptyState } from './AssistantEmptyState'
import { AssistantHeader } from './AssistantHeader'
import { ContextTray } from './ContextTray'
import { ConversationThread } from './ConversationThread'
import { CurrentReadingFocusCard } from './CurrentReadingFocusCard'
import { GuidanceLedgerCard } from './GuidanceLedgerCard'
import { GroundedComposer } from './GroundedComposer'
import { NotebookPanel } from './NotebookPanel'
import { ReadingPathCard } from './ReadingPathCard'
import { ResearchIntelPanel } from './ResearchIntelPanel'
import { ResearchWorldCard } from './ResearchWorldCard'
import { ResearchSessionCard } from './ResearchSessionCard'
import { ResourcesPanel } from './ResourcesPanel'
import { SearchPanel } from './SearchPanel'
import { SidebarToolTabs } from './SidebarToolTabs'
import {
  TOPIC_WORKBENCH_DESKTOP_WIDTH,
  isTopicWorkbenchDesktopViewport,
} from './workbench-layout'
import { type ReadingTrailEntry, useReadingWorkspace } from '@/contexts/ReadingWorkspaceContext'
import { useFavorites } from '@/hooks'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { formatDateTimeByLanguage, resolveLanguageLocale } from '@/i18n/locale'
import type {
  AssistantState,
  CitationRef,
  ContextPill,
  EvidencePayload,
  ModelCapabilitySummary,
  OmniIssue,
  SearchResultItem,
  StoredChatMessage,
  StoredChatThread,
  SuggestedAction,
  TopicChatResponse,
  TopicCognitiveMemoryEntry,
  TopicResearchBrief,
  TopicResearchExportBundle,
  TopicResearchSessionState,
  TopicWorkbenchAction,
  TopicWorkbenchTab,
} from '@/types/alpha'
import type { FavoriteExcerpt } from '@/types/tracker'
import {
  ApiError,
  apiGet,
  apiPost,
} from '@/utils/api'
import {
  fetchModelCapabilitySummary,
  fetchTopicResearchBrief,
  invalidateModelCapabilitySummary,
  invalidateTopicResearchBrief,
  primeTopicResearchBrief,
} from '@/utils/omniRuntimeCache'
import {
  buildNotebookJson,
  buildNotebookMarkdown,
  buildResearchDossierMarkdown,
  buildResearchHighlightsMarkdown,
  downloadNotebookTextFile,
  slugifyNotebookFilename,
} from '@/utils/researchNotebook'
import {
  MODEL_CONFIG_UPDATED_EVENT,
  TOPIC_CONTEXT_ADD_EVENT,
  TOPIC_QUESTION_SEED_EVENT,
  TOPIC_WORKBENCH_OPEN_EVENT,
  consumeQueuedTopicContexts,
} from '@/utils/workbench-events'

type TopicChatStore = { currentThreadId: string; threads: StoredChatThread[] }

type ResourceCard = {
  id: string
  title: string
  subtitle: string
  description: string
  kind: 'stage' | 'node' | 'paper'
  route?: string
  anchorId?: string
}
type WorkbenchStyle = 'brief' | 'balanced' | 'deep'

function createThread(title = ''): StoredChatThread {
  const now = new Date().toISOString()
  return {
    id: `thread-${Date.now()}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    draft: '',
  }
}

function isResearchStatusMessage(message: StoredChatMessage) {
  return message.role === 'assistant' && message.id.startsWith('research:')
}

function compactThreadMessages(messages: StoredChatMessage[]) {
  const latestResearchMessage = [...messages].reverse().find(isResearchStatusMessage)

  if (!latestResearchMessage) {
    return messages
  }

  return messages.filter(
    (message) =>
      !isResearchStatusMessage(message) || message.id === latestResearchMessage.id,
  )
}

function parseChatStore(value: string | null) {
  if (!value) {
    const thread = createThread()
    return { currentThreadId: thread.id, threads: [thread] }
  }

  try {
    const parsed = JSON.parse(value) as TopicChatStore
    if (Array.isArray(parsed.threads) && parsed.threads.length > 0) {
      return {
        ...parsed,
        threads: parsed.threads.map((thread) => ({
          ...thread,
          draft: typeof thread.draft === 'string' ? thread.draft : '',
          messages: compactThreadMessages(
            Array.isArray(thread.messages) ? thread.messages : [],
          ),
        })),
      }
    }
  } catch {
    // Ignore malformed persisted data and recreate.
  }

  const thread = createThread()
  return { currentThreadId: thread.id, threads: [thread] }
}

function buildMessage(
  role: 'assistant' | 'user',
  content: string,
  extra?: Partial<StoredChatMessage>,
): StoredChatMessage {
  return {
    id: extra?.id ?? `${role}-${Date.now()}`,
    role,
    content,
    citations: extra?.citations,
    suggestedActions: extra?.suggestedActions,
    guidanceReceipt: extra?.guidanceReceipt,
    notice: extra?.notice,
    createdAt: new Date().toISOString(),
  }
}

function buildPillFromEvidence(evidence: EvidencePayload): ContextPill {
  return {
    id: `evidence:${evidence.anchorId}`,
    kind: 'evidence',
    label: evidence.label,
    description: evidence.quote,
    route: evidence.route,
    anchorId: evidence.anchorId,
  }
}

function buildPillFromSearch(item: SearchResultItem): ContextPill {
  return {
    id: `search:${item.kind}:${item.id}`,
    kind: 'search',
    label: item.title,
    description: item.excerpt,
    route: item.route,
    anchorId: item.anchorId,
  }
}

function buildPillFromTrailEntry(entry: ReadingTrailEntry): ContextPill {
  return {
    id: entry.id,
    kind: entry.kind === 'topic' ? 'anchor' : entry.kind,
    label: entry.title,
    description:
      entry.kind === 'paper'
        ? 'Current paper locus'
        : entry.kind === 'node'
          ? 'Current node locus'
          : 'Current topic locus',
    route: entry.route,
  }
}

function clipText(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function getNotebookListDelimiters(
  language: 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru',
) {
  const normalizedLanguage = language === 'zh' ? 'zh-clean' : language
  if (normalizedLanguage === 'zh-clean') {
    return {
      inline: '、',
      block: '；',
    }
  }

  if (language === 'zh') {
    return {
      inline: '、',
      block: '；',
    }
  }

  return {
    inline: ', ',
    block: '; ',
  }
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value?.replace(/\s+/gu, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function uniquePromptActions(
  values: Array<{ id?: string; label: string; prompt: string } | null | undefined>,
  limit = 3,
) {
  const seen = new Set<string>()
  const output: Array<{ id: string; label: string; prompt: string }> = []

  for (const value of values) {
    if (!value) continue
    const label = value.label.replace(/\s+/gu, ' ').trim()
    const prompt = value.prompt.replace(/\s+/gu, ' ').trim()
    if (!label || !prompt) continue
    const key = `${label}::${prompt}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ id: value.id ?? key, label, prompt })
    if (output.length >= limit) break
  }

  return output
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

function formatResearchMoment(
  value: string | null | undefined,
  language: 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru',
) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return formatDateTimeByLanguage(date, language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildResearchStatusMessage(
  session: TopicResearchSessionState | null,
  brief: TopicResearchBrief | null,
  language: 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru',
  translate: (key: string, fallback: string) => string,
) {
  const report = session?.report
  if (!report) return null
  const latestDecision =
    brief?.pipeline.currentStage?.durationDecision ??
    brief?.pipeline.lastRun?.durationDecision ??
    null

  const durationText = report.durationHours
    ? renderTemplate(translate('workbench.researchDurationNarrative', '{hours} hours'), {
        hours: report.durationHours,
      })
    : translate('workbench.researchThisRound', 'this round')
  const deadlineLabel = formatResearchMoment(
    report.deadlineAt ?? session?.progress?.deadlineAt,
    language,
  )
  const summary = clipText(report.summary || report.headline || '', 240)
  const stats = renderTemplate(
    translate(
      'workbench.researchChatStats',
      'This round surfaced {discovered} candidate papers, admitted {admitted}, and rebuilt or refreshed {generated} content blocks.',
    ),
    {
      discovered: report.discoveredPapers,
      admitted: report.admittedPapers,
      generated: report.generatedContents,
    },
  )
  const decisionLine =
    latestDecision?.summary && latestDecision.summary !== summary
      ? `\n\n${renderTemplate(
          translate('workbench.researchChatDecision', 'Latest stage decision: {decision}'),
          { decision: latestDecision.summary },
        )}`
      : ''

  if (report.status === 'running' && session?.active) {
    return buildMessage(
      'assistant',
      renderTemplate(
        translate(
          'workbench.researchChatRunning',
          '{duration} of sustained research has started. I will keep searching papers, revising nodes, and refining the mainline in this run{deadlineClause}.',
        ),
        {
          duration: durationText,
          deadlineClause: deadlineLabel
            ? renderTemplate(
                translate(
                  'workbench.researchChatRunningDeadline',
                  ', and expect to wrap by {deadline} before reporting back here',
                ),
                { deadline: deadlineLabel },
              )
            : '',
        },
      ) + decisionLine,
      {
        id: `research:${report.reportId}:running`,
      },
    )
  }

  if (report.status === 'completed') {
    return buildMessage(
      'assistant',
      `${translate(
        'workbench.researchChatCompletedLead',
        'This sustained research run is complete.',
      )}${report.headline ? ` ${report.headline}.` : ''}${summary ? `\n\n${summary}` : ''}${decisionLine}\n\n${stats}${
        report.openQuestions[0]
          ? `\n\n${renderTemplate(
              translate(
                'workbench.researchChatOpenQuestion',
                'Question still under judgment: {question}',
              ),
              { question: report.openQuestions[0] },
            )}`
          : ''
      }`,
      {
        id: `research:${report.reportId}:completed`,
      },
    )
  }

  if (report.status === 'paused') {
    return buildMessage(
      'assistant',
      `${translate(
        'workbench.researchChatPausedLead',
        'This sustained research run has paused at its current state.',
      )}${summary ? `\n\n${summary}` : ''}${decisionLine}\n\n${stats}`,
      {
        id: `research:${report.reportId}:paused`,
      },
    )
  }

  if (report.status === 'failed') {
    return buildMessage(
      'assistant',
      `${translate(
        'workbench.researchChatFailedLead',
        'This sustained research run was interrupted before it could wrap cleanly.',
      )}${summary ? `\n\n${summary}` : ''}${decisionLine}${
        report.openQuestions[0]
          ? `\n\n${renderTemplate(
              translate(
                'workbench.researchChatOpenQuestion',
                'Question still under judgment: {question}',
              ),
              { question: report.openQuestions[0] },
            )}`
          : ''
      }`,
      {
        id: `research:${report.reportId}:failed`,
      },
    )
  }

  return null
}

function splitNotebookParagraphs(content: string, maxParts = 6) {
  const parts = content
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter(Boolean)

  if (parts.length > 0) return parts.slice(0, maxParts)

  return content
    .split(/[。！？]\s*/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxParts)
}

function extractNotebookTitle(content: string, fallback: string) {
  const firstLine = content
    .split('\n')
    .map((line) => line.replace(/^[#>*\-\s]+/u, '').trim())
    .find(Boolean)

  return clipText(firstLine || fallback, 52)
}

function buildAssistantNotebookEntry({
  topicId,
  topicTitle,
  language,
  message,
  fallbackTitle,
  evidencePrefix,
  sourceLabel,
  summaryTemplate,
  summaryFallback,
}: {
  topicId: string
  topicTitle: string
  language: 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'
  message: StoredChatMessage
  fallbackTitle: string
  evidencePrefix: string
  sourceLabel: string
  summaryTemplate: string
  summaryFallback: string
}): FavoriteExcerpt {
  const citedLabels = message.citations?.map((citation) => citation.label).filter(Boolean) ?? []
  const paragraphs = splitNotebookParagraphs(message.content)
  const route = message.citations?.[0]?.route || `/topic/${topicId}`
  const delimiters = getNotebookListDelimiters(language)

  return {
    id: `assistant:${topicId}:${message.id}`,
    kind: 'assistant',
    topicId,
    topicTitle,
    excerptTitle: extractNotebookTitle(message.content, fallbackTitle),
    paragraphs:
      citedLabels.length > 0
        ? [...paragraphs, `${evidencePrefix}${citedLabels.join(delimiters.block)}`]
        : paragraphs,
    savedAt: new Date().toISOString(),
    route,
    anchorId: message.citations?.[0]?.anchorId,
    sourceLabel,
    summary:
      citedLabels.length > 0
        ? renderTemplate(summaryTemplate, { labels: citedLabels.slice(0, 3).join(delimiters.inline) })
        : summaryFallback,
    tags: citedLabels.slice(0, 4),
  }
}

function buildEvidenceNotebookEntry({
  topicId,
  topicTitle,
  evidence,
  figureSourceLabel,
  textSourceLabel,
}: {
  topicId: string
  topicTitle: string
  evidence: EvidencePayload
  figureSourceLabel: string
  textSourceLabel: string
}): FavoriteExcerpt {
  return {
    id: `evidence:${topicId}:${evidence.anchorId}`,
    kind: 'evidence',
    topicId,
    topicTitle,
    paperId:
      typeof evidence.metadata?.paperId === 'string' ? evidence.metadata.paperId : undefined,
    paperTitleZh: evidence.title,
    excerptTitle: evidence.label,
    paragraphs: [evidence.quote, evidence.content, evidence.whyItMatters]
      .filter((item): item is string => Boolean(item?.trim()))
      .map((item) => item.trim())
      .slice(0, 6),
    savedAt: new Date().toISOString(),
    route: evidence.route,
    anchorId: evidence.anchorId,
    sourceLabel: evidence.type === 'figure' || evidence.type === 'table' || evidence.type === 'formula'
      ? figureSourceLabel
      : textSourceLabel,
    summary: evidence.whyItMatters ? clipText(evidence.whyItMatters, 120) : clipText(evidence.quote, 120),
    tags: [evidence.type, evidence.title].filter(Boolean),
  }
}

function buildCognitivePrompt(
  entry: TopicCognitiveMemoryEntry,
  translate: (key: string, fallback: string) => string,
) {
  const title = localizeCognitiveEntryTitle(entry.title, translate)
  return renderTemplate(
    translate(
      'workbench.calibrationPromptTemplate',
      'Continue from "{title}" and explain how it should shape the current research mainline: {summary}',
    ),
    {
      title: clipText(title, 48),
      summary: clipText(entry.summary, 180),
    },
  )
}

function memorySourceLabel(
  source: TopicCognitiveMemoryEntry['source'],
  translate: (key: string, fallback: string) => string,
) {
  if (source === 'guidance') return translate('workbench.calibrationSourceGuidance', 'Guidance')
  if (source === 'report') return translate('workbench.calibrationSourceReport', 'Report')
  if (source === 'world') return translate('workbench.calibrationSourceWorld', 'World')
  if (source === 'generation') return translate('workbench.calibrationSourceGeneration', 'Generation')
  return translate('workbench.calibrationSourceSession', 'Session')
}

function normalizeInlineLabel(value: string) {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase()
}

function localizeCognitiveEntryTitle(
  value: string,
  translate: (key: string, fallback: string) => string,
) {
  const normalized = normalizeInlineLabel(value)

  if (normalized === 'current focus') {
    return translate('workbench.cognitiveCurrentFocus', 'Current focus')
  }
  if (normalized === 'established judgment') {
    return translate('workbench.cognitiveEstablishedJudgment', 'Established judgment')
  }
  if (normalized === 'conversation contract') {
    return translate('workbench.cognitiveConversationContract', 'Conversation contract')
  }
  if (normalized === 'reviewer watchpoint') {
    return translate('workbench.cognitiveReviewerWatchpoint', 'Reviewer watchpoint')
  }

  return value
}

function isGenericReferenceLabel(
  value: string,
  translate: (key: string, fallback: string) => string,
) {
  const normalized = normalizeInlineLabel(value)
  const genericLabels = [
    'open question',
    'open questions',
    'question',
    'questions',
    translate('workbench.openQuestions', 'Questions'),
  ].map((item) => normalizeInlineLabel(item))

  return genericLabels.includes(normalized)
}

function buildCalibrationActionLabel(
  entry: TopicCognitiveMemoryEntry,
  translate: (key: string, fallback: string) => string,
) {
  const sourceLabel = memorySourceLabel(entry.source, translate)
  const title = clipText(localizeCognitiveEntryTitle(entry.title, translate), 24)
  const summary = clipText(entry.summary, 24)

  if (!title) {
    return clipText(`${sourceLabel} · ${summary}`, 36)
  }

  if (isGenericReferenceLabel(entry.title, translate) || normalizeInlineLabel(title) === normalizeInlineLabel(summary)) {
    return clipText(`${sourceLabel} · ${summary}`, 36)
  }

  return clipText(`${sourceLabel} · ${title}`, 36)
}

function PulseMemoryLane({
  title,
  entries,
  onUsePrompt,
  tone = 'soft',
  translate,
}: {
  title: string
  entries: TopicCognitiveMemoryEntry[]
  onUsePrompt: (prompt: string) => void
  tone?: 'soft' | 'accent'
  translate: (key: string, fallback: string) => string
}) {
  if (entries.length === 0) return null

  return (
    <div className="mt-2.5 space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">{title}</div>
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onUsePrompt(buildCognitivePrompt(entry, translate))}
          className={`block w-full rounded-[16px] border px-3 py-2.5 text-left transition ${
            tone === 'accent'
              ? 'border-black/8 bg-white hover:border-black/16'
              : 'border-black/6 bg-white/78 hover:border-black/12'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-[11px] font-medium leading-5 text-black">
              {localizeCognitiveEntryTitle(entry.title, translate)}
            </div>
            <div className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-black/34">
              {memorySourceLabel(entry.source, translate)}
            </div>
          </div>
          <p className="mt-1 text-[10px] leading-5 text-black/58">{entry.summary}</p>
        </button>
      ))}
    </div>
  )
}

function WorkbenchPulseCard({
  brief,
  onUsePrompt,
}: {
  brief: TopicResearchBrief | null
  onUsePrompt: (prompt: string) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const report = brief?.session.report ?? null
  const memory = brief?.sessionMemory.summary ?? null
  const pipeline = brief?.pipeline ?? null
  const world = brief?.world ?? null
  const guidanceSummary = brief?.guidance.summary ?? null
  const latestGuidance = brief?.guidance.latestApplication ?? null
  const cognitive = brief?.cognitiveMemory ?? null
  const latestDecision =
    pipeline?.currentStage?.durationDecision ??
    pipeline?.lastRun?.durationDecision ??
    null
  const decisionActionLabel = latestDecision
    ? latestDecision.action === 'advance'
      ? t('workbench.researchDecisionAdvance', 'Advance')
      : latestDecision.action === 'cycle-reset'
        ? t('workbench.researchDecisionCycleReset', 'Cycle reset')
        : t('workbench.researchDecisionStay', 'Stay')
    : ''
  const decisionStageLabel = latestDecision
    ? renderTemplate(
        latestDecision.currentStage === latestDecision.nextStage
          ? t('workbench.researchDecisionStageCurrent', 'Stage {stage}')
          : t('workbench.researchDecisionStageTransition', 'Stage {current} -> {next}'),
        latestDecision.currentStage === latestDecision.nextStage
          ? { stage: latestDecision.currentStage }
          : {
              current: latestDecision.currentStage,
              next: latestDecision.nextStage,
            },
      )
    : ''
  const decisionPrompt = latestDecision
    ? latestDecision.action === 'advance'
      ? renderTemplate(
          t(
            'workbench.researchDecisionPromptAdvance',
            'Explain why stage {current} was ready to move into stage {next}.',
          ),
          {
            current: latestDecision.currentStage,
            next: latestDecision.nextStage,
          },
        )
      : latestDecision.action === 'cycle-reset'
        ? renderTemplate(
            t(
              'workbench.researchDecisionPromptReset',
              'Explain why the sweep reset after stage {current}, and what the next pass should revisit first.',
            ),
            {
              current: latestDecision.currentStage,
            },
          )
        : renderTemplate(
            t(
              'workbench.researchDecisionPromptStay',
              'Explain what still prevents stage {stage} from advancing, and what evidence is missing.',
            ),
            {
              stage: latestDecision.currentStage,
            },
          )
    : ''

  const title =
    cognitive?.focus ||
    world?.summary.currentFocus ||
    memory?.currentFocus ||
    report?.headline ||
    latestDecision?.summary ||
    t('workbench.pulseFallbackTitle', 'The research thread is still taking shape.')
  const summary =
    cognitive?.continuity ||
    world?.summary.continuity ||
    memory?.continuity ||
    report?.summary ||
    latestDecision?.rationale ||
    guidanceSummary?.latestAppliedSummary ||
    ''
  const conversationContract =
    cognitive?.conversationContract ||
    memory?.conversationStyle ||
    ''
  const preserveEntries = cognitive?.projectMemories.slice(0, 2) ?? []
  const adjustEntries = cognitive?.feedbackMemories.slice(0, 2) ?? []
  const referenceEntries = cognitive?.referenceMemories.slice(0, 2) ?? []
  const applyingNext = uniqueStrings(
    [
      latestDecision?.summary,
      latestGuidance?.summary,
      ...adjustEntries.map((entry) => entry.summary),
      guidanceSummary?.latestDirective,
    ],
    3,
  )
  const questions = uniqueStrings(
    [
      ...referenceEntries.map((entry) => entry.summary),
      world?.summary.dominantQuestion,
      ...(report?.openQuestions ?? []),
      ...(pipeline?.globalOpenQuestions ?? []),
      ...(memory?.openQuestions ?? []),
    ],
    2,
  )
  const quickPrompts = uniquePromptActions(
    [
      decisionPrompt
        ? {
            id: `decision:${latestDecision?.currentStage ?? 'unknown'}:${latestDecision?.nextStage ?? 'unknown'}`,
            label: decisionActionLabel || t('workbench.calibrationPromptDecision', 'Stage decision'),
            prompt: decisionPrompt,
          }
        : null,
      ...referenceEntries.map((entry) => ({
        id: `reference:${entry.id}`,
        label: buildCalibrationActionLabel(entry, t),
        prompt: buildCognitivePrompt(entry, t),
      })),
      latestGuidance?.directives[0]
        ? {
            id: `guidance:${latestGuidance.directives[0].instruction}`,
            label: clipText(latestGuidance.directives[0].instruction, 36),
            prompt: latestGuidance.directives[0].instruction,
          }
        : null,
    ],
    2,
  )

  if (
    !brief ||
    (!title &&
      !summary &&
      !conversationContract &&
      preserveEntries.length === 0 &&
      adjustEntries.length === 0 &&
      questions.length === 0)
  ) {
    return null
  }

  return (
    <section
      data-testid="topic-workbench-pulse-card"
      className="rounded-[18px] border border-black/8 bg-[linear-gradient(180deg,#fffdf9_0%,#f8f5ef_100%)] px-3 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
          {t('workbench.calibrationEyebrow', copy('assistant.calibrationEyebrow', 'Current calibration'))}
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/56">
          {brief.session.active
            ? t('workbench.researchStatusRunning', 'Researching')
            : report?.status === 'completed'
              ? t('workbench.researchStatusCompleted', 'Completed')
              : report?.status === 'failed'
                ? t('workbench.researchStatusFailed', 'Interrupted')
                : report?.status === 'paused'
                  ? t('workbench.researchStatusPaused', 'Paused')
                  : t('workbench.researchStatusIdle', 'Idle')}
        </div>
      </div>

      <h3 className="mt-2 text-[14px] font-semibold leading-6 text-black">{title}</h3>
      {summary ? (
        <p className="mt-2 text-[11px] leading-6 text-black/60">{clipText(summary, 220)}</p>
      ) : null}

      {conversationContract ? (
        <div className="mt-2 rounded-[16px] bg-white/82 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.calibrationContract', copy('assistant.calibrationContract', 'How I should continue'))}
          </div>
          <p className="mt-1 text-[10px] leading-5 text-black/58">{clipText(conversationContract, 220)}</p>
        </div>
      ) : null}

      {latestDecision ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/60">
            {decisionActionLabel}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/60">
            {decisionStageLabel}
          </span>
        </div>
      ) : null}

      {applyingNext.length > 0 ? (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.calibrationApplyingNext', copy('assistant.calibrationApplyingNext', 'Applying next'))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {applyingNext.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onUsePrompt(item)}
                className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <PulseMemoryLane
        title={t('workbench.calibrationPreserveTitle', copy('assistant.calibrationPreserve', 'Will preserve'))}
        entries={preserveEntries}
        onUsePrompt={onUsePrompt}
        translate={t}
      />

      <PulseMemoryLane
        title={t('workbench.calibrationAdjustTitle', copy('assistant.calibrationAdjust', 'Will adjust'))}
        entries={adjustEntries}
        onUsePrompt={onUsePrompt}
        tone="accent"
        translate={t}
      />

      {questions.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {questions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onUsePrompt(item)}
              className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      {quickPrompts.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {quickPrompts.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onUsePrompt(item.prompt)}
              className="rounded-full bg-black px-2.5 py-1 text-[10px] text-white transition hover:bg-black/92"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function RightSidebarShell({
  topicId,
  topicTitle,
  researchBrief = null,
  suggestedQuestions,
  selectedEvidence,
  contextSuggestions = [],
  resources = [],
  searchStageWindowMonths,
  onOpenCitation,
  onAction,
  onOpenSearchResult,
}: {
  topicId: string
  topicTitle: string
  researchBrief?: TopicResearchBrief | null
  suggestedQuestions: string[]
  selectedEvidence: EvidencePayload | null
  contextSuggestions?: ContextPill[]
  resources?: ResourceCard[]
  searchStageWindowMonths?: number
  onOpenCitation: (citation: CitationRef) => void
  onAction: (action: SuggestedAction) => void
  onOpenSearchResult: (item: SearchResultItem) => void
}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { preference, t } = useI18n()
  const { copy } = useProductCopy()
  const { state: readingWorkspaceState, getTopicWorkbenchState, patchTopicWorkbenchState } =
    useReadingWorkspace()
  const { favorites, addFavorite, removeFavorite } = useFavorites()
  const scrollBodyRef = useRef<HTMLDivElement | null>(null)
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true
    return isTopicWorkbenchDesktopViewport(window.innerWidth)
  })
  const [assistantState, setAssistantState] = useState<AssistantState>('empty')
  const [modelStatus, setModelStatus] = useState<ModelCapabilitySummary | null>(null)
  const [researchBriefState, setResearchBriefState] = useState<TopicResearchBrief | null>(null)
  const [researchBriefError, setResearchBriefError] = useState<string | null>(null)
  const [researchHours, setResearchHours] = useState(4)
  const [researchSession, setResearchSession] = useState<TopicResearchSessionState | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchStarting, setResearchStarting] = useState(false)
  const [researchStopping, setResearchStopping] = useState(false)
  const [dossierExporting, setDossierExporting] = useState(false)
  const [store, setStore] = useState<TopicChatStore>(() => {
    if (typeof window !== 'undefined') {
      return parseChatStore(window.localStorage.getItem(`topic-chat:${topicId}`))
    }
    const thread = createThread()
    return { currentThreadId: thread.id, threads: [thread] }
  })
  const workbenchState =
    readingWorkspaceState.workbenchByTopic[topicId] ?? getTopicWorkbenchState(topicId)
  const { open, activeTab, historyOpen, contextPills, searchEnabled, thinkingEnabled, style } =
    workbenchState
  const setOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        open: typeof next === 'function' ? next(current.open) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )
  const setActiveTab = useCallback(
    (next: TopicWorkbenchTab | ((current: TopicWorkbenchTab) => TopicWorkbenchTab)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        activeTab: typeof next === 'function' ? next(current.activeTab) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )
  const setHistoryOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        historyOpen: typeof next === 'function' ? next(current.historyOpen) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )
  const setContextPills = useCallback(
    (next: ContextPill[] | ((current: ContextPill[]) => ContextPill[])) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        contextPills: typeof next === 'function' ? next(current.contextPills) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )
  const setSearchEnabled = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        searchEnabled: typeof next === 'function' ? next(current.searchEnabled) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )
  const setThinkingEnabled = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        thinkingEnabled: typeof next === 'function' ? next(current.thinkingEnabled) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )
  const setStyle = useCallback(
    (next: WorkbenchStyle | ((current: WorkbenchStyle) => WorkbenchStyle)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        style: typeof next === 'function' ? next(current.style as WorkbenchStyle) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  const currentThread =
    useMemo(
      () =>
        store.threads.find((thread) => thread.id === store.currentThreadId) ?? store.threads[0],
      [store],
    ) ?? createThread()
  const question = currentThread.draft ?? ''

  const latestAssistantMessage = useMemo(
    () => [...currentThread.messages].reverse().find((message) => message.role === 'assistant') ?? null,
    [currentThread.messages],
  )

  const topicNotes = useMemo(
    () =>
      favorites
        .filter(
          (note) =>
            note.topicId === topicId ||
            note.route?.startsWith(`/topic/${topicId}`) ||
            note.route === `/topic/${topicId}`,
        )
        .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)),
    [favorites, topicId],
  )
  const currentReadingEntry = useMemo(
    () => readingWorkspaceState.trail.find((entry) => entry.topicId === topicId) ?? null,
    [readingWorkspaceState.trail, topicId],
  )
  const readingPathEntries = useMemo(
    () =>
      readingWorkspaceState.trail
        .filter((entry) => entry.topicId === topicId)
        .slice(0, 3)
        .reverse()
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          route: entry.route,
          kind: entry.kind,
        })),
    [readingWorkspaceState.trail, topicId],
  )
  const implicitFocusPill = useMemo(
    () => (currentReadingEntry ? buildPillFromTrailEntry(currentReadingEntry) : null),
    [currentReadingEntry],
  )

  const starterPrompt = copy(
    'assistant.starterPrompt',
    t(
      'workbench.starterPrompt',
      'Start by explaining which nodes, evidence, and branches are most worth reading first.',
    ),
  )
  const drawerButtonLabel = t(
    'workbench.drawerButton',
    copy('assistant.drawerButton', 'Open Workbench'),
  )

  const modelLabel = useMemo(() => {
    if (!modelStatus) return t('workbench.actionModel', copy('assistant.actionModel', 'Model'))
    const textReady = modelStatus.slots.language.apiKeyStatus === 'configured'
    const visionReady = modelStatus.slots.multimodal.apiKeyStatus === 'configured'

    return textReady && visionReady
      ? t('workbench.modelReady', copy('assistant.modelReady', 'Language and vision models are ready'))
      : textReady || visionReady
        ? t('workbench.modelPartial', copy('assistant.modelPartial', 'Models are partially ready'))
        : t('workbench.modelMissing', copy('assistant.modelMissing', 'Configure models'))
  }, [copy, modelStatus, t])
  const compatibleGatewayActive = modelStatus?.slots.language.provider === 'openai_compatible'
  const hasResearchIntel = Boolean(
    researchBriefState?.guidance || researchBriefState?.world || researchBriefState?.cognitiveMemory,
  )

  const updateCurrentThread = (updater: (thread: StoredChatThread) => StoredChatThread) =>
    setStore((current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === current.currentThreadId ? updater(thread) : thread,
      ),
    }))

  const setQuestion = useCallback(
    (next: string | ((current: string) => string)) => {
      setStore((current) => {
        let changed = false

        const threads = current.threads.map((thread) => {
          if (thread.id !== current.currentThreadId) return thread

          const currentDraft = thread.draft ?? ''
          const resolvedDraft =
            typeof next === 'function' ? next(currentDraft) : next

          if (resolvedDraft === currentDraft) {
            return thread
          }

          changed = true
          return {
            ...thread,
            draft: resolvedDraft,
          }
        })

        return changed
          ? {
              ...current,
              threads,
            }
          : current
      })
    },
    [],
  )

  const loadResearchSession = useCallback(
    async (silent = false, force = false) => {
      if (!silent) setResearchLoading(true)

      try {
        const data = await fetchTopicResearchBrief(topicId, { force })
        setResearchBriefState(data)
        setResearchSession(data.session)
        setResearchBriefError(null)

        const nextHours =
          data.session.progress?.durationHours ??
          data.session.task?.options?.durationHours

        if (typeof nextHours === 'number' && Number.isFinite(nextHours)) {
          setResearchHours((current) => {
            const normalized = Math.min(48, Math.max(1, Math.round(nextHours)))
            return normalized === current ? current : normalized
          })
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : t(
                'workbench.researchIntelErrorMessage',
                'The workbench could not refresh the topic intelligence just now. Your thread is still safe and you can retry.',
              )

        setResearchBriefError(message)
        if (!silent) {
          setResearchBriefState(null)
          setResearchSession(null)
        }
      } finally {
        if (!silent) setResearchLoading(false)
      }
    },
    [t, topicId],
  )

  async function startResearchSession() {
    setResearchStarting(true)

    try {
      const data = await apiPost<
        TopicResearchSessionState & { result?: unknown },
        { durationHours: number }
      >(`/api/topics/${topicId}/research-session`, {
        durationHours: researchHours,
      })

      setResearchSession({
        task: data.task,
        progress: data.progress,
        report: data.report,
        active: data.active,
        strategy: data.strategy,
      })
      setResearchBriefError(null)
      setResearchBriefState((current) =>
        current
          ? {
              ...current,
              session: {
                task: data.task,
                progress: data.progress,
                report: data.report,
                active: data.active,
                strategy: data.strategy,
              },
            }
          : current,
      )
      setOpen(true)
      setActiveTab('assistant')
    } finally {
      setResearchStarting(false)
    }
  }

  async function stopResearchSession() {
    if (!researchSession?.task?.id) return

    setResearchStopping(true)

    try {
      await apiPost<TopicResearchSessionState>(`/api/topics/${topicId}/research-session/stop`, {})
      setResearchBriefError(null)
      invalidateTopicResearchBrief(topicId)
      await loadResearchSession(true, true)
    } finally {
      setResearchStopping(false)
    }
  }

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const response = await fetchModelCapabilitySummary()
        if (alive) setModelStatus(response)
      } catch {
        if (alive) setModelStatus(null)
      }
    }

    void load()

    const onUpdate = () => {
      invalidateModelCapabilitySummary()
      void fetchModelCapabilitySummary({ force: true })
        .then((response) => {
          if (alive) setModelStatus(response)
        })
        .catch(() => {
          if (alive) setModelStatus(null)
        })
    }
    window.addEventListener(MODEL_CONFIG_UPDATED_EVENT, onUpdate)

    return () => {
      alive = false
      window.removeEventListener(MODEL_CONFIG_UPDATED_EVENT, onUpdate)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setStore(parseChatStore(window.localStorage.getItem(`topic-chat:${topicId}`)))
    setAssistantState('empty')
    setResearchStarting(false)
    setResearchStopping(false)
  }, [topicId])

  useEffect(() => {
    if (typeof window === 'undefined' || currentThread.messages.length > 0) return

    const persisted = parseChatStore(window.localStorage.getItem(`topic-chat:${topicId}`))
    const persistedCurrent =
      persisted.threads.find((thread) => thread.id === persisted.currentThreadId) ??
      persisted.threads[0]

    if (persistedCurrent?.messages.length > 0 || persistedCurrent?.draft?.trim()) {
      setStore(persisted)
    }
  }, [currentThread.messages.length, topicId])

  useEffect(() => {
    if (!researchBrief || researchBrief.topicId !== topicId) return
    primeTopicResearchBrief(researchBrief)
    setResearchBriefState(researchBrief)
    setResearchSession(researchBrief.session)
    setResearchBriefError(null)
  }, [researchBrief, topicId])

  useEffect(() => {
    const shouldOpenAssistant =
      searchParams.get('workbench') === 'assistant' || searchParams.get('focus') === 'research'

    if (!shouldOpenAssistant) return

    setOpen(true)
    setActiveTab('assistant')

    const next = new URLSearchParams(searchParams)
    next.delete('workbench')
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (researchBrief?.topicId === topicId) return
    void loadResearchSession()
  }, [loadResearchSession, researchBrief, topicId])

  useEffect(() => {
    if (!researchSession?.active && researchSession?.report?.status !== 'running') return

    const timer = window.setInterval(() => {
      void loadResearchSession(true, true)
    }, 15000)

    return () => window.clearInterval(timer)
  }, [loadResearchSession, researchSession?.active, researchSession?.report?.status])

  useEffect(() => {
    const statusMessage = buildResearchStatusMessage(
      researchSession,
      researchBriefState,
      preference.primary,
      (key, fallback) => t(key, fallback),
    )
    if (!statusMessage) return

    updateCurrentThread((thread) => {
      const existingStatusMessage = [...thread.messages]
        .reverse()
        .find(
          (message) =>
            message.role === 'assistant' &&
            typeof message.id === 'string' &&
            message.id.startsWith('research:'),
        )

      if (
        existingStatusMessage?.id === statusMessage.id &&
        existingStatusMessage.content === statusMessage.content
      ) {
        return thread
      }

      return {
        ...thread,
        updatedAt: new Date().toISOString(),
        messages: [
          ...thread.messages.filter(
            (message) =>
              !(
                message.role === 'assistant' &&
                typeof message.id === 'string' &&
                message.id.startsWith('research:')
              ),
          ),
          statusMessage,
        ],
      }
    })
  }, [
    currentThread.messages,
    preference.primary,
    researchBriefState,
    researchSession,
    t,
  ])

  useEffect(() => {
    const queued = consumeQueuedTopicContexts(topicId)
    if (queued.length === 0) return

    setOpen(true)
    setActiveTab('assistant')
    setContextPills((current) => {
      const seen = new Set(current.map((item) => item.id))
      const next = [...current]

      queued.forEach((entry) => {
        if (seen.has(entry.pill.id)) return
        seen.add(entry.pill.id)
        next.unshift(entry.pill)
      })

      return next
    })

    const seededQuestion = queued.map((entry) => entry.question).find(Boolean)
    if (seededQuestion) {
      setQuestion((current) => current.trim() || seededQuestion || '')
    }
  }, [setQuestion, topicId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(`topic-chat:${topicId}`, JSON.stringify(store))
  }, [store, topicId])

  useEffect(() => {
    if (!selectedEvidence) return
    setOpen(true)
    const next = buildPillFromEvidence(selectedEvidence)
    setContextPills((current) =>
      current.some((item) => item.id === next.id) ? current : [next, ...current],
    )
  }, [selectedEvidence])

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ContextPill>
      if (!customEvent.detail) return
      setOpen(true)
      setContextPills((current) =>
        current.some((item) => item.id === customEvent.detail.id)
          ? current
          : [customEvent.detail, ...current],
      )
    }

    window.addEventListener(TOPIC_CONTEXT_ADD_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(TOPIC_CONTEXT_ADD_EVENT, handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      if (!customEvent.detail) return
      setOpen(true)
      setActiveTab('assistant')
      setQuestion((current) => current.trim() || customEvent.detail)
    }

    window.addEventListener(TOPIC_QUESTION_SEED_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(TOPIC_QUESTION_SEED_EVENT, handler as EventListener)
  }, [setQuestion])

  useEffect(() => {
    const openWorkbench = () => {
      setOpen(true)
      setActiveTab('assistant')
    }

    window.addEventListener(TOPIC_WORKBENCH_OPEN_EVENT, openWorkbench)
    return () =>
      window.removeEventListener(TOPIC_WORKBENCH_OPEN_EVENT, openWorkbench)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHistoryOpen(false)
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const syncViewport = () =>
      setIsDesktopViewport(isTopicWorkbenchDesktopViewport(window.innerWidth))
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  useEffect(() => {
    if (currentThread.messages.length === 0 && !question.trim()) setAssistantState('empty')
    else if (question.trim()) setAssistantState('drafting')
  }, [currentThread.messages.length, question])

  useEffect(() => {
    if (open) return
    setHistoryOpen(false)
  }, [open])

  useEffect(() => {
    if (!open || historyOpen) return
    const body = scrollBodyRef.current
    if (!body) return

    const frame = window.requestAnimationFrame(() => {
      body.scrollTo({ top: body.scrollHeight, behavior: activeTab === 'assistant' ? 'smooth' : 'auto' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeTab, currentThread.messages.length, historyOpen, open, topicNotes.length])

  const appendMessages = (
    messages: StoredChatMessage[],
    options?: { preserveComposer?: boolean },
  ) => {
    updateCurrentThread((thread) => {
      const nextMessages = [...thread.messages, ...messages]
      return {
        ...thread,
        title:
          nextMessages.find((item) => item.role === 'user')?.content.slice(0, 48) ||
          thread.title,
        updatedAt: new Date().toISOString(),
        messages: nextMessages,
      }
    })

    if (!options?.preserveComposer) {
      setQuestion('')
      setAssistantState('empty')
      setHistoryOpen(false)
    }
  }

  const startNewChat = () => {
    const nextThread = createThread(
      t('workbench.actionNewChat', copy('assistant.actionNewChat', 'New Chat')),
    )
    setStore((current) => ({
      currentThreadId: nextThread.id,
      threads: [nextThread, ...current.threads],
    }))
    setQuestion('')
    setAssistantState('empty')
    setHistoryOpen(false)
  }

  const captureSelectionPill = () => {
    const text = window.getSelection?.()?.toString().trim()
    if (!text) return

    setContextPills((current) => [
      {
        id: `selection:${Date.now()}`,
        kind: 'selection',
        label: text.length > 42 ? `${text.slice(0, 42)}...` : text,
        description: text,
        route: `${window.location.pathname}${window.location.search}`,
      },
      ...current,
    ])
  }

  function saveNotebookEntry(entry: FavoriteExcerpt) {
    addFavorite(entry)
    setOpen(true)
    setActiveTab('notes')
  }

  function saveAssistantMessage(message: StoredChatMessage) {
    saveNotebookEntry(
      buildAssistantNotebookEntry({
        topicId,
        topicTitle,
        language: preference.primary,
        message,
        fallbackTitle: t('workbench.notebookEntryTitle', 'AI Topic Briefing'),
        evidencePrefix: t('workbench.notebookCitationsPrefix', 'Related evidence: '),
        sourceLabel: t('workbench.notebookSourceWorkbench', 'Conversation workbench'),
        summaryTemplate: t('workbench.notebookSummaryEvidenceTemplate', 'Built around {labels}'),
        summaryFallback: t('workbench.notebookSummaryMainline', 'Built around the current topic mainline'),
      }),
    )
  }

  function saveCurrentEvidence() {
    if (!selectedEvidence) return
    saveNotebookEntry(
      buildEvidenceNotebookEntry({
        topicId,
        topicTitle,
        evidence: selectedEvidence,
        figureSourceLabel: t('workbench.notebookSourceEvidenceCard', 'Evidence card'),
        textSourceLabel: t('workbench.notebookSourceEvidenceText', 'Body evidence'),
      }),
    )
  }

  function exportTopicNotes(format: 'markdown' | 'json') {
    if (topicNotes.length === 0) return false

    const locale = resolveLanguageLocale(preference.primary)
    const title = renderTemplate(
      t('workbench.exportNotesTitle', '{topic} Research Notes'),
      { topic: topicTitle },
    )
    const stem = slugifyNotebookFilename(title)
    const content =
      format === 'markdown'
        ? buildNotebookMarkdown(topicNotes, { [topicId]: topicTitle }, { title, locale })
        : buildNotebookJson(topicNotes)

    downloadNotebookTextFile(
      format === 'markdown' ? `${stem}.md` : `${stem}.json`,
      content,
      format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
    )
    return true
  }

  async function exportResearchDossier() {
    if (dossierExporting) return false

    setDossierExporting(true)

    try {
      const locale = resolveLanguageLocale(preference.primary)
      const bundle = await apiGet<TopicResearchExportBundle>(`/api/topics/${topicId}/export-bundle`)
      const title = renderTemplate(
        t('workbench.exportDossierTitle', '{topic} Research Dossier'),
        { topic: topicTitle },
      )
      const stem = slugifyNotebookFilename(title)

      downloadNotebookTextFile(
        `${stem}.md`,
        buildResearchDossierMarkdown(bundle, topicNotes, { title, locale }),
        'text/markdown;charset=utf-8',
      )
      return true
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : t(
              'workbench.exportDossierFailed',
              copy('assistant.exportDossierFailed', 'Failed to export the research dossier. Please try again later.'),
            )
      window.alert(message)
      return false
    } finally {
      setDossierExporting(false)
    }
  }

  function exportResearchHighlights() {
    if (topicNotes.length === 0) return false

    const locale = resolveLanguageLocale(preference.primary)
    const title = renderTemplate(
      t('workbench.exportHighlightsTitle', '{topic} Research Highlights'),
      { topic: topicTitle },
    )
    const stem = slugifyNotebookFilename(title)

    downloadNotebookTextFile(
      `${stem}.md`,
      buildResearchHighlightsMarkdown(topicNotes, { [topicId]: topicTitle }, { title, locale }),
      'text/markdown;charset=utf-8',
    )
    return true
  }

  function openNotebookEntry(note: FavoriteExcerpt) {
    if (note.route) {
      navigate(note.route)
      return
    }

    if (note.topicId) {
      navigate(`/topic/${note.topicId}`)
    }
  }

  async function handleWorkbenchAction(action: TopicWorkbenchAction | undefined) {
    if (!action) return

    setOpen(true)
    if (action.targetTab) {
      setActiveTab(action.targetTab)
    }

    if (action.kind === 'start-research' || action.kind === 'stop-research') {
      await loadResearchSession(true)
      return
    }

    if (action.kind === 'export-dossier') {
      await exportResearchDossier()
      return
    }

    if (action.kind === 'export-highlights') {
      const exported = exportResearchHighlights()
      if (!exported) {
        await exportResearchDossier()
      }
      return
    }

    const exported = exportTopicNotes('markdown')
    if (!exported) {
      await exportResearchDossier()
    }
  }

  async function sendQuestion(nextQuestion: string) {
    const trimmed = nextQuestion.trim()
    if (!trimmed) return

    appendMessages([buildMessage('user', trimmed)])
    setAssistantState('submitting')
    const stateTransitionTimer = window.setTimeout(
      () => setAssistantState(searchEnabled ? 'retrieving' : 'thinking'),
      120,
    )

    const explicitContextItems = implicitFocusPill
      ? contextPills.filter((item) => item.id !== implicitFocusPill.id)
      : contextPills
    const focusBlock = implicitFocusPill
      ? `Current reading focus:\n- ${implicitFocusPill.label}${
          implicitFocusPill.description ? `: ${implicitFocusPill.description}` : ''
        }\n\n`
      : ''
    const contextBlock =
      explicitContextItems.length > 0
        ? `Workbench context:\n${explicitContextItems
            .map(
              (item) =>
                `- ${item.label}${item.description ? `: ${item.description}` : ''}`,
            )
            .join('\n')}\n\n`
        : ''

    try {
      const data = await apiPost<TopicChatResponse, { question: string }>(
        `/api/topics/${topicId}/chat`,
        {
          question: `${focusBlock}${contextBlock}${trimmed}\n\nWorkbench controls:\nresponse_style=${style}\nreasoning=${thinkingEnabled ? 'enabled' : 'disabled'}\nretrieval=${searchEnabled ? 'enabled' : 'disabled'}`,
        },
      )

      setAssistantState(
        data.notice?.code === 'missing_key' || data.notice?.code === 'invalid_key'
          ? 'auth-required'
          : data.guidanceReceipt
            ? 'answer-ready'
            : data.citations.length === 0
            ? 'partial-grounding'
            : 'answer-ready',
      )

      appendMessages([
        buildMessage('assistant', data.answer, {
          id: data.messageId,
          citations: data.citations,
          suggestedActions: data.suggestedActions,
          guidanceReceipt: data.guidanceReceipt,
          notice: data.notice,
        }),
      ])

      if (data.workbenchAction) {
        await handleWorkbenchAction(data.workbenchAction)
      } else if (data.guidanceReceipt) {
        invalidateTopicResearchBrief(topicId)
        await loadResearchSession(true, true)
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      setAssistantState(apiError?.statusCode === 429 ? 'rate-limited' : 'hard-error')

      const notice: OmniIssue = {
        code: 'provider_error',
        title: t('workbench.requestFailedTitle', 'Request Failed'),
        message: t(
          'workbench.requestFailedMessage',
          'The workbench keeps your draft, context, and history. Check model settings and try again.',
        ),
      }

      appendMessages([
        buildMessage(
          'assistant',
          copy(
            'assistant.requestFailed',
            t(
              'workbench.requestFailedReply',
              'This request did not complete, but the workbench, draft, and context are still here.',
            ),
          ),
          { notice },
        ),
      ], { preserveComposer: true })
      setQuestion(trimmed)
    } finally {
      window.clearTimeout(stateTransitionTimer)
    }
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="topic-workbench-open"
          className="fixed bottom-4 right-4 z-[82] inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-[13px] text-black shadow-[0_18px_36px_rgba(15,23,42,0.10)] transition hover:border-black/16 hover:shadow-[0_22px_40px_rgba(15,23,42,0.12)]"
        >
          <MessageSquare className="h-4 w-4" />
          {drawerButtonLabel}
        </button>
      ) : null}

      {open && !isDesktopViewport ? (
        <button
          type="button"
          className="fixed inset-0 z-[82] bg-black/10 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          aria-label={t('workbench.actionCollapse', copy('assistant.actionCollapse', 'Collapse Workbench'))}
        />
      ) : null}

      <aside
        data-testid="right-sidebar-shell"
        data-topic-workbench="true"
        aria-hidden={!open}
        className={`fixed bottom-2 right-2 top-2 z-[83] flex w-[min(92vw,376px)] flex-col overflow-hidden rounded-[24px] border border-black/8 bg-[#faf9f7] shadow-[0_24px_60px_rgba(15,23,42,0.12)] transition 2xl:w-[392px] ${
          open
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none invisible translate-x-8 opacity-0'
        }`}
        style={
          isDesktopViewport
            ? {
                width: `${TOPIC_WORKBENCH_DESKTOP_WIDTH}px`,
                maxWidth: `${TOPIC_WORKBENCH_DESKTOP_WIDTH}px`,
              }
            : undefined
        }
      >
        <div data-testid="topic-workbench" className="absolute left-0 top-0 h-px w-px" aria-hidden="true" />
        <AssistantHeader
          modelLabel={modelLabel}
          onNewChat={startNewChat}
          onToggleHistory={() => setHistoryOpen((current) => !current)}
          onOpenSettings={() => navigate('/settings?tab=models')}
          onToggleCollapse={() => setOpen(false)}
          collapsed={!open}
        />

        <div className="border-b border-black/6 bg-white/92 px-2.5 pb-2 pt-2 backdrop-blur">
          <div className="flex items-center justify-between gap-1.5">
            <SidebarToolTabs
              activeTab={activeTab}
              onChange={(tab) => {
                setActiveTab(tab)
                setHistoryOpen(false)
              }}
            />
            <div className="flex items-center gap-1.5">
              {(researchSession?.active || compatibleGatewayActive) && (
                <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/56">
                  {researchSession?.active
                    ? t('workbench.researchStatusRunning', 'Researching')
                    : t('workbench.compatibleMode', 'Compatible mode')}
                </span>
              )}
              <div className="max-w-[128px] truncate rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/50">
                {topicTitle}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={scrollBodyRef}
          data-testid="topic-workbench-scroll"
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {historyOpen ? (
            <div className="absolute inset-x-2.5 top-2.5 z-10 rounded-[20px] border border-black/8 bg-white/98 p-3 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur">
              <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-black/36">
                {t('workbench.actionHistory', copy('assistant.actionHistory', 'History'))}
              </div>
              <div className="space-y-2">
                {store.threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() =>
                      setStore((current) => ({ ...current, currentThreadId: thread.id }))
                    }
                    className={`block w-full rounded-[16px] px-3 py-3 text-left text-sm transition ${
                      thread.id === store.currentThreadId
                        ? 'bg-white text-black shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
                        : 'bg-[var(--surface-soft)] text-black/58 hover:bg-white/70'
                    }`}
                  >
                    <div className="truncate">
                      {thread.messages.length === 0 && !thread.title
                        ? t('workbench.actionNewChat', 'New Chat')
                        : thread.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={historyOpen ? 'pointer-events-none opacity-15 blur-[1px]' : ''}>
            {activeTab === 'assistant' ? (
              <div className="space-y-2">
                <ResearchSessionCard
                  session={researchSession}
                  brief={researchBriefState}
                  durationHours={researchHours}
                  onDurationHoursChange={setResearchHours}
                  onStart={() => void startResearchSession()}
                  onStop={() => void stopResearchSession()}
                  starting={researchStarting || researchLoading}
                  stopping={researchStopping}
                  onUsePrompt={setQuestion}
                />

                <CurrentReadingFocusCard
                  entry={currentReadingEntry}
                  onNavigate={(route) => navigate(route)}
                />

                <ReadingPathCard
                  entries={readingPathEntries}
                  onNavigate={(route) => navigate(route)}
                />

                <ResearchIntelPanel
                  loading={researchLoading}
                  errorMessage={researchBriefError}
                  ready={hasResearchIntel}
                  onRetry={() => void loadResearchSession()}
                  onUsePrompt={setQuestion}
                >
                  <GuidanceLedgerCard
                    guidance={researchBriefState?.guidance ?? null}
                    onUsePrompt={setQuestion}
                  />

                  <ResearchWorldCard
                    world={researchBriefState?.world ?? null}
                    onUsePrompt={setQuestion}
                  />

                  <WorkbenchPulseCard
                    brief={researchBriefState}
                    onUsePrompt={setQuestion}
                  />
                </ResearchIntelPanel>

                {currentThread.messages.length === 0 ? (
                  <AssistantEmptyState
                    starterPrompt={starterPrompt}
                    suggestedQuestions={suggestedQuestions}
                    brief={researchBriefState}
                    onUsePrompt={setQuestion}
                  />
                ) : (
                  <ConversationThread
                    messages={currentThread.messages}
                    onOpenCitation={onOpenCitation}
                    onAction={(action) =>
                      ((action.action === 'explain' ||
                        action.action === 'compare' ||
                        action.action === 'summarize') &&
                      !action.targetId
                        ? void sendQuestion(action.label)
                        : onAction(action))
                    }
                    onUsePrompt={setQuestion}
                    onSaveMessage={saveAssistantMessage}
                  />
                )}
              </div>
            ) : activeTab === 'notes' ? (
              <NotebookPanel
                notes={topicNotes}
                hasSelectedEvidence={Boolean(selectedEvidence)}
                hasAssistantInsight={Boolean(latestAssistantMessage)}
                exportingDossier={dossierExporting}
                onCaptureSelectedEvidence={saveCurrentEvidence}
                onCaptureAssistantInsight={() => latestAssistantMessage && saveAssistantMessage(latestAssistantMessage)}
                onOpenNotebook={() => navigate(`/favorites?topic=${topicId}`)}
                onOpenNote={openNotebookEntry}
                onRemoveNote={removeFavorite}
                onExportDossier={() => void exportResearchDossier()}
                onExportHighlights={exportResearchHighlights}
                onExportMarkdown={() => exportTopicNotes('markdown')}
                onExportJson={() => exportTopicNotes('json')}
              />
            ) : activeTab === 'similar' ? (
              <SearchPanel
                topicId={topicId}
                stageWindowMonths={searchStageWindowMonths}
                onOpenResult={onOpenSearchResult}
                onAddContext={(item) =>
                  setContextPills((current) =>
                    current.some((pill) => pill.id === `search:${item.kind}:${item.id}`)
                      ? current
                      : [buildPillFromSearch(item), ...current],
                  )
                }
                onAskAboutResult={(item) => {
                  setActiveTab('assistant')
                  setContextPills((current) =>
                    current.some((pill) => pill.id === `search:${item.kind}:${item.id}`)
                      ? current
                      : [buildPillFromSearch(item), ...current],
                  )
                  setQuestion(
                    renderTemplate(
                      t(
                        'workbench.followUpPromptTemplate',
                        'Put “{title}” back into the current topic mainline and explain what it solves, which judgment it supports, and what evidence is still missing.',
                      ),
                      { title: item.title },
                    ),
                  )
                }}
              />
            ) : (
              <ResourcesPanel
                contextPills={contextPills}
                resources={resources}
                selectedEvidence={selectedEvidence}
                onSaveSelectedEvidence={selectedEvidence ? saveCurrentEvidence : undefined}
              />
            )}
          </div>
        </div>

        <div className="border-t border-black/6 bg-white/96 p-2 backdrop-blur">
          <ContextTray
            items={contextPills}
            suggestions={activeTab === 'assistant' ? contextSuggestions : []}
            onAdd={(pill) =>
              setContextPills((current) =>
                current.some((item) => item.id === pill.id)
                  ? current
                  : [pill, ...current],
              )
            }
            onCaptureSelection={activeTab === 'assistant' ? captureSelectionPill : undefined}
            onRemove={(id) =>
              setContextPills((current) => current.filter((item) => item.id !== id))
            }
          />

          <GroundedComposer
            value={question}
            onChange={setQuestion}
            onSubmit={() => void sendQuestion(question)}
            searchEnabled={searchEnabled}
            onToggleSearch={() => setSearchEnabled((current) => !current)}
            thinkingEnabled={thinkingEnabled}
            onToggleThinking={() => setThinkingEnabled((current) => !current)}
            style={style}
            onStyleChange={setStyle}
            disabled={!question.trim()}
            assistantState={assistantState}
          />
        </div>
      </aside>
    </>
  )
}
