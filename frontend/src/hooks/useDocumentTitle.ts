import { useEffect } from 'react'

const BRAND = '溯知 TraceMind'
const TITLE_SEPARATOR = ' · '
const BRAND_EQUIVALENTS = new Set(['溯知', 'TraceMind', BRAND])

export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const nextTitle = title?.trim()

    document.title =
      nextTitle && !BRAND_EQUIVALENTS.has(nextTitle)
        ? `${nextTitle}${TITLE_SEPARATOR}${BRAND}`
        : BRAND
  }, [title])
}
