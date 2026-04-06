import {
  collectTopicGenerationContext,
} from '../generation/research-judgment-store'
import {
  loadTopicGenerationMemory,
  type GenerationSubjectType,
  type GenerationMemoryContext,
} from '../generation/memory-store'
import { loadTopicResearchReport, type ResearchRunReport } from './research-report'
import {
  collectTopicSessionMemoryContext,
  retrieveTopicSessionMemoryContext,
  type TopicSessionMemoryContext,
  type TopicSessionMemoryRecallContext,
} from './topic-session-memory'
import {
  compactTopicGuidanceContext,
  loadTopicGuidanceLedger,
  type TopicGuidanceLedgerState,
} from './topic-guidance-ledger'
import { syncTopicResearchWorldSnapshot } from './research-world'

export type TopicCognitiveMemoryKind = 'project' | 'feedback' | 'reference'

export interface TopicCognitiveMemoryEntry {
  id: string
  kind: TopicCognitiveMemoryKind
  title: string
  summary: string
  source: 'generation' | 'session' | 'guidance' | 'report' | 'world'
  updatedAt: string | null
}

export interface TopicCognitiveMemoryPack {
  focus: string
  continuity: string
  conversationContract: string
  projectMemories: TopicCognitiveMemoryEntry[]
  feedbackMemories: TopicCognitiveMemoryEntry[]
  referenceMemories: TopicCognitiveMemoryEntry[]
}

type TopicCognitiveSummaryArgs = {
  sessionMemory: TopicSessionMemoryContext | TopicSessionMemoryRecallContext
  generationContext: GenerationMemoryContext
  report: ResearchRunReport | null
  world: Awaited<ReturnType<typeof syncTopicResearchWorldSnapshot>> | null
}

function clipText(value: string | null | undefined, maxLength = 180) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function normalizeKey(value: string) {
  return clipText(value, 220)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function createEntry(
  kind: TopicCognitiveMemoryKind,
  title: string,
  summary: string,
  source: TopicCognitiveMemoryEntry['source'],
  updatedAt: string | null,
): TopicCognitiveMemoryEntry | null {
  const normalizedTitle = clipText(title, 72)
  const normalizedSummary = clipText(summary, 220)
  if (!normalizedSummary) return null

  return {
    id: `${kind}:${source}:${normalizeKey(`${normalizedTitle} ${normalizedSummary}`)}`,
    kind,
    title: normalizedTitle || normalizedSummary.slice(0, 48),
    summary: normalizedSummary,
    source,
    updatedAt,
  }
}

function uniqueEntries(entries: Array<TopicCognitiveMemoryEntry | null | undefined>, limit = 6) {
  const seen = new Set<string>()
  const output: TopicCognitiveMemoryEntry[] = []

  for (const entry of entries) {
    if (!entry) continue
    const key = normalizeKey(`${entry.kind} ${entry.summary}`)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(entry)
    if (output.length >= limit) break
  }

  return output
}

function summarizeFocus(args: TopicCognitiveSummaryArgs) {
  return (
    clipText(args.sessionMemory.summary.currentFocus, 180) ||
    clipText(args.world?.summary.currentFocus, 180) ||
    clipText(args.report?.headline, 180) ||
    clipText(args.generationContext.continuityThreads[0], 180) ||
    clipText(args.generationContext.artifactIndex[0]?.headline, 180)
  )
}

function summarizeContinuity(args: TopicCognitiveSummaryArgs) {
  return (
    clipText(args.sessionMemory.summary.continuity, 180) ||
    clipText(args.world?.summary.continuity, 180) ||
    clipText(args.report?.summary, 180) ||
    clipText(args.generationContext.judgmentLedger[0], 180) ||
    clipText(args.generationContext.artifactIndex[0]?.summary, 180)
  )
}

export function buildTopicCognitiveMemory(args: {
  generationContext: GenerationMemoryContext
  sessionMemory: TopicSessionMemoryContext | TopicSessionMemoryRecallContext
  guidance: TopicGuidanceLedgerState | null
  report: ResearchRunReport | null
  world?: Awaited<ReturnType<typeof syncTopicResearchWorldSnapshot>> | null
}): TopicCognitiveMemoryPack {
  const summaryArgs: TopicCognitiveSummaryArgs = {
    sessionMemory: args.sessionMemory,
    generationContext: args.generationContext,
    report: args.report,
    world: args.world ?? null,
  }
  const compactGuidance = compactTopicGuidanceContext(args.guidance, 6)
  const projectMemories = uniqueEntries(
    [
      createEntry(
        'project',
        'Current Focus',
        args.sessionMemory.summary.currentFocus,
        'session',
        args.sessionMemory.updatedAt,
      ),
      createEntry(
        'project',
        'Continuity Thread',
        args.sessionMemory.summary.continuity,
        'session',
        args.sessionMemory.updatedAt,
      ),
      ...args.sessionMemory.summary.establishedJudgments.map((item) =>
        createEntry('project', 'Established Judgment', item, 'session', args.sessionMemory.updatedAt),
      ),
      ...args.generationContext.judgmentLedger.map((item) =>
        createEntry('project', 'Generation Judgment', item, 'generation', null),
      ),
      ...args.generationContext.evolutionChains.map((item) =>
        createEntry('project', 'Judgment Evolution', item, 'generation', null),
      ),
      ...args.generationContext.artifactIndex
        .filter((item) => item.kind === 'node')
        .map((item) =>
          createEntry(
            'project',
            `Node Article / ${item.title}`,
            `${item.headline}. ${item.summary}`,
            'generation',
            item.updatedAt,
          ),
        ),
      ...(args.report?.keyMoves ?? []).map((item) =>
        createEntry('project', 'Research Move', item, 'report', args.report?.updatedAt ?? null),
      ),
      ...(args.world?.claims ?? []).map((claim) =>
        createEntry('project', 'World Claim', claim.statement, 'world', args.world?.updatedAt ?? null),
      ),
      createEntry('project', 'World Thesis', args.world?.summary.thesis ?? '', 'world', args.world?.updatedAt ?? null),
    ],
    8,
  )

  const feedbackMemories = uniqueEntries(
    [
      ...compactGuidance.activeDirectives.map((directive) =>
        createEntry(
          'feedback',
          `${directive.directiveType} / ${directive.scopeLabel || 'topic'}`,
          directive.effectSummary || directive.instruction,
          'guidance',
          compactGuidance.latestApplication?.appliedAt ?? null,
        ),
      ),
      createEntry(
        'feedback',
        'Conversation Contract',
        args.sessionMemory.summary.conversationStyle,
        'session',
        args.sessionMemory.updatedAt,
      ),
      ...args.generationContext.reviewerWatchpoints.map((item) =>
        createEntry('feedback', 'Reviewer Watchpoint', item, 'generation', null),
      ),
      createEntry(
        'feedback',
        'Latest Guidance Application',
        compactGuidance.latestApplication?.summary ?? '',
        'guidance',
        compactGuidance.latestApplication?.appliedAt ?? null,
      ),
      ...(args.world?.critiques ?? []).map((critique) =>
        createEntry('feedback', 'World Critique', critique.summary, 'world', args.world?.updatedAt ?? null),
      ),
    ],
    8,
  )

  const recalledEvents =
    'recalledEvents' in args.sessionMemory ? args.sessionMemory.recalledEvents : []

  const referenceMemories = uniqueEntries(
    [
      ...args.sessionMemory.summary.openQuestions.map((item) =>
        createEntry('reference', 'Open Question', item, 'session', args.sessionMemory.updatedAt),
      ),
      ...args.generationContext.openQuestions.map((item) =>
        createEntry('reference', 'Generation Question', item, 'generation', null),
      ),
      ...args.generationContext.evidenceWatchpoints.map((item) =>
        createEntry('reference', 'Evidence Watchpoint', item, 'generation', null),
      ),
      ...args.generationContext.artifactIndex
        .filter((item) => item.kind === 'paper')
        .map((item) =>
          createEntry(
            'reference',
            `Paper Article / ${item.title}`,
            `${item.summary}. ${item.keyArguments[0] ?? item.standfirst}`,
            'generation',
            item.updatedAt,
          ),
        ),
      ...(args.report?.openQuestions ?? []).map((item) =>
        createEntry('reference', 'Report Question', item, 'report', args.report?.updatedAt ?? null),
      ),
      ...recalledEvents.map((event) =>
        createEntry('reference', event.headline || 'Recalled Event', event.summary, 'session', event.createdAt),
      ),
      ...(args.world?.agenda ?? []).map((item) =>
        createEntry('reference', 'Agenda', item.title, 'world', args.world?.updatedAt ?? null),
      ),
      ...(args.world?.questions ?? []).map((item) =>
        createEntry('reference', 'World Question', item.question, 'world', args.world?.updatedAt ?? null),
      ),
      ...(args.world?.highlights ?? []).map((item) =>
        createEntry('reference', item.title, item.detail, 'world', args.world?.updatedAt ?? null),
      ),
    ],
    8,
  )

  return {
    focus: summarizeFocus(summaryArgs),
    continuity: summarizeContinuity(summaryArgs),
    conversationContract:
      clipText(args.sessionMemory.summary.conversationStyle, 180) ||
      'Answer like the same scholar who has been shaping this topic, not like a detached generic assistant.',
    projectMemories,
    feedbackMemories,
    referenceMemories,
  }
}

export async function collectTopicCognitiveMemory(args: {
  topicId: string
  subjectType?: GenerationSubjectType
  subjectId?: string
  question?: string
  recentLimit?: number
  includeWorld?: boolean
}) {
  const memory = await loadTopicGenerationMemory(args.topicId)
  const [generationContext, report, guidance, sessionMemory, world] = await Promise.all([
    collectTopicGenerationContext(args.topicId, memory, {
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      limit: 8,
    }),
    loadTopicResearchReport(args.topicId),
    loadTopicGuidanceLedger(args.topicId),
    args.question
      ? retrieveTopicSessionMemoryContext(args.topicId, {
          query: args.question,
          recentLimit: args.recentLimit ?? 6,
        })
      : collectTopicSessionMemoryContext(args.topicId, {
          recentLimit: args.recentLimit ?? 6,
        }),
    args.includeWorld ? syncTopicResearchWorldSnapshot(args.topicId) : Promise.resolve(null),
  ])

  return buildTopicCognitiveMemory({
    generationContext,
    sessionMemory,
    guidance,
    report,
    world,
  })
}

export const __testing = {
  buildTopicCognitiveMemory,
}
