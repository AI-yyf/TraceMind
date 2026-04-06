import { useI18n } from '@/i18n'
import type { EvidencePayload } from '@/types/alpha'

export function EvidenceInspector({ evidence }: { evidence: EvidencePayload | null }) {
  const { t } = useI18n()

  if (!evidence) return null

  return (
    <section className="rounded-[22px] border border-black/10 bg-white p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-black/40">
        {t('workbench.evidenceInspectorTitle', 'Evidence Inspector')}
      </div>
      <h3 className="mt-3 text-[16px] font-semibold text-black">{evidence.label}</h3>
      <p className="mt-3 text-[13px] leading-6 text-black/58">{evidence.quote}</p>
      <div className="mt-4 whitespace-pre-line text-[13px] leading-7 text-black/68">{evidence.content}</div>
    </section>
  )
}
