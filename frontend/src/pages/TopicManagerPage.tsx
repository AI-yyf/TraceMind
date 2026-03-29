import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Archive, RotateCcw, Settings2 } from 'lucide-react'

import { ThemeSidebar } from '@/components/ThemeSidebar'
import { TopicPrefEditor } from '@/components/TopicPrefEditor'
import { useTopicRegistry } from '@/hooks'
import type { TopicId, TopicPreferenceOverrides } from '@/types/tracker'

export function TopicManagerPage() {
  const {
    activeTopics,
    archivedTopics,
    catalogMap,
    activeEntries,
    archiveTopic,
    moveTopic,
    restoreTopic,
    updateTopicPreferences,
    resetTopicPreferences,
  } = useTopicRegistry()

  const [editingTopicId, setEditingTopicId] = useState<TopicId | null>(null)

  const libraryTopics = useMemo(
    () => [...activeTopics, ...archivedTopics].sort((left, right) => left.nameZh.localeCompare(right.nameZh, 'zh-CN')),
    [activeTopics, archivedTopics],
  )

  const editingCatalog = editingTopicId ? catalogMap[editingTopicId] : null

  const handleSavePreferences = (topicId: TopicId, preferences: TopicPreferenceOverrides) => {
    updateTopicPreferences(topicId, preferences)
  }

  const handleResetPreferences = (topicId: TopicId) => {
    resetTopicPreferences(topicId)
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <ThemeSidebar />

      <main className="px-4 pb-16 pt-4 md:px-6 xl:ml-[88px] xl:px-10 xl:pt-8">
        <div className="mx-auto max-w-[1180px]">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm text-black/70 transition hover:border-black/20 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            返回总览
          </Link>

          <section className="mt-5 rounded-[36px] border border-black/8 bg-[#fbfaf7] px-6 py-8 md:px-8">
            <div className="text-[11px] tracking-[0.34em] text-red-600">内部维护</div>
            <h1 className="mt-4 font-display text-[34px] leading-[1.1] text-black md:text-[50px]">主题管理</h1>
            <p className="mt-4 max-w-4xl text-[15px] leading-8 text-black/64">
              这里决定网页当前展示哪些主题，以及它们的排序和追踪偏好。修改偏好后，
              skill 在下次生成内容时会使用新的配置。
            </p>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-[32px] border border-black/8 bg-white px-6 py-6">
              <div className="text-[11px] tracking-[0.24em] text-red-600">活跃主题</div>
              <div className="mt-5 space-y-4">
                {activeTopics.map((topic, index) => {
                  const entry = activeEntries.find((item) => item.topicId === topic.id)
                  const hasCustomPrefs = Boolean(entry?.preferences && Object.keys(entry.preferences).length > 0)
                  const prefs = entry?.preferences

                  return (
                    <article key={topic.id} className="rounded-[24px] border border-black/8 bg-[#fafafa] px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <div className="text-[11px] tracking-[0.22em] text-black/34">
                              位置 {String(index + 1).padStart(2, '0')}
                            </div>
                            {hasCustomPrefs && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                                已自定义
                              </span>
                            )}
                          </div>
                          <div className="mt-3 text-[22px] font-semibold leading-9 text-black">
                            {prefs?.nameZh ?? topic.nameZh}
                          </div>
                          <p className="mt-2 text-sm text-black/48">{prefs?.focusLabel ?? topic.focusLabel}</p>
                          {prefs?.problemPreference && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {prefs.problemPreference.map((pref) => (
                                <span
                                  key={pref}
                                  className="rounded-full border border-black/6 bg-white px-2 py-0.5 text-[11px] text-black/50"
                                >
                                  {pref}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="mt-3 text-[15px] leading-8 text-black/64">{topic.timelineDigest}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => moveTopic(topic.id, 'up')}
                            className="rounded-full border border-black/10 px-3 py-2 text-xs text-black/60 transition hover:border-black/20 hover:text-black"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTopic(topic.id, 'down')}
                            className="rounded-full border border-black/10 px-3 py-2 text-xs text-black/60 transition hover:border-black/20 hover:text-black"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTopicId(topic.id)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs transition',
                              hasCustomPrefs
                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : 'border-black/10 text-black/60 hover:border-black/20 hover:text-black',
                            )}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            偏好
                          </button>
                          <button
                            type="button"
                            onClick={() => archiveTopic(topic.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs text-black/60 transition hover:border-black/20 hover:text-black"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            归档
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[32px] border border-black/8 bg-white px-6 py-6">
              <div className="text-[11px] uppercase tracking-[0.24em] text-red-600">已归档主题</div>
              <div className="mt-5 space-y-4">
                {archivedTopics.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-black/10 px-5 py-6 text-sm leading-7 text-black/48">
                    当前没有归档主题。
                  </div>
                ) : (
                  archivedTopics.map((topic) => (
                    <article key={topic.id} className="rounded-[24px] border border-black/8 bg-[#fafafa] px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-[11px] tracking-[0.22em] text-black/34">已归档</div>
                          <div className="mt-3 text-[22px] font-semibold leading-9 text-black">{topic.nameZh}</div>
                          <p className="mt-3 text-[15px] leading-8 text-black/64">{topic.timelineDigest}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreTopic(topic.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs text-black/60 transition hover:border-black/20 hover:text-black"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          恢复
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-[32px] border border-black/8 bg-white px-6 py-6">
            <div className="text-[11px] tracking-[0.24em] text-red-600">主题目录</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {libraryTopics.map((topic) => (
                <article key={topic.id} className="rounded-[24px] border border-black/8 bg-[#fafafa] px-5 py-5">
                  <div className="text-[18px] font-semibold leading-8 text-black">{topic.nameZh}</div>
                  <div className="mt-2 text-sm text-black/48">{topic.focusLabel}</div>
                  <p className="mt-3 text-[15px] leading-8 text-black/64">{topic.editorialThesis}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {topic.catalog.problemPreference.slice(0, 4).map((pref) => (
                      <span
                        key={pref}
                        className="rounded-full border border-black/6 bg-white px-2 py-0.5 text-[11px] text-black/50"
                      >
                        {pref}
                      </span>
                    ))}
                    {topic.catalog.problemPreference.length > 4 && (
                      <span className="text-[11px] text-black/30">
                        +{topic.catalog.problemPreference.length - 4}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      {editingTopicId && editingCatalog && (
        <TopicPrefEditor
          topicId={editingTopicId}
          defaults={{
            problemPreference: editingCatalog.problemPreference,
            queryTags: editingCatalog.queryTags,
            maxPaperIntervalDays: undefined,
            nameZh: editingCatalog.nameZh,
            focusLabel: editingCatalog.focusLabel,
            originQuestionDefinition: editingCatalog.originQuestionDefinition,
          }}
          overrides={activeEntries.find((item) => item.topicId === editingTopicId)?.preferences}
          onSave={handleSavePreferences}
          onReset={handleResetPreferences}
          onClose={() => setEditingTopicId(null)}
        />
      )}
    </div>
  )
}

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}
