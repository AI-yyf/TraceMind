import type { ReactNode } from 'react'

import type { CitationRef, StoredChatMessage, SuggestedAction } from '@/types/alpha'
import { useI18n } from '@/i18n'
import { AssistantMarkdown } from './AssistantMarkdown'

function clipText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function deriveRetainedJudgmentLine(
  content: string,
  summary: string,
) {
  const normalized = content.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''

  const sentences = normalized
    .split(/(?<=[.!?。！？])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)

  const summaryKey = summary.replace(/\s+/gu, ' ').trim().toLowerCase()
  const candidate =
    sentences.find((sentence) => {
      const lower = sentence.toLowerCase()
      if (summaryKey && lower === summaryKey) return false

      return (
        lower.includes('current') ||
        lower.includes('still') ||
        lower.includes('retain') ||
        lower.includes('mainline') ||
        lower.includes('judgment') ||
        sentence.includes('当前') ||
        sentence.includes('仍') ||
        sentence.includes('保留') ||
        sentence.includes('主线') ||
        sentence.includes('判断')
      )
    }) ??
    (sentences.length > 1 ? sentences[sentences.length - 1] ?? '' : '')

  return candidate ? clipText(candidate, 160) : ''
}

function guidanceTypeLabel(
  classification: NonNullable<StoredChatMessage['guidanceReceipt']>['classification'],
  t: (key: string, fallback: string) => string,
) {
  if (classification === 'ask') return t('workbench.guidanceTypeAsk', 'Ask')
  if (classification === 'challenge') return t('workbench.guidanceTypeChallenge', 'Challenge')
  if (classification === 'focus') return t('workbench.guidanceTypeFocus', 'Focus')
  if (classification === 'style') return t('workbench.guidanceTypeStyle', 'Style')
  if (classification === 'command') return t('workbench.guidanceTypeCommand', 'Command')
  return t('workbench.guidanceTypeSuggest', 'Suggest')
}

function guidanceTypeTone(
  classification: NonNullable<StoredChatMessage['guidanceReceipt']>['classification'],
) {
  if (classification === 'challenge') return 'bg-amber-100 text-amber-900'
  if (classification === 'focus') return 'bg-sky-100 text-sky-900'
  if (classification === 'style') return 'bg-violet-100 text-violet-900'
  if (classification === 'command') return 'bg-emerald-100 text-emerald-900'
  if (classification === 'ask') return 'bg-slate-100 text-slate-900'
  return 'bg-black/[0.06] text-black/72'
}

function guidanceStatusLabel(
  status: NonNullable<StoredChatMessage['guidanceReceipt']>['status'],
  t: (key: string, fallback: string) => string,
) {
  if (status === 'accepted') return t('workbench.guidanceStatusAccepted', 'Accepted')
  if (status === 'partial') return t('workbench.guidanceStatusPartial', 'Partial')
  if (status === 'deferred') return t('workbench.guidanceStatusDeferred', 'Deferred')
  if (status === 'superseded') return t('workbench.guidanceStatusSuperseded', 'Superseded')
  if (status === 'consumed') return t('workbench.guidanceStatusConsumed', 'Applied')
  if (status === 'rejected') return t('workbench.guidanceStatusRejected', 'Rejected')
  return t('workbench.guidanceStatusNone', 'Recorded')
}

function guidanceWindowLabel(
  effectWindow: NonNullable<StoredChatMessage['guidanceReceipt']>['effectWindow'],
  t: (key: string, fallback: string) => string,
) {
  if (effectWindow === 'until-cleared') {
    return t('workbench.guidanceWindowPersistent', 'Until changed')
  }
  if (effectWindow === 'current-session') {
    return t('workbench.guidanceWindowSession', 'Current session')
  }
  if (effectWindow === 'next-run') {
    return t('workbench.guidanceWindowNextRun', 'Next run')
  }
  return t('workbench.guidanceWindowNone', 'No window')
}

export function ConversationThread({
  messages,
  onOpenCitation,
  onAction,
  onUsePrompt,
  onSaveMessage,
}: {
  messages: StoredChatMessage[]
  onOpenCitation: (citation: CitationRef) => void
  onAction: (action: SuggestedAction) => void
  onUsePrompt: (prompt: string) => void
  onSaveMessage?: (message: StoredChatMessage) => void
}) {
  const { t } = useI18n()

  return (
    <div data-testid="conversation-thread" className="space-y-3">
      {messages.map((message) => {
        const assistant = message.role === 'assistant'
        const guidanceReceipt = assistant ? message.guidanceReceipt ?? null : null
        const retainedJudgment = guidanceReceipt
          ? deriveRetainedJudgmentLine(message.content, guidanceReceipt.summary)
          : ''

        return (
          <div key={message.id} className={`flex ${assistant ? 'justify-start' : 'justify-end'}`}>
            <article className={`max-w-[92%] ${assistant ? 'items-start' : 'items-end'} flex flex-col`}>
              <div
                className={`rounded-[16px] px-3 py-2.5 text-[13px] leading-6 shadow-[0_4px_14px_rgba(15,23,42,0.04)] ${
                  assistant
                    ? guidanceReceipt
                      ? 'border border-sky-200/60 bg-white text-black/74'
                      : 'bg-[var(--surface-soft)] text-black/74'
                    : 'bg-black text-white'
                }`}
              >
                <AssistantMarkdown content={message.content} tone={assistant ? 'assistant' : 'user'} />
              </div>

              {message.notice ? (
                <div
                  className={`mt-2 rounded-[14px] px-3 py-2 text-[11px] leading-5 ${
                    assistant ? 'bg-amber-50 text-amber-900' : 'bg-white/10 text-white/88'
                  }`}
                >
                  <div className="font-medium">{message.notice.title}</div>
                  <p className="mt-1">{message.notice.message}</p>
                </div>
              ) : null}

              {guidanceReceipt ? (
                <details
                  data-testid="guidance-receipt"
                  className="mt-2 rounded-[16px] border border-sky-200/70 bg-white px-3 py-2.5 text-[11px] leading-5 text-black/72"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-black/36">
                        {t('workbench.guidanceReceiptTitle', 'Guidance receipt')}
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-black/62">
                        {guidanceReceipt.summary}
                      </p>
                    </div>

                    <span className="rounded-full border border-black/8 bg-white/88 px-2.5 py-1 text-[10px] text-black/48">
                      {guidanceStatusLabel(guidanceReceipt.status, t)}
                    </span>
                  </summary>

                  <div className="mt-2 space-y-2">
                    <ReceiptRow label={t('workbench.guidanceReceiptRaised', 'You raised')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${guidanceTypeTone(
                            guidanceReceipt.classification,
                          )}`}
                        >
                          {guidanceTypeLabel(guidanceReceipt.classification, t)}
                        </span>
                        <span className="text-[11px] leading-5 text-black/62">
                          {guidanceReceipt.scopeLabel}
                        </span>
                      </div>
                    </ReceiptRow>

                    {retainedJudgment ? (
                      <ReceiptRow label={t('workbench.guidanceReceiptRetained', 'I still hold')}>
                        <p className="text-[11px] leading-5 text-black/58">{retainedJudgment}</p>
                      </ReceiptRow>
                    ) : null}

                    <ReceiptRow label={t('workbench.guidanceReceiptEffect', 'Takes effect')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/62">
                          {guidanceWindowLabel(guidanceReceipt.effectWindow, t)}
                        </span>
                        <span className="rounded-full border border-black/8 bg-white/80 px-2.5 py-1 text-[10px] text-black/48">
                          {guidanceStatusLabel(guidanceReceipt.status, t)}
                        </span>
                      </div>
                    </ReceiptRow>
                  </div>

                  {guidanceReceipt.promptHint ? (
                    <button
                      type="button"
                      data-testid="guidance-receipt-cta"
                      onClick={() => onUsePrompt(guidanceReceipt.promptHint)}
                      className="mt-2 inline-flex rounded-full bg-black px-2.5 py-1 text-[10px] font-medium text-white transition hover:bg-black/88"
                    >
                      {t('workbench.guidancePromptCta', 'Continue from this')}
                    </button>
                  ) : null}
                </details>
              ) : null}

              {message.citations && message.citations.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.citations.map((citation) => (
                    <button
                      key={citation.anchorId}
                      type="button"
                      data-testid="assistant-citation"
                      onClick={() => onOpenCitation(citation)}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] text-black/64 transition hover:border-black/18 hover:text-black"
                    >
                      {citation.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {message.suggestedActions && message.suggestedActions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.suggestedActions.map((action) => (
                    <button
                      key={`${message.id}-${action.label}`}
                      type="button"
                      onClick={() => onAction(action)}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] text-black/58 transition hover:border-black/18 hover:text-black"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {assistant && onSaveMessage ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSaveMessage(message)}
                    className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] text-black/58 transition hover:border-black/18 hover:text-black"
                  >
                    {t('workbench.saveMessage', 'Save to notes')}
                  </button>
                </div>
              ) : null}
            </article>
          </div>
        )
      })}
    </div>
  )
}

function ReceiptRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-soft)] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
