import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { MathFormula, MathText } from '@/components/MathFormula'
import { cn } from '@/utils/cn'

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
  tone,
}: {
  className?: string
  children?: ReactNode
  tone: 'assistant' | 'user'
}) {
  const text = toPlainText(children).replace(/\n$/, '')
  const isMath = className?.includes('language-math')
  const isDisplayMath = className?.includes('math-display')

  if (isMath) {
    return isDisplayMath ? (
      <MathFormula
        expression={text}
        className={cn(
          'my-5 overflow-x-auto rounded-[18px] border px-4 py-4 text-[14px]',
          tone === 'assistant' ? 'border-black/8 bg-white text-black' : 'border-white/16 bg-white/8 text-white',
        )}
      />
    ) : (
      <MathText
        as="span"
        content={`\\(${text}\\)`}
        className={cn(
          'mx-0.5 inline-flex max-w-full align-middle text-[0.98em]',
          tone === 'assistant' ? 'text-black' : 'text-white',
        )}
      />
    )
  }

  if (looksLikeInlineCode(text, className)) {
    return (
      <code
        className={cn(
          'rounded-md px-1.5 py-1 font-mono text-[12px]',
          tone === 'assistant' ? 'bg-black/[0.05] text-black' : 'bg-white/12 text-white',
        )}
      >
        {text}
      </code>
    )
  }

  return (
    <code
      className={cn(
        'block min-w-full whitespace-pre-wrap break-words bg-transparent font-mono text-[12px] leading-6',
        tone === 'assistant' ? 'text-white' : 'text-white',
      )}
    >
      {text}
    </code>
  )
}

export function AssistantMarkdown({
  content,
  tone = 'assistant',
  className,
}: {
  content: string
  tone?: 'assistant' | 'user'
  className?: string
}) {
  const components: Components = {
    h1: ({ children }) => (
      <h1 className={cn('mt-1 text-[22px] font-semibold leading-[1.35] tracking-[-0.02em]', tone === 'assistant' ? 'text-black' : 'text-white')}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className={cn('mt-5 text-[18px] font-semibold leading-[1.45]', tone === 'assistant' ? 'text-black' : 'text-white')}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className={cn('mt-4 text-[15px] font-semibold leading-7', tone === 'assistant' ? 'text-black/90' : 'text-white')}>
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className={cn('text-[14px] leading-7', tone === 'assistant' ? 'text-black/72' : 'text-white/88')}>{children}</p>
    ),
    strong: ({ children }) => <strong className={cn('font-semibold', tone === 'assistant' ? 'text-black' : 'text-white')}>{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'underline underline-offset-4 transition',
          tone === 'assistant' ? 'text-black decoration-black/20 hover:decoration-black/70' : 'text-white decoration-white/30 hover:decoration-white/80',
        )}
      >
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="space-y-2 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="space-y-2 pl-5">{children}</ol>,
    li: ({ children }) => <li className={cn('text-[14px] leading-7 marker:text-black/30', tone === 'assistant' ? 'text-black/72' : 'text-white/88 marker:text-white/45')}>{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={cn(
          'rounded-r-[18px] border-l-[3px] pl-4 pr-2 italic',
          tone === 'assistant' ? 'border-black/12 text-black/62' : 'border-white/22 text-white/72',
        )}
      >
        {children}
      </blockquote>
    ),
    hr: () => <hr className={cn('my-5 border-t', tone === 'assistant' ? 'border-black/8' : 'border-white/12')} />,
    pre: ({ children }) => {
      const child = Children.toArray(children)[0]
      if (isValidElement(child) && typeof child.props.className === 'string' && child.props.className.includes('language-math')) {
        return <>{child}</>
      }

      return (
        <pre
          className={cn(
            'my-4 overflow-x-auto rounded-[18px] px-4 py-4 shadow-inner',
            tone === 'assistant' ? 'bg-[#111111] text-white' : 'bg-white/8 text-white',
          )}
        >
          {children}
        </pre>
      )
    },
    code: ({ className, children }) => <MarkdownCode className={className} children={children} tone={tone} />,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className={cn('min-w-full border-separate border-spacing-0 overflow-hidden rounded-[18px] text-left', tone === 'assistant' ? 'border border-black/8' : 'border border-white/12')}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className={cn(tone === 'assistant' ? 'bg-black/[0.03]' : 'bg-white/8')}>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className={cn(tone === 'assistant' ? 'border-t border-black/6' : 'border-t border-white/10')}>{children}</tr>,
    th: ({ children }) => (
      <th className={cn('px-4 py-3 text-[12px] font-semibold', tone === 'assistant' ? 'text-black/72' : 'text-white/78')}>{children}</th>
    ),
    td: ({ children }) => (
      <td className={cn('px-4 py-3 align-top text-[13px] leading-6', tone === 'assistant' ? 'text-black/66' : 'text-white/82')}>{children}</td>
    ),
    img: ({ src, alt }) =>
      src ? (
        <img
          src={src}
          alt={alt ?? ''}
          className="my-4 w-full rounded-[18px] border border-black/8 object-cover shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
          loading="lazy"
        />
      ) : null,
  }

  return (
    <div
      className={cn(
        'space-y-4 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ol]:list-decimal [&_ul]:list-disc',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} components={components}>
        {normalizeMarkdown(content)}
      </ReactMarkdown>
    </div>
  )
}

function normalizeMarkdown(content: string) {
  return content.replace(/(^|\n)\$\$([^\n][\s\S]*?[^\n])\$\$(?=\n|$)/g, (_, prefix: string, expression: string) => {
    if (expression.includes('\n')) return `${prefix}$$${expression}$$`
    return `${prefix}$$\n${expression.trim()}\n$$`
  })
}
