/**
 * 本地存储工具
 */

const PREFIX = 'arxiv-tracker:'

/**
 * 设置本地存储
 */
export function setItem<T>(key: string, value: T): void {
  try {
    const serialized = JSON.stringify(value)
    localStorage.setItem(`${PREFIX}${key}`, serialized)
  } catch (error) {
    console.error('Error saving to localStorage:', error)
  }
}

/**
 * 获取本地存储
 */
export function getItem<T>(key: string, defaultValue?: T): T | undefined {
  try {
    const item = localStorage.getItem(`${PREFIX}${key}`)
    if (item === null) return defaultValue
    return JSON.parse(item) as T
  } catch (error) {
    console.error('Error reading from localStorage:', error)
    return defaultValue
  }
}

/**
 * 移除本地存储
 */
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(`${PREFIX}${key}`)
  } catch (error) {
    console.error('Error removing from localStorage:', error)
  }
}

/**
 * 清空所有本地存储
 */
export function clearAll(): void {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(PREFIX))
      .forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.error('Error clearing localStorage:', error)
  }
}

/**
 * 带过期时间的缓存
 */
export function setCache<T>(key: string, value: T, ttlMinutes: number): void {
  const item = {
    value,
    expiry: Date.now() + ttlMinutes * 60 * 1000,
  }
  setItem(key, item)
}

/**
 * 获取缓存（自动检查过期）
 */
export function getCache<T>(key: string): T | null {
  const item = getItem<{ value: T; expiry: number }>(key)
  if (!item) return null
  if (Date.now() > item.expiry) {
    removeItem(key)
    return null
  }
  return item.value
}
