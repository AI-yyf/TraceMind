import { MathFormula, MathText } from '@/components/MathFormula'
import type { EvidencePayload } from '@/types/alpha'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { resolveApiAssetUrl } from '@/utils/api'
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
  resources,
  selectedEvidence,
  onSaveSelectedEvidence,
}: {
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
  const evidenceImageUrl = selectedEvidence
    ? resolveApiAssetUrl(selectedEvidence.thumbnailPath ?? selectedEvidence.imagePath)
    : null

  return (
    <div data-testid="topic-resources-panel" className="space-y-3">
      {selectedEvidence ? (
        <section className="rounded-[12px] bg-[var(--surface-soft)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
              {workbenchText('assistant.evidenceTitle', 'workbench.evidenceTitle', 'Current Evidence')}
            </div>
            {onSaveSelectedEvidence ? (
              <button
                type="button"
                onClick={onSaveSelectedEvidence}
                className="rounded-full border border-black/8 bg-white px-3 py-1 text-[11px] text-black/60 transition hover:border-black/16 hover:text-black"
              >
                {workbenchText(
                  'assistant.captureEvidence',
                  'workbench.captureEvidence',
                  'Capture',
                )}
              </button>
            ) : null}
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-black">{selectedEvidence.label}</h3>
          <p className="mt-2 text-[12px] leading-5 text-black/62">
            {clipText(selectedEvidence.whyItMatters || selectedEvidence.quote, 220)}
          </p>
          {selectedEvidence.type === 'figure' && evidenceImageUrl ? (
            <div className="mt-3 overflow-hidden rounded-[14px] border border-black/8 bg-white">
              <img
                src={evidenceImageUrl}
                alt={selectedEvidence.title}
                className="max-h-[280px] w-full object-contain bg-[#f8f5ef]"
              />
            </div>
          ) : null}
          {selectedEvidence.type === 'formula' ? (
            <div className="mt-3 rounded-[12px] border border-black/8 bg-white px-3 py-3">
              {selectedEvidence.formulaLatex ? (
                <MathFormula
                  expression={selectedEvidence.formulaLatex}
                  className="overflow-x-auto text-[15px] text-black"
                />
              ) : (
                <MathText
                  content={selectedEvidence.content || selectedEvidence.quote}
                  className="overflow-x-auto text-[14px] leading-7 text-black/72"
                />
              )}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
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

      <section className="rounded-[12px] bg-[var(--surface-soft)] p-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
          {workbenchText('assistant.resourcesTitle', 'workbench.resourcesTitle', 'Extended Resources')}
        </div>
        <div className="mt-3 space-y-2">
          {resources.map((resource) => (
            <article key={resource.id} className="rounded-[12px] border border-black/6 bg-white px-3 py-2.5">
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
                <p className="mt-1.5 text-[12px] leading-5 text-black/58">
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
