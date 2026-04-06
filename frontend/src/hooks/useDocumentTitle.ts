import { useEffect } from 'react'

const BRAND = '溯知 TraceMind'

export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const nextTitle = title?.trim()
    document.title = nextTitle && nextTitle !== BRAND ? `${nextTitle} · ${BRAND}` : BRAND
  }, [title])
}
