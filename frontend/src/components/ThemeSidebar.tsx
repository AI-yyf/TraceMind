import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Check,
  ChevronUp,
  Compass,
  Globe,
  Home,
  Library,
  MessageSquare,
  RefreshCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
  Workflow,
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

// Animation keyframes for smooth panel entrance
const panelAnimationStyle = `
  @keyframes langPanelEnter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes scaleIn {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .lang-panel-animate {
    animation: langPanelEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
`

export function ThemeSidebar({ onSearchClick }: ThemeSidebarProps) {
  const location = useLocation()
  const { copy } = useProductCopy()
  const {
    t,
    preference,
    setPrimaryLanguage,
    setDisplayMode,
    supportedLanguages,
  } = useI18n()
  const navText = (id: string, fallback: string) => copy(id, t(id, fallback))

  // Language switcher state for sidebar
  const [langExpanded, setLangExpanded] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const langPanelRef = useRef<HTMLDivElement | null>(null)
  const langButtonRef = useRef<HTMLButtonElement | null>(null)
  const langItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Inject animation styles once
  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.textContent = panelAnimationStyle
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  // Close language panel on outside click
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (langPanelRef.current && !langPanelRef.current.contains(event.target as Node)) {
        setLangExpanded(false)
        setFocusedIndex(-1)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const selectLanguage = useCallback((code: string) => {
    setPrimaryLanguage(code as (typeof supportedLanguages)[number]['code'])
    setLangExpanded(false)
    setFocusedIndex(-1)
  }, [setPrimaryLanguage])

  // Keyboard navigation for language panel
  useEffect(() => {
    if (!langExpanded) return

    function handleKeyDown(event: KeyboardEvent) {
      const totalItems = supportedLanguages.length + 2 // languages + 2 mode buttons

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1))
          break
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex((prev) => (prev >= totalItems - 1 ? 0 : prev + 1))
          break
        case 'Home':
          event.preventDefault()
          setFocusedIndex(0)
          break
        case 'End':
          event.preventDefault()
          setFocusedIndex(totalItems - 1)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < supportedLanguages.length) {
            selectLanguage(supportedLanguages[focusedIndex].code)
          } else if (focusedIndex === supportedLanguages.length) {
            setDisplayMode('monolingual')
          } else if (focusedIndex === supportedLanguages.length + 1) {
            setDisplayMode('bilingual')
          }
          break
        case 'Escape':
          event.preventDefault()
          setLangExpanded(false)
          setFocusedIndex(-1)
          langButtonRef.current?.focus()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedIndex, langExpanded, selectLanguage, setDisplayMode, supportedLanguages])

  // Focus management
  useEffect(() => {
    if (langExpanded && focusedIndex >= 0) {
      langItemRefs.current[focusedIndex]?.focus()
    }
  }, [langExpanded, focusedIndex])

  const currentLanguage = supportedLanguages.find((item) => item.code === preference.primary) ?? supportedLanguages[0]

  const toggleLanguagePanel = useCallback(() => {
    setLangExpanded((prev) => {
      if (!prev) {
        setFocusedIndex(0)
      } else {
        setFocusedIndex(-1)
      }
      return !prev
    })
  }, [])

  const primaryNav = useMemo(
    () =>
      [
        { to: '/', copyId: 'nav.home', fallback: 'Home', icon: Home },
        { to: '/manage/topics', copyId: 'nav.topics', fallback: 'Topics', icon: Library },
        { to: '/workbench', copyId: 'nav.workbench', fallback: 'Workbench', icon: Workflow },
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

  // Quick language toggle (shift-click cycles through languages)
  const handleLanguageButtonAuxClick = useCallback((event: React.MouseEvent) => {
    if (event.button === 1 || event.shiftKey) { // Middle click or shift click
      event.preventDefault()
      const currentIndex = supportedLanguages.findIndex((l) => l.code === preference.primary)
      const nextIndex = (currentIndex + 1) % supportedLanguages.length
      setPrimaryLanguage(supportedLanguages[nextIndex].code as (typeof supportedLanguages)[number]['code'])
    }
  }, [preference.primary, setPrimaryLanguage, supportedLanguages])

  return (
    <>
      <aside className="fixed left-0 top-0 z-[60] hidden h-screen w-[96px] border-r border-black/[0.04] bg-white/94 px-3 py-5 backdrop-blur xl:flex xl:flex-col xl:items-center">
        {/* Brand */}
        <Link
          to="/"
          className="flex w-full flex-col items-center justify-center text-center group"
        >
          <div className="font-display text-[20px] font-semibold leading-none text-black transition-colors group-hover:text-[#d1aa5c]">
            {copy('brand.title', t('brand.title', 'TraceMind'))}
          </div>
          <div className="mt-2 text-[10px] tracking-[0.18em] text-black/34 transition-colors group-hover:text-black/50">
            {copy('brand.subtitle', t('brand.subtitle', 'TraceMind'))}
          </div>
        </Link>

        {/* Primary Navigation */}
        <nav className="mt-8 flex w-full flex-col items-center gap-2" aria-label="Primary">
          {primaryNav.map((item) => {
            const Icon = item.icon
            const active = isActivePath(location.pathname, item.to)

            return (
              <Link
                key={item.to}
                to={item.to}
                data-onboarding={item.to === '/settings' ? 'settings' : undefined}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] transition-all duration-200',
                  active
                    ? 'bg-black text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]'
                    : 'text-black/52 hover:bg-black/[0.03] hover:text-black hover:shadow-sm',
                )}
                title={navText(item.copyId, item.fallback)}
              >
                <Icon className="h-4 w-4 transition-transform duration-200 hover:scale-110" />
                <span className="font-medium">{navText(item.copyId, item.fallback)}</span>
              </Link>
            )
          })}

          {/* Global Search */}
          {onSearchClick ? (
            <button
              type="button"
              onClick={onSearchClick}
              data-onboarding="global-search"
              className="flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] text-black/52 transition-all duration-200 hover:bg-black/[0.03] hover:text-black hover:shadow-sm"
              aria-label={navText('nav.search', 'Search')}
            >
              <Search className="h-4 w-4 transition-transform duration-200 hover:scale-110" />
              <span className="font-medium">{navText('nav.search', 'Search')}</span>
            </button>
          ) : null}
        </nav>

        {/* Topic-specific Actions */}
        {currentTopicId ? (
          <div className="mt-8 flex w-full flex-col items-center gap-2" aria-label="Topic actions">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(TOPIC_WORKBENCH_OPEN_EVENT))}
              className="flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] text-black/52 transition-all duration-200 hover:bg-amber-50 hover:text-amber-700 hover:shadow-sm"
              title={navText('nav.chat', 'Chat')}
            >
              <MessageSquare className="h-4 w-4 transition-transform duration-200 hover:scale-110" />
              <span className="font-medium">{navText('nav.chat', 'Chat')}</span>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(TOPIC_REBUILD_EVENT))}
              className="flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] text-black/52 transition-all duration-200 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-sm"
              title={navText('nav.refreshTopic', 'Refresh Topic')}
            >
              <RefreshCcw className="h-4 w-4 transition-transform duration-200 hover:scale-110 hover:rotate-180" />
              <span className="font-medium">{navText('nav.refreshTopicShort', 'Refresh')}</span>
            </button>
          </div>
        ) : null}

        {/* Language Switcher - Premium Bottom Position */}
        <div className="mt-auto flex w-full flex-col items-center">
          <div ref={langPanelRef} className="relative w-full">
            {/* Main Language Button */}
            <button
              ref={langButtonRef}
              type="button"
              onClick={toggleLanguagePanel}
              onAuxClick={handleLanguageButtonAuxClick}
              className={cn(
                'group flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[10px] transition-all duration-200',
                langExpanded
                  ? 'bg-black text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]'
                  : 'text-black/52 hover:bg-black/[0.03] hover:text-black hover:shadow-sm',
              )}
              title={t('language.switchLabel', 'Interface language')}
              aria-expanded={langExpanded}
              aria-haspopup="menu"
            >
              <Globe className={cn(
                "h-4 w-4 transition-transform duration-300",
                langExpanded && "rotate-180"
              )} />
              <span className="font-medium tracking-wide">{currentLanguage.code.toUpperCase()}</span>
              <ChevronUp className={cn(
                "h-2.5 w-2.5 absolute right-2 top-1/2 -translate-y-1/2 transition-transform duration-200",
                langExpanded ? "rotate-0" : "rotate-180"
              )} />
            </button>

            {/* Dropdown Panel - Smooth Animation */}
            {langExpanded && (
              <div
                className="lang-panel-animate absolute bottom-0 left-full ml-3 w-[280px] max-h-[70vh] overflow-y-auto rounded-[20px] border border-black/[0.06] bg-white/[0.98] shadow-[0_12px_40px_rgba(15,23,42,0.14)] backdrop-blur-md"
                role="menu"
                aria-label={t('language.switchLabel', 'Interface language')}
              >
                {/* Section: Languages */}
                <div className="p-2">
                  <div className="px-2 py-1.5 text-[9px] uppercase tracking-[0.2em] text-black/32 font-medium">
                    {t('language.sectionLanguages', 'Languages')}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {supportedLanguages.map((lang, index) => {
                      const isActive = preference.primary === lang.code
                      return (
                        <button
                          key={lang.code}
                          ref={(el) => { langItemRefs.current[index] = el }}
                          type="button"
                          onClick={() => selectLanguage(lang.code)}
                          tabIndex={langExpanded ? 0 : -1}
                          className={cn(
                            'flex items-center justify-between gap-1 rounded-[14px] px-3 py-2 text-[11px] transition-all duration-150',
                            isActive
                              ? 'bg-black text-white shadow-sm'
                              : 'bg-[var(--surface-soft)] text-black/68 hover:bg-black/[0.04] hover:text-black',
                            focusedIndex === index && 'ring-2 ring-[#d1aa5c]/50'
                          )}
                          role="menuitemradio"
                          aria-checked={isActive}
                        >
                          <span className="truncate font-medium">{lang.nameLocal}</span>
                          {isActive && (
                            <Check className="h-3 w-3 shrink-0 animate-[scaleIn_0.15s_ease-out]" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Section: Display Mode */}
                <div className="border-t border-black/[0.06] p-2">
                  <div className="px-2 py-1.5 text-[9px] uppercase tracking-[0.2em] text-black/32 font-medium">
                    {t('language.sectionDisplay', 'Display')}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    <button
                      ref={(el) => { langItemRefs.current[supportedLanguages.length] = el }}
                      type="button"
                      onClick={() => setDisplayMode('monolingual')}
                      tabIndex={langExpanded ? 0 : -1}
                      className={cn(
                        'flex-1 rounded-full py-2 text-[10px] font-medium transition-all duration-150',
                        preference.mode === 'monolingual'
                          ? 'bg-black text-white shadow-sm'
                          : 'bg-[var(--surface-soft)] text-black/64 hover:bg-black/[0.04] hover:text-black',
                        focusedIndex === supportedLanguages.length && 'ring-2 ring-[#d1aa5c]/50'
                      )}
                      role="menuitemradio"
                      aria-checked={preference.mode === 'monolingual'}
                    >
                      {t('language.modeMonolingual', 'Single')}
                    </button>
                    <button
                      ref={(el) => { langItemRefs.current[supportedLanguages.length + 1] = el }}
                      type="button"
                      onClick={() => setDisplayMode('bilingual')}
                      tabIndex={langExpanded ? 0 : -1}
                      className={cn(
                        'flex-1 rounded-full py-2 text-[10px] font-medium transition-all duration-150',
                        preference.mode === 'bilingual'
                          ? 'bg-black text-white shadow-sm'
                          : 'bg-[var(--surface-soft)] text-black/64 hover:bg-black/[0.04] hover:text-black',
                        focusedIndex === supportedLanguages.length + 1 && 'ring-2 ring-[#d1aa5c]/50'
                      )}
                      role="menuitemradio"
                      aria-checked={preference.mode === 'bilingual'}
                    >
                      {t('language.modeBilingual', 'Dual')}
                    </button>
                  </div>
                </div>

                {/* Keyboard Hint */}
                <div className="border-t border-black/[0.06] px-3 py-2 text-[9px] text-black/32 flex items-center justify-between">
                  <span>{t('language.keyboardHint', 'Up/Down navigate ¡¤ Enter select ¡¤ Esc close')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Header - Compact */}
      <div className="sticky top-0 z-50 border-b border-black/6 bg-white/96 px-4 py-3 backdrop-blur xl:hidden">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-black/8 bg-white text-black/62 transition-colors hover:border-black/12 hover:text-black"
            aria-label={navText('nav.home', 'Home')}
          >
            <Home className="h-4 w-4" />
          </Link>
          {onSearchClick ? (
            <button
              type="button"
              onClick={onSearchClick}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-black/8 bg-white text-black/62 transition-colors hover:border-black/12 hover:text-black"
              aria-label={navText('nav.search', 'Search')}
            >
              <Search className="h-4 w-4" />
            </button>
          ) : null}
          <div className="flex flex-1 gap-2 overflow-x-auto scrollbar-hide">
            {primaryNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200',
                  isActivePath(location.pathname, item.to)
                    ? 'border-black bg-black text-white shadow-sm'
                    : 'border-black/8 bg-white text-black/56 hover:border-black/16 hover:text-black',
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

