import { Link, useLocation } from 'react-router-dom'
import { BookMarked, Bot, Brain, CarFront, Cpu, Home, Search, Star, CalendarDays } from 'lucide-react'

import { useTopicRegistry } from '@/hooks'
import type { TopicId } from '@/types/tracker'
import { cn } from '@/utils/cn'

const iconMap = {
  'autonomous-driving': CarFront,
  'transformer-innovation': Cpu,
  'bio-inspired-ml': Brain,
  'embodied-vla': Bot,
  agent: BookMarked,
} as Record<string, typeof CarFront>

type ThemeSidebarProps = {
  activeThemeId?: TopicId | null
  onSearchClick?: () => void
}

export function ThemeSidebar({ activeThemeId = null, onSearchClick }: ThemeSidebarProps) {
  const location = useLocation()
  const { activeTopics } = useTopicRegistry()

  return (
    <>
      <aside className="fixed left-0 top-0 z-[60] hidden h-screen w-[88px] border-r border-black/8 bg-white xl:flex xl:flex-col xl:items-center xl:py-6">
        <Link
          to="/"
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-[18px] border transition',
            location.pathname === '/'
              ? 'border-red-500 bg-red-50 text-red-700'
              : 'border-black/10 bg-white text-black/60 hover:border-black/20 hover:text-black',
          )}
          title="首页"
        >
          <Home className="h-4 w-4" />
        </Link>

        {onSearchClick && (
          <button
            type="button"
            onClick={onSearchClick}
            className="mt-3 flex h-12 w-12 items-center justify-center rounded-[18px] border border-black/10 bg-[#faf7f2] text-black/60 transition hover:border-black/20 hover:text-black"
            aria-label="打开搜索"
            title="搜索"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        <Link
          to="/today"
          className={cn(
            'mt-3 flex h-12 w-12 items-center justify-center rounded-[18px] border transition',
            location.pathname === '/today'
              ? 'border-red-500 bg-red-50 text-red-700'
              : 'border-black/10 bg-white text-black/50 hover:border-black/20 hover:text-black',
          )}
          title="今日研究"
        >
          <CalendarDays className="h-4 w-4" />
        </Link>

        <Link
          to="/favorites"
          className={cn(
            'mt-3 flex h-12 w-12 items-center justify-center rounded-[18px] border transition',
            location.pathname === '/favorites'
              ? 'border-red-500 bg-red-50 text-red-700'
              : 'border-black/10 bg-white text-black/50 hover:border-black/20 hover:text-black',
          )}
          title="收藏"
        >
          <Star className="h-4 w-4" />
        </Link>

        <div className="mt-8 flex w-full flex-1 flex-col items-center gap-3 px-3">
          {activeTopics.map((topic) => {
            const Icon = iconMap[topic.id] ?? BookMarked
            const active =
              activeThemeId === topic.id ||
              location.pathname === `/topic/${topic.id}` ||
              location.pathname === `/topic/${topic.id}/research` ||
              location.search.includes(`theme=${topic.id}`)

            return (
              <Link
                key={topic.id}
                to={`/topic/${topic.id}`}
                title={topic.nameZh}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-[18px] border transition',
                  active
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-black/10 bg-white text-black/50 hover:border-black/20 hover:text-black',
                )}
              >
                <Icon className="h-4 w-4" />
              </Link>
            )
          })}
        </div>
      </aside>

      <div className="sticky top-0 z-50 border-b border-black/8 bg-white/95 px-4 py-3 backdrop-blur xl:hidden">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border',
              location.pathname === '/'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-black/10 bg-white text-black/58',
            )}
            aria-label="首页"
          >
            <Home className="h-4 w-4" />
          </Link>

          {onSearchClick && (
            <button
              type="button"
              onClick={onSearchClick}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-black/10 bg-[#faf7f2] text-black/58"
              aria-label="打开搜索"
            >
              <Search className="h-4 w-4" />
            </button>
          )}

          <Link
            to="/today"
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border',
              location.pathname === '/today'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-black/10 bg-white text-black/58',
            )}
            aria-label="今日研究"
          >
            <CalendarDays className="h-4 w-4" />
          </Link>

          <Link
            to="/favorites"
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border',
              location.pathname === '/favorites'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-black/10 bg-white text-black/58',
            )}
            aria-label="收藏"
          >
            <Star className="h-4 w-4" />
          </Link>

          <div className="flex flex-1 gap-2 overflow-x-auto">
            {activeTopics.map((topic) => {
              const active =
                activeThemeId === topic.id ||
                location.pathname === `/topic/${topic.id}` ||
                location.pathname === `/topic/${topic.id}/research` ||
                location.search.includes(`theme=${topic.id}`)

              return (
                <Link
                  key={topic.id}
                  to={`/topic/${topic.id}`}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-3 py-2 text-xs transition',
                    active
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-black/10 bg-white text-black/58',
                  )}
                >
                  {topic.nameZh}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
