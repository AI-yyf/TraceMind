import { Children, isValidElement, useState, useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { MathFormula, MathText } from '@/components/MathFormula'
import { resolveApiAssetUrl } from '@/utils/api'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Evidence reference pattern: ![[figure:id]] or ![[table:id]] or ![[formula:id]]
// ---------------------------------------------------------------------------
const EVIDENCE_REF_RE = /!\[\[(figure|table|formula):([^\]]+)\]\]/giu

function toPlainText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }

  if (Array.isArray(children)) {
    return children.map((child) => toPlainText(child)).join('')
  }

  if (isValidElement(children)) {
    return toPlainText(children.props.children)
  }

  return ''
}

function looksLikeInlineCode(text: string, className?: string) {
  if (className?.includes('language-')) return false
  return !text.includes('\n')
}

function MarkdownCode({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  const text = toPlainText(children).replace(/\n$/, '')
  const isMath = className?.includes('language-math')
  const isDisplayMath = className?.includes('math-display')

  if (isMath) {
    return isDisplayMath ? (
      <MathFormula
        expression={text}
        className="my-6 overflow-x-auto rounded-[16px] border border-black/8 bg-[#faf8f2] px-5 py-5 text-[14px] text-black"
      />
    ) : (
      <MathText as="span" content={`\\(${text}\\)`} className="mx-0.5 inline-flex max-w-full align-middle text-[0.98em] text-black" />
    )
  }

  if (looksLikeInlineCode(text, className)) {
    return (
      <code className="rounded-md bg-[#f3efe6] px-1.5 py-1 font-mono text-[12px] text-black/82">
        {text}
      </code>
    )
  }

  return (
    <code className="block min-w-full whitespace-pre-wrap break-words bg-transparent font-mono text-[12px] leading-6 text-[#f5f5f5]">
      {text}
    </code>
  )
}

// ---------------------------------------------------------------------------
// Academic Figure Component - Proper figure with caption and interpretation
// ---------------------------------------------------------------------------
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const resolvedSrc = resolveApiAssetUrl(src)

  const handleToggleZoom = useCallback(() => setZoomed((prev) => !prev), [])

  if (!resolvedSrc || failed) {
    if (!alt) return null

    return (
      <figure className="my-6">
        <div className="rounded-[16px] border border-dashed border-black/12 bg-[#f8f5ed] px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-black/36">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-black/28">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            Image unavailable
          </div>
          <p className="mt-2 text-[14px] leading-7 text-black/62 italic">{alt}</p>
        </div>
      </figure>
    )
  }

  // Parse caption: if alt contains "—" split into label and description
  const dashIndex = alt?.indexOf('—') ?? -1
  const hasStructuredCaption = dashIndex > 0 && dashIndex < (alt?.length ?? 0) - 1
  const captionLabel = hasStructuredCaption ? alt?.slice(0, dashIndex).trim() : null
  const captionDesc = hasStructuredCaption ? alt?.slice(dashIndex + 1).trim() : alt

  return (
    <>
      <figure className="my-8 overflow-hidden rounded-[20px] border border-black/6 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.06)]">
        <div
          className="group relative cursor-zoom-in bg-[#f9f8f5]"
          onClick={handleToggleZoom}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') handleToggleZoom() }}
        >
          <img
            src={resolvedSrc}
            alt={alt ?? ''}
            className="mx-auto max-h-[520px] w-auto object-contain p-2 transition-transform duration-200 group-hover:scale-[1.01]"
            loading="lazy"
            onError={() => setFailed(true)}
          />
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded-lg bg-black/50 px-2 py-1 text-[11px] text-white/90">Click to zoom</span>
          </div>
        </div>
        {(alt || captionLabel) ? (
          <figcaption className="border-t border-black/5 bg-[#fcfbf8] px-5 py-3">
            {captionLabel ? (
              <>
                <span className="text-[13px] font-semibold text-black/72">{captionLabel}</span>
                {captionDesc ? (
                  <span className="text-[13px] leading-6 text-black/54"> — {captionDesc}</span>
                ) : null}
              </>
            ) : (
              <span className="text-[13px] leading-6 text-black/54 italic">{alt}</span>
            )}
          </figcaption>
        ) : null}
      </figure>

      {zoomed ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={handleToggleZoom}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={resolvedSrc}
            alt={alt ?? ''}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          <button
            className="absolute right-6 top-6 rounded-full bg-white/90 p-2 text-black/70 transition hover:bg-white hover:text-black"
            onClick={handleToggleZoom}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Article Markdown Component - Academic paper rendering
// ---------------------------------------------------------------------------
export function ArticleMarkdown({
  content,
  className,
  dataTestId,
}: {
  content: string
  className?: string
  dataTestId?: string
}) {
  const components: Components = {
    // Title - node/article title, prominent
    h1: ({ children }) => (
      <h1 className="mb-4 mt-2 text-[28px] font-bold leading-[1.18] tracking-[-0.03em] text-black">
        {children}
      </h1>
    ),
    // Section headers - paper titles, synthesis, etc.
    h2: ({ children }) => (
      <h2 className="mt-12 mb-4 flex items-center gap-3 text-[19px] font-semibold leading-[1.3] tracking-[-0.01em] text-black">
        <span className="h-[2px] w-5 rounded-full bg-[#7d1938]/30" />
        {children}
      </h2>
    ),
    // Subsection headers - within paper sections
    h3: ({ children }) => (
      <h3 className="mt-8 mb-2 text-[15px] font-semibold leading-7 text-black/80">
        {children}
      </h3>
    ),
    // Body paragraphs - academic style with proper line height
    p: ({ children }) => (
      <p className="text-[15px] leading-[2] text-black/72 text-justify hyphens-auto">{children}</p>
    ),
    strong: ({ children }) => <strong className="font-semibold text-black/90">{children}</strong>,
    em: ({ children }) => <em className="italic text-black/64">{children}</em>,
    a: ({ href, children }) => {
      if (href?.startsWith('/')) {
        return (
          <Link
            to={href}
            className="rounded-sm px-0.5 text-[#7d1938] underline decoration-[#7d1938]/30 underline-offset-4 transition hover:bg-[#7d1938]/8 hover:decoration-[#7d1938]/60"
          >
            {children}
          </Link>
        )
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm px-0.5 text-[#7d1938] underline decoration-[#7d1938]/30 underline-offset-4 transition hover:bg-[#7d1938]/8 hover:decoration-[#7d1938]/60"
        >
          {children}
        </a>
      )
    },
    ul: ({ children }) => (
      <ul className="space-y-2 pl-5 text-[15px] leading-[1.9] text-black/70">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="space-y-2 pl-5 text-[15px] leading-[1.9] text-black/70">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="marker:text-[#7d1938]/40">
        {children}
      </li>
    ),
    // Blockquote - key insight or emphasis
    blockquote: ({ children }) => (
      <blockquote className="my-6 rounded-r-[16px] border-l-[3px] border-[#7d1938]/40 bg-[#fdf9f5] px-5 py-4 text-[14px] leading-7 text-black/64 shadow-sm">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-10 border-t border-black/6" />
    ),
    pre: ({ children }) => {
      const child = Children.toArray(children)[0]
      if (
        isValidElement(child) &&
        typeof child.props.className === 'string' &&
        child.props.className.includes('language-math')
      ) {
        return <>{child}</>
      }

      return (
        <pre className="my-5 overflow-x-auto rounded-[16px] bg-[#1a1a1a] px-4 py-4 shadow-inner">
          {children}
        </pre>
      )
    },
    code: ({ className: codeClassName, children }) => (
      <MarkdownCode className={codeClassName} children={children} />
    ),
    // Table - academic data presentation
    table: ({ children }) => (
      <div className="my-6 overflow-x-auto rounded-[16px] border border-black/8 bg-white shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-left">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-[#f7f4ed]">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-t border-black/5 transition hover:bg-black/[0.02]">{children}</tr>,
    th: ({ children }) => (
      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/56">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2.5 align-top text-[13px] leading-6 text-black/66">
        {children}
      </td>
    ),
    img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
  }

  return (
    <div
      data-testid={dataTestId}
      className={cn(
        'article-prose break-words',
        'space-y-4',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[&_ol]:list-decimal [&_ul]:list-disc',
        // Academic typography: drop cap on first paragraph
        '[&_h2+div>p:first-child]:first-letter:float-left [&_h2+div>p:first-child]:first-letter:mr-2 [&_h2+div>p:first-child]:first-letter:mt-1 [&_h2+div>p:first-child]:first-letter:text-[36px] [&_h2+div>p:first-child]:first-letter:font-bold [&_h2+div>p:first-child]:first-letter:leading-none [&_h2+div>p:first-child]:first-letter:text-[#7d1938]',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} components={components}>
        {normalizeMarkdown(preprocessEvidenceRefs(content))}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Preprocess evidence references like ![[figure:id]] into standard markdown images.
 * This allows the backend to embed figure references that the markdown renderer can handle.
 */
function preprocessEvidenceRefs(content: string): string {
  return content.replace(
    EVIDENCE_REF_RE,
    (_match, type: string, id: string) => {
      // Convert evidence refs to image syntax with a special prefix
      // The frontend can intercept these via resolveApiAssetUrl
      const assetPath = `/api/evidence/${type}/${id}`
      const label = type === 'figure' ? 'Figure' : type === 'table' ? 'Table' : 'Formula'
      return `![${label} ${id}](${assetPath})`
    },
  )
}

function normalizeMarkdown(content: string) {
  return content.replace(/(^|\n)\$\$([^\n][\s\S]*?[^\n])\$\$(?=\n|$)/g, (_, prefix: string, expression: string) => {
    if (expression.includes('\n')) return `${prefix}$$${expression}$$`
    return `${prefix}$$\n${expression.trim()}\n$$`
  })
}
