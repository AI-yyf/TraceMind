/**
 * GlobalSearch - 增强版全局搜索组件
 *
 * 功能：
 * 1. 多字段搜索（标题、描述、标签）
 * 2. 相关性评分排序
 * 3. 键盘导航（↑↓ 选择，Enter 打开）
 * 4. 类型图标区分
 * 5. 匹配字段高亮
 * 6. 搜索结果计数
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search, X, Calendar, Tag, FileText, BookOpen,
  FlaskConical, Keyboard, ArrowUp, ArrowDown
} from 'lucide-react'
import { useTopicRegistry } from '@/hooks'
import { cn } from '@/utils/cn'
import type { SearchItem } from '@/types/tracker'

type GlobalSearchProps = {
  open: boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { searchItems } = useTopicRegistry()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [tag, setTag] = useState('all')
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const deferredQuery = useDeferredValue(query)

  // ── 过滤 & 评分 ──
  const results = computeResults(searchItems, deferredQuery, year, tag)

  // ── 自动聚焦 & ESC 关闭 ──
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  // 重置选中
  useEffect(() => { setSelectedIdx(-1) }, [deferredQuery, year, tag])

  const handleNavigate = useCallback((item: SearchItem) => {
    const current = `${location.pathname}${location.search}${location.hash}`
    if (item.href !== current) navigate(item.href)
    onClose()
  }, [location.hash, location.pathname, location.search, navigate, onClose])

  // ── 键盘导航 ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && selectedIdx >= 0 && selectedIdx < results.length) {
      e.preventDefault()
      handleNavigate(results[selectedIdx].item)
    }
  }, [handleNavigate, selectedIdx, results])

  // 滚动选中项到可见
  useEffect(() => {
    if (selectedIdx < 0) return
    const el = resultsRef.current?.querySelector(`[data-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIdx])

  // ── 筛选项 ──
  const years = useYears(searchItems)
  const tags = useTags(searchItems)

  // ── 导航 ──
  if (!open) return null

  const hasQuery = deferredQuery.trim().length > 0

  return (
    <>
      {/* 遮罩 */}
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-white/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭搜索"
      />

      {/* 搜索面板 */}
      <div className="fixed right-4 top-4 z-[90] w-[min(94vw,36rem)] overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(17,17,17,0.12)]">
        {/* 搜索输入框 */}
        <div className="border-b border-black/8 px-4 py-4">
          <div className="flex items-center gap-3 rounded-[22px] border border-black/10 bg-[#fafafa] px-4 py-3">
            <Search className="h-4 w-4 text-black/45 flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索论文、主题、标签…"
              className="w-full bg-transparent text-sm text-black outline-none placeholder:text-black/35"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-full p-1 text-black/45 transition hover:bg-black/5 hover:text-black"
                aria-label="清空搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 键盘提示 */}
          <div className="mt-2 flex items-center gap-4 text-[11px] text-black/30">
            <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> 选择</span>
            <span className="flex items-center gap-1"><Keyboard className="w-3 h-3" /> Enter 打开</span>
            <span className="flex items-center gap-1">Esc 关闭</span>
          </div>
        </div>

        {/* 筛选器 */}
        <div className="grid gap-4 border-b border-black/8 px-4 py-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-black/38">
              <Calendar className="h-3.5 w-3.5" />
              时间
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={year === 'all'} label="全部" onClick={() => setYear('all')} />
              {years.map(item => (
                <FilterChip key={item} active={year === item} label={item} onClick={() => setYear(item)} />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-black/38">
              <Tag className="h-3.5 w-3.5" />
              标签
            </div>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
              <FilterChip active={tag === 'all'} label="全部" onClick={() => setTag('all')} />
              {tags.map(item => (
                <FilterChip key={item} active={tag === item} label={item} onClick={() => setTag(item)} />
              ))}
            </div>
          </div>
        </div>

        {/* 结果列表 */}
        <div ref={resultsRef} className="max-h-[52vh] overflow-y-auto">
          {/* 结果计数 */}
          {hasQuery && (
            <div className="px-4 py-2.5 text-[11px] text-black/38 border-b border-black/5">
              找到 {results.length} 个结果
              {results.length > 0 && ` · 按相关性排序`}
            </div>
          )}

          {results.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-black/45">
              {hasQuery ? '没有找到合适的结果，试试缩短关键词。' : '输入关键词开始搜索'}
            </div>
          ) : (
            results.map((result, idx) => (
              <button
                key={result.item.id}
                type="button"
                data-idx={idx}
                onClick={() => handleNavigate(result.item)}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={cn(
                  'block w-full border-b border-black/6 px-4 py-4 text-left transition',
                  idx === selectedIdx
                    ? 'bg-red-50/60'
                    : 'hover:bg-[#fafafa]',
                )}
              >
                {/* 类型标签 + 年份 */}
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.28em]">
                  <span className="text-red-600">{result.item.year || '研究'}</span>
                  <span className="text-black/34 flex items-center gap-1">
                    <KindIcon kind={result.item.kind} />
                    {searchKindLabel[result.item.kind]}
                  </span>
                  {/* 匹配字段标记 */}
                  {hasQuery && result.matchedFields.length > 0 && (
                    <span className="text-[10px] text-black/20">
                      匹配: {result.matchedFields.join('、')}
                    </span>
                  )}
                </div>

                {/* 标题 */}
                <div className="mt-2 text-base font-semibold text-black">
                  <HighlightText text={result.item.title} query={deferredQuery} />
                </div>

                {/* 副标题 */}
                <div className="mt-1 text-sm leading-7 text-black/62 line-clamp-2">
                  <HighlightText text={result.item.subtitle} query={deferredQuery} />
                </div>

                {/* 标签 */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.item.tags.slice(0, 4).map(t => (
                    <span
                      key={t}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px]',
                        hasQuery && t.toLowerCase().includes(deferredQuery.toLowerCase())
                          ? 'border-red-300 bg-red-50 text-red-700'
                          : 'border-black/10 bg-white text-black/54',
                      )}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ============ 子组件 & 工具 ============

const searchKindLabel = {
  topic: '主题',
  paper: '论文',
  candidate: '候选',
  research: '研究',
} as const

function KindIcon({ kind }: { kind: SearchItem['kind'] }) {
  switch (kind) {
    case 'topic': return <BookOpen className="w-3 h-3" />
    case 'paper': return <FileText className="w-3 h-3" />
    case 'candidate': return <FlaskConical className="w-3 h-3" />
    case 'research': return <FlaskConical className="w-3 h-3" />
  }
}

/** 高亮匹配文本 */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>

  const keywords = query.trim().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return <>{text}</>

  // 构建正则
  const pattern = keywords
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const regex = new RegExp(`(${pattern})`, 'gi')

  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-red-100 text-red-900 rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs transition',
        active
          ? 'border-red-500 bg-red-50 text-red-700'
          : 'border-black/10 bg-white text-black/58 hover:border-black/20 hover:text-black',
      )}
    >
      {label}
    </button>
  )
}

function useYears(items: SearchItem[]) {
  return useMemo(
    () => Array.from(new Set(items.map(i => i.year))).sort(),
    [items],
  )
}

function useTags(items: SearchItem[]) {
  return useMemo(
    () =>
      Array.from(new Set(items.flatMap(i => i.tags)))
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .slice(0, 30),
    [items],
  )
}

function useDeferredValue<T>(value: T, ms = 120): T {
  const [deferred, setDeferred] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDeferred(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return deferred
}

// ============ 搜索评分 ============

interface SearchResult {
  item: SearchItem
  score: number
  matchedFields: string[]
}

function computeResults(items: SearchItem[], query: string, year: string, tag: string): SearchResult[] {
  const keywords = query.trim().split(/\s+/).filter(Boolean)
  const hasKeywords = keywords.length > 0

  const filtered = items.filter(item => {
    if (year !== 'all' && item.year !== year) return false
    if (tag !== 'all' && !item.tags.includes(tag)) return false
    if (!hasKeywords) return true

    const corpus = `${item.title} ${item.subtitle} ${item.tags.join(' ')}`.toLowerCase()
    return keywords.every(kw => corpus.includes(kw.toLowerCase()))
  })

  if (!hasKeywords) {
    // 无关键词时按类型优先、年份倒序排列
    const kindOrder: Record<string, number> = { paper: 0, topic: 1, candidate: 2, research: 3 }
    return filtered
      .sort((a, b) => {
        const ka = kindOrder[a.kind] ?? 9
        const kb = kindOrder[b.kind] ?? 9
        if (ka !== kb) return ka - kb
        return b.year.localeCompare(a.year)
      })
      .map(item => ({ item, score: 0, matchedFields: [] as string[] }))
  }

  // 有关键词：评分排序
  return filtered
    .map(item => {
      const { score, matchedFields } = scoreItem(item, keywords)
      return { item, score, matchedFields }
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
}

function scoreItem(item: SearchItem, keywords: string[]): { score: number; matchedFields: string[] } {
  const matchedFields: string[] = []
  let score = 0

  const titleLower = item.title.toLowerCase()
  const subtitleLower = item.subtitle.toLowerCase()
  const tagsLower = item.tags.map(t => t.toLowerCase()).join(' ')

  for (const kw of keywords) {
    const k = kw.toLowerCase()

    // 标题匹配（最高权重）
    if (titleLower.includes(k)) {
      const count = titleLower.split(k).length - 1
      score += 12 * count
      if (!matchedFields.includes('标题')) matchedFields.push('标题')
    }

    // 标签匹配
    if (tagsLower.includes(k)) {
      score += 7
      if (!matchedFields.includes('标签')) matchedFields.push('标签')
    }

    // 副标题/描述匹配
    if (subtitleLower.includes(k)) {
      score += 4
      if (!matchedFields.includes('描述')) matchedFields.push('描述')
    }
  }

  // 类型加权
  const kindWeight = { paper: 1.2, topic: 1.0, candidate: 0.85, research: 0.75 }
  score *= kindWeight[item.kind] || 1.0

  return { score, matchedFields }
}
