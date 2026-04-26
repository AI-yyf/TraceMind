import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  Bot,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type {
  AssistantState,
  WorkbenchMaterialStatus,
  WorkbenchMaterialSummary,
} from '@/types/alpha'

export type GroundedComposerMaterial = WorkbenchMaterialSummary & {
  sizeLabel?: string
  error?: string
}

type ComposerSurfaceMode = 'default' | 'reading' | 'map'

export function GroundedComposer({
  value,
  onChange,
  onSubmit,
  onNavigateHistory,
  searchEnabled,
  onToggleSearch,
  thinkingEnabled,
  onToggleThinking,
  style,
  onStyleChange,
  disabled,
  assistantState,
  agentBrief,
  onAgentBriefChange,
  materials,
  onSelectFiles,
  onRemoveMaterial,
  onClearMaterials,
  compact = false,
  surfaceMode = 'default',
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onNavigateHistory?: (direction: 'up' | 'down') => boolean
  searchEnabled: boolean
  onToggleSearch: () => void
  thinkingEnabled: boolean
  onToggleThinking: () => void
  style: 'brief' | 'balanced' | 'deep'
  onStyleChange: (style: 'brief' | 'balanced' | 'deep') => void
  disabled: boolean
  assistantState: AssistantState
  agentBrief: string
  onAgentBriefChange: (value: string) => void
  materials: GroundedComposerMaterial[]
  onSelectFiles: (files: FileList | null) => void
  onRemoveMaterial: (id: string) => void
  onClearMaterials: () => void
  compact?: boolean
  surfaceMode?: ComposerSurfaceMode
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const isReadingSurface = surfaceMode === 'reading'
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))
  const surfaceText = (
    workbenchKey: string,
    fallback: string,
    scopedKeys?: { topic?: string; node?: string },
  ) =>
    t(
      isReadingSurface ? scopedKeys?.node ?? workbenchKey : scopedKeys?.topic ?? workbenchKey,
      t(workbenchKey, fallback),
    )
  const busy =
    assistantState === 'submitting' ||
    assistantState === 'thinking' ||
    assistantState === 'retrieving'
  const materialBusy = materials.some((material) => material.status === 'parsing')
  const hasWorkbenchIntake = Boolean(agentBrief.trim()) || materials.length > 0
  const readingUploadsCopy = {
    ready: surfaceText('workbench.readingUploadsReady', 'Uploads ready'),
    chip: surfaceText('workbench.readingUploadsChip', 'Uploads'),
    label: surfaceText('workbench.readingUploadsLabel', 'Uploaded materials'),
    hint: surfaceText('workbench.readingUploadsHint', 'Upload figures, PDFs, or notes as supplemental grounding. Node references and downloadable papers stay visible below in the workbench.'),
  }
  const materialChipLabel =
    isReadingSurface
      ? materials.length > 0
        ? readingUploadsCopy.ready
        : readingUploadsCopy.chip
      : materials.length > 0
        ? surfaceText('workbench.materialsReady', 'Materials ready', {
            topic: 'topic.workbenchSourcesReady',
            node: 'node.workbenchSourcesReady',
          })
        : surfaceText('workbench.materials', 'Add material', {
            topic: 'topic.workbenchSources',
            node: 'node.workbenchSources',
          })
  const materialsLabel = isReadingSurface
    ? readingUploadsCopy.label
    : surfaceText('workbench.materialsLabel', 'Materials', {
        topic: 'topic.workbenchSourcesLabel',
        node: 'node.workbenchSourcesLabel',
      })
  const addMaterialsLabel = surfaceText(
    isReadingSurface ? 'workbench.addUpload' : 'workbench.addMaterial',
    'Add files',
    {
      topic: 'topic.workbenchAddSource',
      node: 'node.workbenchAddSource',
    },
  )
  const clearMaterialsLabel = surfaceText(
    isReadingSurface ? 'workbench.clearUploads' : 'workbench.clearMaterials',
    'Clear',
    {
      topic: 'topic.workbenchClearSources',
      node: 'node.workbenchClearSources',
    },
  )
  const materialsHint = surfaceText(
    'workbench.materialsHint',
    isReadingSurface
      ? readingUploadsCopy.hint
      : 'Drop in figures, PDFs, or text notes. Images are sent as visual grounding, while PDFs and notes are distilled into compact context for the agent.',
    {
      topic: 'topic.workbenchSourcesHint',
      node: 'node.workbenchSourcesHint',
    },
  )

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget
    const atStart = target.selectionStart === 0 && target.selectionEnd === 0
    const atEnd =
      target.selectionStart === target.value.length &&
      target.selectionEnd === target.value.length

    if (event.key === 'Enter' && !event.shiftKey) {
      if (!disabled && !materialBusy) {
        event.preventDefault()
        onSubmit()
      }
      return
    }

    if (event.key === 'ArrowUp' && atStart && onNavigateHistory?.('up')) {
      event.preventDefault()
      return
    }

    if (event.key === 'ArrowDown' && atEnd && onNavigateHistory?.('down')) {
      event.preventDefault()
    }
  }

  useEffect(() => {
    if (agentBrief.trim()) {
      setBriefOpen(true)
    }
  }, [agentBrief])

  useEffect(() => {
    if (materials.length > 0) {
      setMaterialsOpen(true)
    }
  }, [materials.length])

  return (
    <div className="rounded-[12px] border border-black/8 bg-white p-2 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap gap-1.5">
        {compact ? (
          <>
            <ComposerChip
              label={surfaceText('workbench.agentBrief', 'Guide agent', {
                topic: 'topic.workbenchFocus',
                node: 'node.workbenchFocus',
              })}
              active={briefOpen || Boolean(agentBrief.trim())}
              onClick={() => setBriefOpen((current) => !current)}
              icon={<Bot className="h-3.5 w-3.5" />}
            />
            <ComposerChip
              label={materialChipLabel}
              active={materialsOpen || materials.length > 0}
              onClick={() => {
                setMaterialsOpen(true)
                fileInputRef.current?.click()
              }}
              icon={<Paperclip className="h-3.5 w-3.5" />}
            />
          </>
        ) : (
          <>
            <ComposerChip
              label={workbenchText('assistant.searchToggle', 'workbench.searchToggle', 'Search')}
              active={searchEnabled}
              onClick={onToggleSearch}
              icon={<Search className="h-3.5 w-3.5" />}
            />
            <ComposerChip
              label={workbenchText('assistant.thinkingToggle', 'workbench.thinkingToggle', 'Reason')}
              active={thinkingEnabled}
              onClick={onToggleThinking}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            />
            <ComposerChip
              label={
                style === 'brief'
                  ? workbenchText('assistant.styleBrief', 'workbench.styleBrief', 'Brief')
                  : style === 'deep'
                    ? workbenchText('assistant.styleDeep', 'workbench.styleDeep', 'Deep')
                    : workbenchText('assistant.styleBalanced', 'workbench.styleBalanced', 'Balanced')
              }
              active={false}
              onClick={() =>
                onStyleChange(
                  style === 'brief' ? 'balanced' : style === 'balanced' ? 'deep' : 'brief',
                )
              }
            />
            <ComposerChip
              label={surfaceText('workbench.agentBrief', 'Guide agent', {
                topic: 'topic.workbenchFocus',
                node: 'node.workbenchFocus',
              })}
              active={briefOpen || Boolean(agentBrief.trim())}
              onClick={() => setBriefOpen((current) => !current)}
              icon={<Bot className="h-3.5 w-3.5" />}
            />
            <ComposerChip
              label={materialChipLabel}
              active={materialsOpen || materials.length > 0}
              onClick={() => {
                setMaterialsOpen(true)
                fileInputRef.current?.click()
              }}
              icon={<Paperclip className="h-3.5 w-3.5" />}
            />
          </>
        )}
      </div>

      {(briefOpen || materialsOpen || hasWorkbenchIntake) ? (
        <div className="mt-2 space-y-2">
          {briefOpen || agentBrief.trim() ? (
            <section className="rounded-[12px] border border-black/8 bg-[var(--surface-soft)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-black/36">
                  {surfaceText('workbench.agentBriefLabel', 'Agent brief', {
                    topic: 'topic.workbenchFocusLabel',
                    node: 'node.workbenchFocusLabel',
                  })}
                </div>
                {agentBrief.trim() ? (
                  <button
                    type="button"
                    onClick={() => onAgentBriefChange('')}
                    className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] text-black/56 transition hover:border-black/18 hover:text-black"
                  >
                    {workbenchText('assistant.clearBrief', 'workbench.clearBrief', 'Clear')}
                  </button>
                ) : null}
              </div>
              <textarea
                data-testid="assistant-agent-brief-input"
                value={agentBrief}
                onChange={(event) => onAgentBriefChange(event.target.value)}
                placeholder={surfaceText(
                  'workbench.agentBriefPlaceholder',
                  'Tell the backend agent what to prioritize, challenge, preserve, or verify in the next turns.',
                  {
                    topic: 'topic.workbenchFocusPlaceholder',
                    node: 'node.workbenchFocusPlaceholder',
                  },
                )}
                className="mt-2 min-h-[54px] w-full resize-none rounded-[10px] border border-black/8 bg-white px-3 py-2 text-[12px] leading-5 text-black outline-none placeholder:text-black/32"
              />
              <p className="mt-1.5 text-[10px] leading-4 text-black/46">
                {surfaceText(
                  'workbench.agentBriefHint',
                  'This brief is passed to the workbench conversation and can be inherited by later backend turns through session memory.',
                  {
                    topic: 'topic.workbenchFocusHint',
                    node: 'node.workbenchFocusHint',
                  },
                )}
              </p>
            </section>
          ) : null}

          {materialsOpen || materials.length > 0 ? (
            <section className="rounded-[12px] border border-black/8 bg-[var(--surface-soft)] px-3 py-2.5">
              <input
                ref={fileInputRef}
                data-testid="assistant-material-input"
                type="file"
                multiple
                accept="image/*,application/pdf,text/plain,text/markdown,application/json,.md,.txt,.json"
                className="hidden"
                onChange={(event) => {
                  onSelectFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-black/36">
                  {materialsLabel}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="assistant-material-trigger"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-[10px] text-black/56 transition hover:border-black/18 hover:text-black"
                  >
                    {addMaterialsLabel}
                  </button>
                  {materials.length > 0 ? (
                    <button
                      type="button"
                      onClick={onClearMaterials}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-[10px] text-black/56 transition hover:border-black/18 hover:text-black"
                    >
                      {clearMaterialsLabel}
                    </button>
                  ) : null}
                </div>
              </div>

              {materials.length === 0 ? (
                <p className="mt-2 text-[11px] leading-5 text-black/54">
                  {materialsHint}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {materials.map((material) => (
                    <article
                      key={material.id}
                      data-testid={`assistant-material-${material.id}`}
                      className="rounded-[12px] border border-black/8 bg-white px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <MaterialKindIcon status={material.status} kind={material.kind} />
                            <span className="truncate text-[11px] font-medium text-black">
                              {material.name}
                            </span>
                            <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] text-black/54">
                              {materialStatusText(material.status, t)}
                            </span>
                            {material.sizeLabel ? (
                              <span className="text-[10px] text-black/42">{material.sizeLabel}</span>
                            ) : null}
                          </div>
                          {material.summary ? (
                            <p className="mt-1 text-[11px] leading-5 text-black/58">
                              {material.summary}
                            </p>
                          ) : null}
                          {material.highlights?.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {material.highlights.slice(0, 3).map((highlight) => (
                                <span
                                  key={`${material.id}:${highlight}`}
                                  className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] text-black/56"
                                >
                                  {highlight}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {material.error ? (
                            <p className="mt-1 text-[10px] leading-4 text-rose-700">
                              {material.error}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveMaterial(material.id)}
                          className="rounded-full border border-black/10 bg-white p-1 text-black/48 transition hover:border-black/18 hover:text-black"
                          aria-label={surfaceText('workbench.removeMaterial', 'Remove material', {
                            topic: 'topic.workbenchRemoveSource',
                            node: 'node.workbenchRemoveSource',
                          })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 rounded-[12px] bg-[var(--surface-soft)] px-2.5 py-2">
        <textarea
          data-testid="assistant-composer-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={surfaceText(
            'workbench.inputPlaceholder',
            'Ask about the current node, paper, figure, or the overall mainline.',
            {
              topic: 'topic.workbenchInputPlaceholder',
              node: 'node.workbenchInputPlaceholder',
            },
          )}
          className="min-h-[52px] w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-5 text-black outline-none placeholder:text-black/32"
        />

        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <div className="inline-flex min-w-0 items-center gap-1.5 text-[10px] text-black/42">
            {busy || materialBusy ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f766e]" />
            )}
            <span className="truncate">
              {materialBusy
                ? surfaceText(
                    'workbench.statusParsingMaterial',
                    'Preparing material for the backend agent',
                    {
                      topic: 'topic.workbenchStatusParsingMaterial',
                      node: 'node.workbenchStatusParsingMaterial',
                    },
                  )
                : busy
                  ? workbenchText(
                      'assistant.statusWorking',
                      'workbench.statusWorking',
                      'Preparing the answer',
                    )
                  : hasWorkbenchIntake
                    ? surfaceText(
                        'workbench.statusMemoryReady',
                        'Your brief and materials will stay visible to this thread',
                        {
                          topic: 'topic.workbenchStatusMemoryReady',
                          node: 'node.workbenchStatusMemoryReady',
                        },
                      )
                    : surfaceText(
                        'workbench.statusReady',
                        'Context is ready for the next question',
                        {
                          topic: 'topic.workbenchStatusReady',
                          node: 'node.workbenchStatusReady',
                        },
                      )}
            </span>
          </div>

          <div className="hidden shrink-0 text-[10px] text-black/36 md:block">
            {surfaceText(
              'workbench.composerShortcutHint',
              'Enter send | Shift+Enter newline | Up/Down drafts',
              {
                topic: 'topic.workbenchShortcutHint',
                node: 'node.workbenchShortcutHint',
              },
            )}
          </div>

          <button
            type="button"
            data-testid="assistant-send-button"
            onClick={onSubmit}
            disabled={disabled || materialBusy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-[10px] text-white transition hover:bg-black/92 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {workbenchText('assistant.send', 'workbench.send', 'Send')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ComposerChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] transition ${
        active
          ? 'border-black/12 bg-black/[0.04] text-black/78'
          : 'border-transparent bg-[var(--surface-soft)] text-black/54 hover:border-black/8 hover:text-black/72'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function MaterialKindIcon({
  kind,
  status,
}: {
  kind: WorkbenchMaterialSummary['kind']
  status?: WorkbenchMaterialStatus
}) {
  const className =
    status === 'error'
      ? 'text-rose-700'
      : status === 'parsing'
        ? 'text-black/46'
        : 'text-[#0f766e]'

  if (status === 'parsing') {
    return <Loader2 className={`h-3.5 w-3.5 animate-spin ${className}`} />
  }

  if (kind === 'image') {
    return <ImageIcon className={`h-3.5 w-3.5 ${className}`} />
  }

  return <FileText className={`h-3.5 w-3.5 ${className}`} />
}

function materialStatusText(
  status: GroundedComposerMaterial['status'],
  t: (key: string, fallback: string) => string,
) {
  if (status === 'parsing') {
    return t('workbench.materialStatusParsing', 'Parsing')
  }
  if (status === 'vision-only') {
    return t('workbench.materialStatusVisionOnly', 'Vision grounding')
  }
  if (status === 'error') {
    return t('workbench.materialStatusError', 'Needs retry')
  }
  return t('workbench.materialStatusReady', 'Ready')
}
