import { createElement, useEffect, useRef } from 'react'

const SCRIPT_ID = 'mathjax-script'
const SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js'

export function ensureMathJax() {
  if (window.MathJax?.typesetPromise) {
    return Promise.resolve()
  }

  if (window.__mathJaxLoadingPromise) {
    return window.__mathJaxLoadingPromise
  }

  // MathJax 配置已在 index.html 中定义，这里只初始化对象
  if (!window.MathJax) {
    window.MathJax = {}
  }

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (existing) {
    window.__mathJaxLoadingPromise = new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(undefined), { once: true })
      existing.addEventListener('error', reject, { once: true })
    })
    return window.__mathJaxLoadingPromise
  }

  window.__mathJaxLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.src = SCRIPT_SRC
    script.onload = () => resolve(undefined)
    script.onerror = reject
    document.head.appendChild(script)
  })

  return window.__mathJaxLoadingPromise
}

function useMathTypeset(content: string) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let cancelled = false

    ensureMathJax().then(() => {
      if (cancelled || !ref.current || !window.MathJax?.typesetPromise) return
      window.MathJax.typesetClear?.([ref.current])
      window.MathJax.typesetPromise([ref.current]).catch(() => undefined)
    })

    return () => {
      cancelled = true
    }
  }, [content])

  return ref
}

export function MathText({
  as = 'div',
  content,
  className = '',
}: {
  as?: 'div' | 'p' | 'span' | 'figcaption' | 'td' | 'th'
  content: string
  className?: string
}) {
  const ref = useMathTypeset(content)

  return createElement(as, { ref, className }, content)
}

export function MathFormula({
  expression,
  className = '',
}: {
  expression: string
  className?: string
}) {
  return <MathText content={`\\[${expression}\\]`} className={className} />
}
