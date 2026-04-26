import { useEffect, useState } from 'react'
import { getItem, setItem } from '@/utils/storage'
import type { FavoriteExcerpt } from '@/types/tracker'
import { normalizeFavoriteExcerpt } from '@/utils/researchNotebook'
import {
  APP_STATE_STORAGE_KEYS,
  readLocalStorageItem,
  removeLocalStorageItem,
} from '@/utils/appStateStorage'

const FAVORITES_KEY = APP_STATE_STORAGE_KEYS.favoriteExcerpts
const LEGACY_FAVORITES_KEY = FAVORITES_KEY

function normalizeFavoriteCollection(source: unknown): FavoriteExcerpt[] {
  if (!Array.isArray(source)) return []
  return source
    .map((item) => normalizeFavoriteExcerpt(item))
    .filter((item): item is FavoriteExcerpt => Boolean(item))
}

function loadInitialFavorites() {
  const stored = normalizeFavoriteCollection(getItem<unknown[]>(FAVORITES_KEY, []))
  if (stored.length > 0) return stored

  if (typeof window === 'undefined') return stored

  try {
    const legacyRaw = readLocalStorageItem(LEGACY_FAVORITES_KEY)
    if (!legacyRaw) return stored

    const legacy = normalizeFavoriteCollection(JSON.parse(legacyRaw))
    if (legacy.length > 0) {
      setItem(FAVORITES_KEY, legacy)
      removeLocalStorageItem(LEGACY_FAVORITES_KEY)
    }
    return legacy
  } catch {
    // Legacy migration failed - return stored favorites
    return stored
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteExcerpt[]>([])

  useEffect(() => {
    setFavorites(loadInitialFavorites())
  }, [])

  const saveFavorites = (nextFavorites: FavoriteExcerpt[]) => {
    setFavorites(nextFavorites)
    setItem(FAVORITES_KEY, nextFavorites)
  }

  const addFavorite = (excerpt: FavoriteExcerpt) => {
    const normalized = normalizeFavoriteExcerpt(excerpt)
    if (!normalized) return false

    const nextFavorites = [
      normalized,
      ...favorites.filter((item) => item.id !== normalized.id),
    ]

    saveFavorites(nextFavorites)
    return !favorites.some((item) => item.id === normalized.id)
  }

  const toggleFavorite = (excerpt: FavoriteExcerpt) => {
    const exists = favorites.some((item) => item.id === excerpt.id)
    if (exists) {
      saveFavorites(favorites.filter((item) => item.id !== excerpt.id))
      return false
    }
    return addFavorite(excerpt)
  }

  const removeFavorite = (favoriteId: string) => {
    saveFavorites(favorites.filter((item) => item.id !== favoriteId))
  }

  const isFavorite = (favoriteId: string) => favorites.some((item) => item.id === favoriteId)

  return {
    favorites,
    addFavorite,
    toggleFavorite,
    removeFavorite,
    isFavorite,
  }
}
