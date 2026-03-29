import { useEffect, useState } from 'react'
import { getItem, setItem } from '@/utils/storage'
import type { FavoriteExcerpt } from '@/types/tracker'

const FAVORITES_KEY = 'favorite-excerpts'

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteExcerpt[]>([])

  useEffect(() => {
    setFavorites(getItem<FavoriteExcerpt[]>(FAVORITES_KEY, []) ?? [])
  }, [])

  const saveFavorites = (nextFavorites: FavoriteExcerpt[]) => {
    setFavorites(nextFavorites)
    setItem(FAVORITES_KEY, nextFavorites)
  }

  const toggleFavorite = (excerpt: FavoriteExcerpt) => {
    const exists = favorites.some((item) => item.id === excerpt.id)
    if (exists) {
      saveFavorites(favorites.filter((item) => item.id !== excerpt.id))
      return false
    }
    saveFavorites([excerpt, ...favorites])
    return true
  }

  const removeFavorite = (favoriteId: string) => {
    saveFavorites(favorites.filter((item) => item.id !== favoriteId))
  }

  const isFavorite = (favoriteId: string) => favorites.some((item) => item.id === favoriteId)

  return {
    favorites,
    toggleFavorite,
    removeFavorite,
    isFavorite,
  }
}
