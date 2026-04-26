import { enhancedTaskScheduler } from '../enhanced-scheduler'
import type { TopicChatResponse, TopicWorkbenchAction } from '../omni/types'
import {
  updateTopicGuidanceDirective,
  type TopicGuidanceReceipt,
} from './topic-guidance-ledger'

type SupportedTopicChatCommand =
  | { action: 'start-research'; durationHours: number }
  | { action: 'stop-research' }
  | { action: 'export'; exportKind: 'dossier' | 'highlights' | 'notes' }

const EN_QUESTION_RE = /\b(how|what|why|explain)\b/iu
const ZH_QUESTION_RE = /如何|怎么|为什么|说明/u
const EN_START_RE =
  /^\s*(?:please\s+|kindly\s+)?(?:start|resume|continue|restart|run|launch)\b/iu
const EN_STOP_RE = /^\s*(?:please\s+|kindly\s+)?(?:stop|pause|halt|end)\b/iu
const EN_EXPORT_RE = /^\s*(?:please\s+|kindly\s+)?export\b/iu
const ZH_START_RE =
  /^\s*(?:请|麻烦|帮我|现在|立即|马上)?\s*(?:开始|启动|继续|恢复|重启|发起|安排)(?:一下|一轮|本轮)?(?:持续)?(?:研究|这个主题的研究)?/u
const ZH_STOP_RE =
  /^\s*(?:请|麻烦|帮我)?\s*(?:暂停|停止|结束|收束)(?:一下|当前|本轮)?(?:研究|持续研究)?/u
const ZH_EXPORT_RE = /^\s*(?:请|麻烦|帮我)?\s*导出/u
const ZH_DURATION_ONLY_RE =
  /^\s*(?:(?:请|麻烦|帮我|现在|立即|马上)\s*)?(?:安排|进行|发起)?\s*(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:个?\s*小时|h(?:ours?)?|hr(?:s)?)/iu
const GUIDANCE_SIGNAL_RE =
  /围绕|聚焦|优先|不要继续扩题|不要扩题|主线|节点|缩小范围|收束范围|不要发散/u
const DURATION_RE =
  /(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:个?\s*小时|h(?:ours?)?|hr(?:s)?)/iu

export function extractTopicChatUserQuestion(rawQuestion: string) {
  const normalized = rawQuestion.replace(/\r\n/gu, '\n').trim()
  const controlsMatch = normalized.match(/\n{2,}Workbench controls:\n[\s\S]*$/u)
  const body = controlsMatch ? normalized.slice(0, controlsMatch.index).trim() : normalized
  if (!body.startsWith('Workbench context:\n')) return body
  const separator = body.indexOf('\n\n')
  return separator >= 0 ? body.slice(separator + 2).trim() : ''
}

function chineseNumberToInt(value: string) {
  const normalized = value.trim()
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    十一: 11,
    十二: 12,
  }
  if (normalized in digits) return digits[normalized]
  if (normalized.startsWith('十')) return 10 + (digits[normalized.slice(1)] ?? 0)
  if (normalized.endsWith('十')) return (digits[normalized.slice(0, -1)] ?? 1) * 10
  const match = normalized.match(/^([一二两三四五六七八九])十([一二三四五六七八九])$/u)
  if (!match) return null
  return (digits[match[1]] ?? 0) * 10 + (digits[match[2]] ?? 0)
}

function parseDurationHours(question: string) {
  const anyDigitMatch = question.match(/(\d+(?:\.\d+)?)/u)
  if (anyDigitMatch?.[1]) {
    const hours = Number(anyDigitMatch[1])
    if (Number.isFinite(hours)) return Math.min(48, Math.max(1, Math.round(hours)))
  }
  const chineseMatch = question.match(/([零一二两三四五六七八九十百]+)\s*(?:个?\s*小时)/u)
  if (chineseMatch?.[1]) {
    const hours = chineseNumberToInt(chineseMatch[1])
    if (typeof hours === 'number' && Number.isFinite(hours)) {
      return Math.min(48, Math.max(1, Math.round(hours)))
    }
  }
  return 4
}

function looksLikeGuidanceAdjustment(question: string) {
  return (
    DURATION_RE.test(question) &&
    GUIDANCE_SIGNAL_RE.test(question) &&
    !EN_START_RE.test(question) &&
    !ZH_START_RE.test(question) &&
    !ZH_DURATION_ONLY_RE.test(question)
  )
}

export function parseTopicChatCommand(
  rawQuestion: string,
): SupportedTopicChatCommand | null {
  const question = extractTopicChatUserQuestion(rawQuestion)
  if (!question) return null
  const hasExplicitStartIntent =
    EN_START_RE.test(question) ||
    ZH_START_RE.test(question) ||
    ZH_DURATION_ONLY_RE.test(question)
  const hasExplicitStopIntent = EN_STOP_RE.test(question) || ZH_STOP_RE.test(question)
  const hasExplicitExportIntent = EN_EXPORT_RE.test(question) || ZH_EXPORT_RE.test(question)

  if (
    (EN_QUESTION_RE.test(question) || ZH_QUESTION_RE.test(question)) &&
    !hasExplicitStartIntent &&
    !hasExplicitStopIntent &&
    !hasExplicitExportIntent
  ) {
    return null
  }
  if (looksLikeGuidanceAdjustment(question)) return null

  if (
    EN_STOP_RE.test(question) ||
    ZH_STOP_RE.test(question) ||
    /暂停研究/u.test(question) ||
    /停止研究/u.test(question) ||
    /收束本轮/u.test(question)
  ) {
    return { action: 'stop-research' }
  }

  if (
    EN_EXPORT_RE.test(question) ||
    ZH_EXPORT_RE.test(question) ||
    /\bexport\b/iu.test(question) ||
    /导出/u.test(question)
  ) {
    return {
      action: 'export',
      exportKind: /重点|highlights?/iu.test(question)
        ? 'highlights'
        : /笔记|notes?/iu.test(question)
          ? 'notes'
          : 'dossier',
    }
  }

  if (
    EN_START_RE.test(question) ||
    ZH_START_RE.test(question) ||
    ZH_DURATION_ONLY_RE.test(question) ||
    /^(?:\s*(?:请|麻烦|帮我)\s*)?研究\s*\d+/u.test(question)
  ) {
    return { action: 'start-research', durationHours: parseDurationHours(question) }
  }
  return null
}

function patchGuidanceReceipt(
  receipt: TopicGuidanceReceipt,
  patch: Partial<TopicGuidanceReceipt>,
): TopicGuidanceReceipt {
  return { ...receipt, ...patch }
}

function prependCommandSummary(summary: string, existingAnswer: string) {
  const trimmedExisting = existingAnswer.trim()
  if (!trimmedExisting) return summary
  if (trimmedExisting.includes(summary)) return trimmedExisting
  return `${summary}\n\n${trimmedExisting}`
}

function questionPrefersEnglish(question: string) {
  return /[A-Za-z]/u.test(question) && !/[\u3400-\u9FFF]/u.test(question)
}

function withDeadlineText(
  deadlineAt: string | null | undefined,
  copy: {
    withoutDeadline: string
    withDeadline: (deadline: string) => string
  },
) {
  return deadlineAt ? copy.withDeadline(deadlineAt) : copy.withoutDeadline
}

function buildStartPromptHint(prefersEnglish: boolean) {
  return prefersEnglish
    ? 'Summarize the most valuable node to read first in this run and explain why it matters.'
    : '请概括这轮研究里最值得先读的节点，并解释它为什么重要。'
}

function buildStopPromptHint(prefersEnglish: boolean) {
  return prefersEnglish
    ? 'Summarize what this run advanced before it was paused, and what remains unresolved.'
    : '请概括暂停前这轮研究推进了什么，以及还剩哪些未解问题。'
}

function buildExportPromptHint(prefersEnglish: boolean) {
  return prefersEnglish
    ? 'Summarize the core conclusions and unresolved questions that are worth exporting now.'
    : '请概括现在最值得导出的核心结论与未解问题。'
}

function buildCommandSuggestedActions(promptHint: string, summary: string) {
  return [
    {
      label: promptHint,
      action: 'summarize' as const,
      description: summary,
    },
  ]
}

export async function finalizeTopicChatCommandResponse(args: {
  topicId: string
  rawQuestion: string
  response: TopicChatResponse
}): Promise<TopicChatResponse> {
  const receipt = args.response.guidanceReceipt
  const command = parseTopicChatCommand(args.rawQuestion)
  if (!command) return args.response

  const prefersEnglish = questionPrefersEnglish(
    extractTopicChatUserQuestion(args.rawQuestion),
  )
  const commandDirectiveId =
    receipt?.classification === 'command' && receipt.directiveId
      ? receipt.directiveId
      : null
  const receiptCanCollapseToCommand = Boolean(commandDirectiveId && receipt)

  if (command.action === 'start-research') {
    const session = await enhancedTaskScheduler.startTopicResearchSession(args.topicId, {
      durationHours: command.durationHours,
    })
    const alreadyRunning = Boolean(
      ((session.result as { result?: { alreadyRunning?: boolean } } | undefined)?.result
        ?.alreadyRunning),
    )
    const deadlineAt = session.report?.deadlineAt ?? session.progress?.deadlineAt
    const summary = alreadyRunning
      ? withDeadlineText(
          deadlineAt,
          prefersEnglish
            ? {
                withoutDeadline: 'Continuous research is already running.',
                withDeadline: (deadline) =>
                  `Continuous research is already running and is scheduled to wrap at ${deadline}.`,
              }
            : {
                withoutDeadline: '持续研究已经在运行中。',
                withDeadline: (deadline) => `持续研究已经在运行中，预计于 ${deadline} 收束。`,
              },
        )
      : withDeadlineText(
          deadlineAt,
          prefersEnglish
            ? {
                withoutDeadline: `Started a ${command.durationHours}-hour research run.`,
                withDeadline: (deadline) =>
                  `Started a ${command.durationHours}-hour research run, scheduled to wrap at ${deadline}.`,
              }
            : {
                withoutDeadline: `已开始 ${command.durationHours} 小时持续研究。`,
                withDeadline: (deadline) =>
                  `已开始 ${command.durationHours} 小时持续研究，预计于 ${deadline} 收束。`,
              },
        )
    const workbenchAction: TopicWorkbenchAction = {
      kind: 'start-research',
      summary,
      targetTab: 'assistant',
      durationHours: command.durationHours,
    }
    const promptHint = buildStartPromptHint(prefersEnglish)

    if (commandDirectiveId) {
      await updateTopicGuidanceDirective({
        topicId: args.topicId,
        directiveId: commandDirectiveId,
        status: 'consumed',
        effectSummary: summary,
        promptHint,
      })
    }

    const headlineSuffix = session.report?.headline
      ? prefersEnglish
        ? ` Current report: ${session.report.headline}.`
        : ` 当前回执：${session.report.headline}。`
      : ''

    return {
      ...args.response,
      answer: receiptCanCollapseToCommand
        ? `${summary}${headlineSuffix}`
        : prependCommandSummary(summary, args.response.answer),
      suggestedActions: buildCommandSuggestedActions(promptHint, summary),
      guidanceReceipt:
        receiptCanCollapseToCommand && receipt
          ? patchGuidanceReceipt(receipt, {
              status: 'consumed',
              summary,
              effectWindow: 'current-session',
              promptHint,
            })
          : receipt,
      workbenchAction,
    }
  }

  if (command.action === 'stop-research') {
    const beforeStop = await enhancedTaskScheduler.getTopicResearchState(args.topicId)
    const session = await enhancedTaskScheduler.stopTopicResearchSession(args.topicId)
    const stageIndex = session.progress?.currentStage ?? session.report?.currentStage
    const summary =
      beforeStop.active || beforeStop.report?.status === 'running'
        ? stageIndex
          ? prefersEnglish
            ? `Paused the active research run at stage ${stageIndex}. The current judgments and receipts remain preserved.`
            : `已在第 ${stageIndex} 阶段收束本轮持续研究，现有判断与回执都已保留。`
          : prefersEnglish
            ? 'Paused the active research run. The current judgments and receipts remain preserved.'
            : '已收束本轮持续研究，现有判断与回执都已保留。'
        : prefersEnglish
          ? 'There is no active continuous research run to stop right now.'
          : '当前没有正在运行的持续研究，所以没有中断任何任务。'
    const workbenchAction: TopicWorkbenchAction = {
      kind: 'stop-research',
      summary,
      targetTab: 'assistant',
    }
    const promptHint = buildStopPromptHint(prefersEnglish)

    if (commandDirectiveId) {
      await updateTopicGuidanceDirective({
        topicId: args.topicId,
        directiveId: commandDirectiveId,
        status: 'consumed',
        effectSummary: summary,
        promptHint,
      })
    }

    const headlineSuffix = session.report?.headline
      ? prefersEnglish
        ? ` Latest report: ${session.report.headline}.`
        : ` 最近一条回执：${session.report.headline}。`
      : ''

    return {
      ...args.response,
      answer: receiptCanCollapseToCommand
        ? `${summary}${headlineSuffix}`
        : prependCommandSummary(summary, args.response.answer),
      suggestedActions: buildCommandSuggestedActions(promptHint, summary),
      guidanceReceipt:
        receiptCanCollapseToCommand && receipt
          ? patchGuidanceReceipt(receipt, {
              status: 'consumed',
              summary,
              effectWindow: 'current-session',
              promptHint,
            })
          : receipt,
      workbenchAction,
    }
  }

  const exportSummary =
    command.exportKind === 'highlights'
      ? prefersEnglish
        ? 'Queued an export-highlights intent. Finish the export from the notes tab in the right workbench.'
        : '已识别为导出重点摘编的请求，请在右侧工作台的笔记页完成导出。'
      : command.exportKind === 'notes'
        ? prefersEnglish
          ? 'Queued an export-notes intent. Finish the export from the notes tab in the right workbench.'
          : '已识别为导出研究笔记的请求，请在右侧工作台的笔记页完成导出。'
        : prefersEnglish
          ? 'Queued an export-dossier intent. Finish the export from the notes tab in the right workbench.'
          : '已识别为导出研究档案的请求，请在右侧工作台的笔记页完成导出。'
  const workbenchAction: TopicWorkbenchAction = {
    kind:
      command.exportKind === 'highlights'
        ? 'export-highlights'
        : command.exportKind === 'notes'
          ? 'export-notes'
          : 'export-dossier',
    summary: exportSummary,
    targetRoute: `/favorites?topic=${encodeURIComponent(args.topicId)}`,
  }
  const promptHint = buildExportPromptHint(prefersEnglish)

  if (commandDirectiveId) {
    await updateTopicGuidanceDirective({
      topicId: args.topicId,
      directiveId: commandDirectiveId,
      status: 'deferred',
      effectSummary: exportSummary,
      promptHint,
    })
  }

  return {
    ...args.response,
    answer: receiptCanCollapseToCommand
      ? exportSummary
      : prependCommandSummary(exportSummary, args.response.answer),
    suggestedActions: buildCommandSuggestedActions(promptHint, exportSummary),
    guidanceReceipt:
      receiptCanCollapseToCommand && receipt
        ? patchGuidanceReceipt(receipt, {
            status: 'deferred',
            summary: exportSummary,
            promptHint,
          })
        : receipt,
    workbenchAction,
  }
}
