/**
 * useSmartSearch - 增强搜索 hook
 *
 * 功能：
 * 1. 多字段搜索（标题、副标题、标签、摘要）
 * 2. 搜索结果排序（相关性评分）
 * 3. 键盘导航支持
 */

import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import type { SearchItem } from '@/types/tracker'

export interface SmartSearchResult extends SearchItem {
  /** 相关性评分 */
  score: number
  /** 匹配片段 */
  matchedFields: string[]
}

// ============ 相关性评分 ============

function computeScore(item: SearchItem, keywords: string[]): { score: number; matchedFields: string[] } {
  const matchedFields: string[] = []
  let totalScore = 0

  const titleLower = item.title.toLowerCase()
  const subtitleLower = item.subtitle.toLowerCase()
  const tagsJoined = item.tags.join(' ').toLowerCase()

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase()

    // 标题完全匹配（最高分）
    if (titleLower.includes(kw)) {
      const matchCount = (titleLower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      totalScore += 10 * matchCount
      matchedFields.push('标题')
    }

    // 副标题匹配
    if (subtitleLower.includes(kw)) {
      totalScore += 4
      matchedFields.push('描述')
    }

    // 标签匹配
    if (tagsJoined.includes(kw)) {
      totalScore += 6
      matchedFields.push('标签')
    }
  }

  // 类型加权：论文 > 主题 > 候选
  const kindWeight = { paper: 1.2, topic: 1.0, candidate: 0.8, research: 0.7 }
  totalScore *= kindWeight[item.kind] || 1.0

  return { score: totalScore, matchedFields: [...new Set(matchedFields)] }
}

// ============ 主 Hook ============

export function useSmartSearch(searchItems: SearchItem[]) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const deferredQuery = useDeferredValue(query)
  const containerRef = useRef<HTMLDivElement>(null)

  // 过滤 & 评分
  const results = useMemo(() => {
    const keywords = deferredQuery.trim().split(/\s+/).filter(Boolean)
    if (keywords.length === 0) {
      return searchItems.map(item => ({ ...item, score: 0, matchedFields: [] as string[] }))
    }

    return searchItems
      .map(item => {
        const { score, matchedFields } = computeScore(item, keywords)
        return { ...item, score, matchedFields }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
  }, [deferredQuery, searchItems])

  // 重置选中索引
  useEffect(() => {
    setSelectedIdx(-1)
  }, [deferredQuery])

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && selectedIdx >= 0 && selectedIdx < results.length) {
      e.preventDefault()
      // 触发 navigate 通过外部回调
      const el = containerRef.current?.querySelector(`[data-result-idx="${selectedIdx}"]`) as HTMLElement
      el?.click()
    }
  }, [selectedIdx, results])

  // 滚动选中项到可见区域
  useEffect(() => {
    if (selectedIdx < 0) return
    const el = containerRef.current?.querySelector(`[data-result-idx="${selectedIdx}"]`)
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIdx])

  return {
    query,
    setQuery,
    results,
    selectedIdx,
    containerRef,
    handleKeyDown,
    resultCount: deferredQuery.trim().length === 0 ? searchItems.length : results.length,
    isSearching: deferredQuery !== query,
  }
}

// 简单的 useDeferredValue polyfill（React 18 内置，但保险起见）
function useDeferredValue<T>(value: T, _timeoutMs = 150): T {
  const [deferred, setDeferred] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDeferred(value), _timeoutMs)
    return () => clearTimeout(timer)
  }, [value, _timeoutMs])

  return deferred
}
