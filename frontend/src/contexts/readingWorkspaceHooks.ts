import { useContext, useEffect } from 'react'

import { ReadingWorkspaceContext } from './readingWorkspaceShared'

export function useReadingWorkspace() {
  const context = useContext(ReadingWorkspaceContext)
  if (!context) {
    throw new Error('useReadingWorkspace must be used within ReadingWorkspaceProvider')
  }
  return context
}

export function usePageScrollRestoration(
  pageKey: string,
  options?: {
    enabled?: boolean
    skipInitialRestore?: boolean
  },
) {
  const { rememberPageScroll, getPageScroll } = useReadingWorkspace()
  const enabled = options?.enabled ?? true

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return

    if (!options?.skipInitialRestore) {
      const saved = getPageScroll(pageKey)
      if (typeof saved === 'number' && saved > 0) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: saved, behavior: 'auto' })
        })
      }
    }

    const onScroll = () => rememberPageScroll(pageKey, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      rememberPageScroll(pageKey, window.scrollY)
      window.removeEventListener('scroll', onScroll)
    }
  }, [enabled, getPageScroll, options?.skipInitialRestore, pageKey, rememberPageScroll])
}
