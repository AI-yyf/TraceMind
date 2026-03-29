import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'

import { GlobalSearch } from '@/components/GlobalSearch'
import { ThemeSidebar } from '@/components/ThemeSidebar'

export function Layout({ children }: { children?: ReactNode }) {
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }

    const onCustomOpen = () => setSearchOpen(true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('global-search-open', onCustomOpen)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('global-search-open', onCustomOpen)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#fcfbf8] text-black antialiased">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ThemeSidebar onSearchClick={() => setSearchOpen(true)} />
      <div className="xl:ml-[88px]">{children || <Outlet />}</div>
    </div>
  )
}
