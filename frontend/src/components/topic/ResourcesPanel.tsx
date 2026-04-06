import type { ContextPill, EvidencePayload } from '@/types/alpha'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import {
  compactTopicSurfaceTitle,
  sanitizeTopicSurfaceText,
} from '@/utils/topicPresentation'

function clipText(value: string | undefined, maxLength = 180) {
  const normalized = value?.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

type ResourceCard = {
  id: string
  title: string
  subtitle: string
  description: string
  kind: 'stage' | 'node' | 'paper'
}

export function ResourcesPanel({
  contextPills,
  resources,
  selectedEvidence,
  onSaveSelectedEvidence,
}: {
  contextPills: ContextPill[]
  resources: ResourceCard[]
  selectedEvidence: EvidencePayload | null
  onSaveSelectedEvidence?: () => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))
  const kindLabels: Record<ResourceCard['kind'], string> = {
    stage: t('workbench.resourceKindStage', 'Stage'),
    node: t('workbench.resourceKindNode', 'Node'),
    paper: t('workbench.resourceKindPaper', 'Paper'),
  }

  return (
    <div data-testid="topic-resources-panel" className="space-y-4">
      <section className="rounded-[22px] bg-[var(--surface-soft)] p-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
          {workbenchText('assistant.contextTitle', 'workbench.contextTitle', 'Current Context')}
        </div>
        {contextPills.length === 0 ? (
          <p className="mt-3 text-[13px] leading-6 text-black/56">
            {workbenchText(
              'assistant.contextEmpty',
              'workbench.contextEmpty',
              'Add nodes, figures, search results, or selected passages first. This area keeps the context the conversation is truly relying on.',
            )}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {contextPills.map((item) => (
              <span
                key={item.id}
                className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-black/66"
              >
                {item.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {selectedEvidence ? (
        <section className="rounded-[22px] bg-[var(--surface-soft)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
              {workbenchText('assistant.evidenceTitle', 'workbench.evidenceTitle', 'Current Evidence')}
            </div>
            {onSaveSelectedEvidence ? (
              <button
                type="button"
                onClick={onSaveSelectedEvidence}
                className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-black/60 transition hover:border-black/16 hover:text-black"
              >
                {workbenchText(
                  'assistant.captureEvidence',
                  'workbench.captureEvidence',
                  'Capture Current Evidence',
                )}
              </button>
            ) : null}
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-black">{selectedEvidence.label}</h3>
          <p className="mt-3 text-[12px] leading-6 text-black/62">
            {clipText(selectedEvidence.whyItMatters || selectedEvidence.quote, 220)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/52">
              {selectedEvidence.type}
            </span>
            {selectedEvidence.placementHint ? (
              <span className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/52">
                {selectedEvidence.placementHint}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-[22px] bg-[var(--surface-soft)] p-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
          {workbenchText('assistant.resourcesTitle', 'workbench.resourcesTitle', 'Extended Resources')}
        </div>
        <div className="mt-3 space-y-3">
          {resources.map((resource) => (
            <article key={resource.id} className="rounded-[18px] border border-black/6 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                {kindLabels[resource.kind]}
              </div>
              <div className="mt-1 text-[14px] font-medium text-black">
                {resource.kind === 'paper'
                  ? compactTopicSurfaceTitle(resource.title, resource.title, 48)
                  : resource.title}
              </div>
              {resource.subtitle ? (
                <div className="mt-1 text-[12px] text-black/46">{resource.subtitle}</div>
              ) : null}
              {sanitizeTopicSurfaceText(resource.description, 180) ? (
                <p className="mt-2 text-[12px] leading-6 text-black/58">
                  {clipText(sanitizeTopicSurfaceText(resource.description, 180), 180)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
