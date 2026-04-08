export function TopicClosingSummary({
  eyebrow,
  title,
  paragraphs,
}: {
  eyebrow: string
  title: string
  paragraphs: string[]
}) {
  return (
    <section className="mt-6 rounded-[28px] border border-black/8 bg-white px-6 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:px-8">
      <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">{eyebrow}</div>
      <h2 className="mt-2.5 font-display text-[20px] leading-[1.08] text-black">{title}</h2>
      <div className="mt-3.5 max-w-[920px] space-y-2.5">
        {paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-[13px] leading-7 text-black/64">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  )
}
