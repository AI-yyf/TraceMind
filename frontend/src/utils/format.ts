/**
 * 格式化日期
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  }
  return d.toLocaleDateString(
    typeof navigator !== 'undefined' ? navigator.language : undefined,
    defaultOptions,
  )
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const formatter = new Intl.RelativeTimeFormat(
    typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    { numeric: 'auto' },
  )

  if (days === 0) return formatter.format(0, 'day')
  if (days < 7) return formatter.format(-days, 'day')
  if (days < 30) return formatter.format(-Math.floor(days / 7), 'week')
  if (days < 365) return formatter.format(-Math.floor(days / 30), 'month')
  return formatter.format(-Math.floor(days / 365), 'year')
}

/**
 * 格式化数字（K/M/B）
 */
export function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
  return num.toString()
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * 高亮搜索关键词
 */
export function highlightText(text: string, keyword: string): string {
  if (!keyword) return text
  const regex = new RegExp(`(${keyword})`, 'gi')
  return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-900">$1</mark>')
}
