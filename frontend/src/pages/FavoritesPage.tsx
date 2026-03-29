import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer, Trash2 } from 'lucide-react'

import { MathText } from '@/components/MathFormula'
import { useFavorites, useTopicRegistry } from '@/hooks'

export function FavoritesPage() {
  const { favorites, removeFavorite } = useFavorites()
  const { allTopicMap } = useTopicRegistry()
  const grouped = useMemo(() => favorites, [favorites])

  return (
    <main className="px-4 pb-16 pt-6 md:px-6 xl:px-10 xl:pt-8">
      <div className="mx-auto max-w-[980px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm text-black/72"
          >
            <ArrowLeft className="h-4 w-4" />
            返回总览
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white"
          >
            <Printer className="h-4 w-4" />
            导出 PDF
          </button>
        </div>

        <header className="mt-6 rounded-[34px] border border-black/8 bg-white px-6 py-6 md:px-8">
          <div className="text-[11px] uppercase tracking-[0.34em] text-black/38">Favorites</div>
          <h1 className="mt-4 font-display text-[34px] leading-[1.12] text-black md:text-[48px]">收藏</h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-8 text-black/66">
            这里会收起你在论文页里标记下来的重要段落。需要整理时，可以直接导出为 PDF，形成自己的研究摘录。
          </p>
        </header>

        <section className="mt-8 space-y-5">
          {grouped.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-black/12 bg-[#fafafa] px-6 py-10 text-center text-sm leading-7 text-black/50">
              还没有收藏内容。进入任意论文页后，标记你想保留的段落，这里就会自动汇总。
            </div>
          ) : (
            grouped.map((favorite) => (
              <article key={favorite.id} className="rounded-[30px] border border-black/8 bg-white px-6 py-6 md:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.32em] text-red-600">
                      {favorite.topicId ? allTopicMap[favorite.topicId]?.nameZh ?? '主题摘录' : '研究摘录'}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-black">{favorite.paperTitleZh}</h2>
                    <div className="mt-2 text-sm text-black/48">{favorite.excerptTitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFavorite(favorite.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs text-black/60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    移除
                  </button>
                </div>

                <div className="mt-5 space-y-4 text-[15px] leading-8 text-black/72">
                  {favorite.paragraphs.map((paragraph) => (
                    <MathText key={paragraph} as="p" content={paragraph} />
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  )
}
