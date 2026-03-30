import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'

import { useTopicRegistry } from '@/hooks'

type BackendTopic = {
  id: string
  nameZh: string
  focusLabel?: string | null
  summary?: string | null
  paperCount?: number
  nodeCount?: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const COPY = {
  heroEyebrow: 'ArXiv Chronicle Alpha',
  heroTitleLine1: '\u0041\u0049 \u5b66\u672f\u7814\u7a76\u81ea\u52a8\u5316\u540e\u7aef',
  heroTitleLine2: 'AlphaXiv \u98ce\u683c\u6781\u7b80\u9605\u8bfb\u524d\u7aef',
  heroBody:
    '\u5f53\u524d Alpha \u4e3b\u8def\u5f84\u5df2\u7ecf\u6536\u655b\u5230\u4e3b\u9898\u9875\uff1a\u5de6\u4fa7\u67e5\u770b\u4e3b\u9898\u3001\u9636\u6bb5\u3001\u8282\u70b9\u548c\u4ee3\u8868\u8bba\u6587\uff0c\u53f3\u4fa7\u53ea\u5728\u4e3b\u9898\u9875\u63d0\u4f9b grounded chat\u3001\u5f15\u7528\u8df3\u8f6c\u548c\u8bc1\u636e\u5c55\u5f00\u3002',
  enterAlpha: '\u8fdb\u5165 Alpha \u4e3b\u9898\u9875',
  openDemo: '\u6253\u5f00\u6f14\u793a\u4e3b\u9898',
  backendTopic: 'Backend Alpha',
  fallbackTopic: 'Migration Fallback',
  backendSummary:
    '\u8fd9\u4e2a\u4e3b\u9898\u5df2\u7ecf\u8fdb\u5165\u540e\u7aef Alpha \u6570\u636e\u94fe\u8def\uff0c\u53ef\u4ee5\u76f4\u63a5\u67e5\u770b artifact \u4e0e\u4e3b\u9898\u95ee\u7b54\u3002',
  alphaScope: 'Alpha Scope',
  scopeLine1:
    '\u4e3b\u9898\u9875\u662f\u552f\u4e00\u5bf9\u8bdd\u5165\u53e3\uff0c\u524d\u7aef\u53ea\u8d1f\u8d23\u5c55\u793a\u3001\u8df3\u8f6c\u548c\u9ad8\u4eae\u3002',
  scopeLine2:
    '\u540e\u7aef\u8d1f\u8d23\u6a21\u578b\u8def\u7531\u3001\u4e0a\u4e0b\u6587\u88c5\u914d\u3001\u5f15\u7528\u6eaf\u6e90\u3001artifact \u751f\u6210\u548c evidence \u67e5\u8be2\u3002',
  scopeLine3:
    '\u5f53\u524d\u6f14\u793a\u4e3b\u9898\u4e3a `topic-1`\uff0c\u53ef\u76f4\u63a5\u6d4b\u8bd5\u4e3b\u9898\u9875\u95ee\u7b54\u4e0e\u951a\u70b9\u8df3\u8f6c\u3002',
} as const

export function HomePage() {
  const { activeTopics } = useTopicRegistry()
  const [backendTopics, setBackendTopics] = useState<BackendTopic[]>([])

  useEffect(() => {
    let alive = true

    async function loadBackendTopics() {
      try {
        const response = await fetch(`${API_BASE}/api/topics`)
        if (!response.ok) return
        const payload = (await response.json()) as {
          success: boolean
          data?: BackendTopic[]
        }

        if (alive && payload.data) {
          setBackendTopics(payload.data)
        }
      } catch {
        // Keep static topic cards as a fallback.
      }
    }

    void loadBackendTopics()
    return () => {
      alive = false
    }
  }, [])

  const cards = useMemo(() => {
    const staticCards = activeTopics.map((topic) => ({
      id: topic.id,
      nameZh: topic.nameZh,
      focusLabel: topic.focusLabel,
      summary: topic.summary,
      href: `/topic/${topic.id}`,
      source: 'static' as const,
    }))

    const dynamicCards = backendTopics
      .filter((topic) => !staticCards.some((item) => item.id === topic.id))
      .map((topic) => ({
        id: topic.id,
        nameZh: topic.nameZh,
        focusLabel: topic.focusLabel ?? 'Backend Topic',
        summary: topic.summary ?? COPY.backendSummary,
        href: `/topic/${topic.id}`,
        source: 'backend' as const,
      }))

    return [...dynamicCards, ...staticCards]
  }, [activeTopics, backendTopics])

  return (
    <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1120px]">
        <section className="rounded-[32px] border border-black/8 bg-white px-7 py-8 md:px-10 md:py-10">
          <div className="text-[11px] uppercase tracking-[0.28em] text-black/38">{COPY.heroEyebrow}</div>
          <h1 className="mt-4 font-display text-[38px] leading-[1.08] text-black md:text-[56px]">
            {COPY.heroTitleLine1}
            <br />
            {COPY.heroTitleLine2}
          </h1>
          <p className="mt-6 max-w-3xl text-[16px] leading-8 text-black/62">{COPY.heroBody}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={cards[0]?.href ?? '/topic/topic-1'}
              className="inline-flex items-center gap-2 rounded-full border border-black bg-black px-5 py-3 text-sm text-white transition hover:bg-black/90"
            >
              <Sparkles className="h-4 w-4" />
              {COPY.enterAlpha}
            </Link>
            <Link
              to="/topic/topic-1"
              className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm text-black/68 transition hover:border-black/20 hover:text-black"
            >
              <BookOpen className="h-4 w-4" />
              {COPY.openDemo}
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {cards.map((topic) => (
              <Link
                key={topic.id}
                to={topic.href}
                className="group block rounded-[24px] border border-black/8 bg-white px-6 py-6 transition hover:border-black/14 hover:shadow-[0_12px_40px_rgba(17,17,17,0.06)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">
                      {topic.source === 'backend' ? COPY.backendTopic : COPY.fallbackTopic}
                    </div>
                    <h2 className="mt-3 text-[24px] font-semibold leading-[1.2] text-black">{topic.nameZh}</h2>
                    <p className="mt-3 text-[14px] leading-7 text-black/54">{topic.focusLabel}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-black/28 transition group-hover:translate-x-0.5 group-hover:text-black/55" />
                </div>

                <p className="mt-5 max-w-3xl text-[15px] leading-8 text-black/64">{topic.summary}</p>
              </Link>
            ))}
          </div>

          <aside className="rounded-[24px] border border-black/8 bg-[#faf8f3] px-5 py-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-black/38">{COPY.alphaScope}</div>
            <div className="mt-4 space-y-4 text-[14px] leading-7 text-black/62">
              <p>{COPY.scopeLine1}</p>
              <p>{COPY.scopeLine2}</p>
              <p>{COPY.scopeLine3}</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
