import {
  APP_STATE_STORAGE_KEYS,
  getTrackerStorageKey,
  listLocalStorageKeys,
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from './appStateStorage'

const PREFIX = APP_STATE_STORAGE_KEYS.trackerPrefix

export function setItem<T>(key: string, value: T): void {
  try {
    writeLocalStorageItem(getTrackerStorageKey(key), JSON.stringify(value))
  } catch {
    // Storage write failed - silent fallback
  }
}

export function getItem<T>(key: string, defaultValue?: T): T | undefined {
  try {
    const item = readLocalStorageItem(getTrackerStorageKey(key))
    if (item === null) return defaultValue
    return JSON.parse(item) as T
  } catch {
    // Storage read failed - return default
    return defaultValue
  }
}

export function removeItem(key: string): void {
  try {
    removeLocalStorageItem(getTrackerStorageKey(key))
  } catch {
    // Storage remove failed - silent fallback
  }
}

export function clearAll(): void {
  try {
    listLocalStorageKeys()
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => removeLocalStorageItem(key))
  } catch {
    // Storage clear failed - silent fallback
  }
}

export function setCache<T>(key: string, value: T, ttlMinutes: number): void {
  const item = {
    value,
    expiry: Date.now() + ttlMinutes * 60 * 1000,
  }
  setItem(key, item)
}

export function getCache<T>(key: string): T | null {
  const item = getItem<{ value: T; expiry: number }>(key)
  if (!item) return null
  if (Date.now() > item.expiry) {
    removeItem(key)
    return null
  }
  return item.value
}
