import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Compass,
  Home,
  Library,
  MessageSquare,
  RefreshCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
} from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'
import {
  TOPIC_REBUILD_EVENT,
  TOPIC_WORKBENCH_OPEN_EVENT,
} from '@/utils/workbench-events'

type ThemeSidebarProps = { onSearchClick?: () => void }

function isActivePath(pathname: string, target: string) {
  return (
    pathname === target ||
    pathname.startsWith(`${target}/`) ||
    pathname.startsWith(`${target}?`)
  )
}

export function ThemeSidebar({ onSearchClick }: ThemeSidebarProps) {
  const location = useLocation()
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const navText = (id: string, fallback: string) => copy(id, t(id, fallback))

  const primaryNav = useMemo(
    () =>
      [
        { to: '/', copyId: 'nav.home', fallback: 'Home', icon: Home },
        { to: '/manage/topics', copyId: 'nav.topics', fallback: 'Topics', icon: Library },
        { to: '/research', copyId: 'nav.orchestration', fallback: 'Orchestration', icon: Sparkles },
        { to: '/favorites', copyId: 'nav.favorites', fallback: 'Notebook', icon: Star },
        { to: '/today', copyId: 'nav.snapshot', fallback: 'Snapshot', icon: Compass },
        { to: '/settings', copyId: 'nav.settings', fallback: 'Settings', icon: Settings2 },
      ] as const,
    [],
  )

  const topicRouteMatch = location.pathname.match(/^\/topic\/([^/]+)(?:\/research)?$/u)
  const currentTopicId =
    topicRouteMatch?.[1] && topicRouteMatch[1] !== 'create' ? topicRouteMatch[1] : null

  return (
    <>
      <aside className="fixed left-0 top-0 z-[60] hidden h-screen w-[96px] border-r border-black/[0.04] bg-white/94 px-3 py-5 backdrop-blur xl:flex xl:flex-col xl:items-center">
        <Link to="/" className="flex w-full flex-col items-center justify-center text-center">
          <div className="font-display text-[20px] font-semibold leading-none text-black">
            {copy('brand.title', t('brand.title', 'TraceMind'))}
          </div>
          <div className="mt-2 text-[10px] tracking-[0.18em] text-black/34">
            {copy('brand.subtitle', t('brand.subtitle', 'TraceMind'))}
          </div>
        </Link>

        <div className="mt-8 flex w-full flex-col items-center gap-2">
          {primaryNav.map((item) => {
            const Icon = item.icon
            const active = isActivePath(location.pathname, item.to)

            return (
              <Link
                key={item.to}
                to={item.to}
                data-onboarding={item.to === '/settings' ? 'settings' : undefined}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] transition',
                  active ? 'bg-black text-white' : 'text-black/52 hover:bg-black/[0.03] hover:text-black',
                )}
                title={navText(item.copyId, item.fallback)}
              >
                <Icon className="h-4 w-4" />
                <span>{navText(item.copyId, item.fallback)}</span>
              </Link>
            )
          })}

          {onSearchClick ? (
            <button
              type="button"
              onClick={onSearchClick}
              data-onboarding="global-search"
              className="flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] text-black/52 transition hover:bg-black/[0.03] hover:text-black"
              aria-label={navText('nav.search', 'Search')}
            >
              <Search className="h-4 w-4" />
              <span>{navText('nav.search', 'Search')}</span>
            </button>
          ) : null}
        </div>

        {currentTopicId ? (
          <div className="mt-8 flex w-full flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(TOPIC_WORKBENCH_OPEN_EVENT))}
              className="flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] text-black/52 transition hover:bg-black/[0.03] hover:text-black"
              title={navText('nav.chat', 'Chat')}
            >
              <MessageSquare className="h-4 w-4" />
              <span>{navText('nav.chat', 'Chat')}</span>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(TOPIC_REBUILD_EVENT))}
              className="flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] text-black/52 transition hover:bg-black/[0.03] hover:text-black"
              title={navText('nav.refreshTopic', 'Refresh Topic')}
            >
              <RefreshCcw className="h-4 w-4" />
              <span>{navText('nav.refreshTopicShort', 'Refresh')}</span>
            </button>
          </div>
        ) : null}
      </aside>

      <div className="sticky top-0 z-50 border-b border-black/6 bg-white/96 px-4 py-3 backdrop-blur xl:hidden">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-black/8 bg-white text-black/62"
            aria-label={navText('nav.home', 'Home')}
          >
            <Home className="h-4 w-4" />
          </Link>
          {onSearchClick ? (
            <button
              type="button"
              onClick={onSearchClick}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-black/8 bg-white text-black/62"
              aria-label={navText('nav.search', 'Search')}
            >
              <Search className="h-4 w-4" />
            </button>
          ) : null}
          <div className="flex flex-1 gap-2 overflow-x-auto">
            {primaryNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-2 text-xs transition',
                  isActivePath(location.pathname, item.to)
                    ? 'border-black bg-black text-white'
                    : 'border-black/8 bg-white text-black/56',
                )}
              >
                {navText(item.copyId, item.fallback)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
