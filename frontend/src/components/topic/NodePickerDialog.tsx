import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'

import { useI18n } from '@/i18n'
import { apiPost } from '@/utils/api'
import { cn } from '@/utils/cn'

type NodeItem = {
  id: string
  stageIndex: number
  nodeLabel: string
  nodeSubtitle?: string
}

export function NodePickerDialog({
  open,
  onClose,
  paperId,
  paperTitle,
  nodes,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  paperId: string
  paperTitle: string
  nodes: NodeItem[]
  onSuccess?: () => void
}) {
  const { t } = useI18n()
  const [submittingNodeId, setSubmittingNodeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSubmittingNodeId(null)
      setError(null)
    }
  }, [open])

  const groupedNodes = useMemo(() => {
    const map = new Map<number, NodeItem[]>()
    for (const node of nodes) {
      const list = map.get(node.stageIndex) ?? []
      list.push(node)
      map.set(node.stageIndex, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [nodes])

  const handleSelect = useCallback(
    async (nodeId: string) => {
      setSubmittingNodeId(nodeId)
      setError(null)
      try {
        await apiPost<{ success: boolean }, { paperIds: string[] }>(
          `/api/nodes/${encodeURIComponent(nodeId)}/papers`,
          { paperIds: [paperId] },
        )
        onSuccess?.()
        onClose()
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : t('nodePicker.addFailed', 'Failed to add paper to node'),
        )
      } finally {
        setSubmittingNodeId(null)
      }
    },
    [onClose, onSuccess, paperId, t],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="flex w-[min(480px,calc(100vw-2rem))] max-h-[min(640px,calc(100vh-2rem))] flex-col overflow-hidden rounded-[24px] border border-black/8 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)] animate-slide-up">
        <div className="flex items-center justify-between border-b border-black/6 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-black">
              {t('nodePicker.title', 'Add to Node')}
            </h2>
            <p className="mt-0.5 text-[12px] text-black/50 line-clamp-1" title={paperTitle}>
              {paperTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-black/46 transition hover:bg-black/5 hover:text-black"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {nodes.length === 0 ? (
            <div className="rounded-[14px] bg-[var(--surface-soft)] px-4 py-6 text-center text-[13px] text-black/56">
              {t('nodePicker.empty', 'No nodes available in this topic.')}
            </div>
          ) : (
            <div className="space-y-5">
              {groupedNodes.map(([stageIndex, stageNodes]) => (
                <section key={stageIndex} className="space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                    {t('topic.stageLabel', 'Stage')} {stageIndex}
                  </div>
                  <div className="space-y-2">
                    {stageNodes.map((node) => {
                      const isSubmitting = submittingNodeId === node.id

                      return (
                        <button
                          key={node.id}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleSelect(node.id)}
                          className={cn(
                            'group flex w-full items-center justify-between rounded-[14px] border px-4 py-3 text-left transition',
                            isSubmitting
                              ? 'border-black/6 bg-[var(--surface-soft)]'
                              : 'border-black/8 bg-white hover:border-[var(--accent)]/40 hover:bg-[var(--surface-accent)]/30',
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-black">
                              {node.nodeLabel}
                            </div>
                            {node.nodeSubtitle ? (
                              <div className="mt-0.5 text-[11px] text-black/48 line-clamp-1">
                                {node.nodeSubtitle}
                              </div>
                            ) : null}
                          </div>
                          {isSubmitting ? (
                            <Loader2 className="ml-3 h-4 w-4 shrink-0 animate-spin text-black/40" />
                          ) : (
                            <span className="ml-3 shrink-0 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/56 transition group-hover:border-black/12 group-hover:text-black">
                              {t('nodePicker.select', 'Select')}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {error ? (
            <div className="mt-4 rounded-[10px] bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
