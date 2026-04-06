import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'

import { GlobalSearch } from '@/components/GlobalSearch'
import { ThemeSidebar } from '@/components/ThemeSidebar'

export function Layout({ children }: { children?: ReactNode }) {
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname, location.search])

  useLayoutEffect(() => {
    const win = window as Window & { __globalSearchRequested?: boolean }
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && (key === 'k' || event.code === 'KeyK')) {
        event.preventDefault()
        setSearchOpen(true)
        win.__globalSearchRequested = false
      }
    }

    const onCustomOpen = () => {
      setSearchOpen(true)
      win.__globalSearchRequested = false
    }

    if (win.__globalSearchRequested) {
      setSearchOpen(true)
      win.__globalSearchRequested = false
    }

    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.body?.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('global-search-open', onCustomOpen)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body?.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('global-search-open', onCustomOpen)
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--surface-page)] text-black antialiased">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[240px] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.88)_60%,rgba(255,255,255,0)_100%)]" />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ThemeSidebar onSearchClick={() => setSearchOpen(true)} />
      <div className="relative xl:ml-[88px]">{children || <Outlet />}</div>
    </div>
  )
}
