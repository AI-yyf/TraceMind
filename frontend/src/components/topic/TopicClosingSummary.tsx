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
    <section className="mt-10 border-t border-black/8 px-1 pt-8">
      <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">{eyebrow}</div>
      <h2 className="mt-2.5 max-w-[880px] font-display text-[20px] leading-[1.08] text-black md:text-[24px]">
        {title}
      </h2>
      <div className="mt-4 max-w-[880px] space-y-3">
        {paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-[14px] leading-8 text-black/64">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  )
}
