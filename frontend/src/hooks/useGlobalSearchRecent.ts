import { useCallback, useState } from 'react'

import {
  APP_STATE_STORAGE_KEYS,
  readRecentSearchTerms,
  rememberRecentSearchTerm,
} from '@/utils/appStateStorage'

export function useGlobalSearchRecent() {
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readRecentSearchTerms(APP_STATE_STORAGE_KEYS.globalSearchRecent),
  )

  const rememberRecentSearch = useCallback((query: string) => {
    setRecentSearches((current) =>
      rememberRecentSearchTerm(APP_STATE_STORAGE_KEYS.globalSearchRecent, query, current),
    )
  }, [])

  return {
    recentSearches,
    rememberRecentSearch,
  }
}
