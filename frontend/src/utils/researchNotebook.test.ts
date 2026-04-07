import { describe, expect, it } from 'vitest'

import type { FavoriteExcerpt } from '@/types/tracker'
import {
  buildNotebookMarkdown,
  getResearchNoteKindLabel,
  normalizeFavoriteExcerpt,
} from './researchNotebook'

const sampleNote: FavoriteExcerpt = {
  id: 'note-1',
  kind: 'assistant',
  paperId: 'paper-1',
  paperTitleZh: '工作台论文',
  excerptTitle: '为什么右侧栏必须保留上下文',
  paragraphs: ['右侧栏需要像工作台，而不是临时聊天抽屉。'],
  savedAt: '2026-04-05T03:00:00.000Z',
  route: '/node/node-1?anchor=paper%3Apaper-1',
  sourceLabel: '研究备忘',
  summary: '总结工作台在阅读流中的角色。',
  tags: ['sidebar', 'context'],
}

describe('researchNotebook i18n', () => {
  it('returns clean note kind labels and safe fallbacks for export locales', () => {
    expect(getResearchNoteKindLabel('assistant', 'zh-CN')).toBe('AI 解读')
    expect(getResearchNoteKindLabel('assistant', 'ja-JP')).toBe('AI Insight')
    expect(getResearchNoteKindLabel('assistant', 'de-DE')).toBe('KI-Einordnung')
    expect(getResearchNoteKindLabel('assistant', 'ru-RU')).toBe('AI Insight')
  })

  it('builds notebook markdown with clean Chinese copy on the main path', () => {
    const chineseMarkdown = buildNotebookMarkdown([sampleNote], {}, { locale: 'zh-CN' })

    expect(chineseMarkdown).toContain('# 研究笔记导出')
    expect(chineseMarkdown).toContain('- 条目数量: 1')
    expect(chineseMarkdown).toContain('## 未归类主题')
    expect(chineseMarkdown).toContain('### [AI 解读] 为什么右侧栏必须保留上下文')
  })

  it('rewrites stale paper routes to node anchors when normalizing saved notes', () => {
    const normalized = normalizeFavoriteExcerpt({
      id: 'legacy-note',
      kind: 'paper',
      topicId: 'topic-1',
      paperId: 'paper-1',
      nodeId: 'node-1',
      excerptTitle: 'Legacy note',
      paragraphs: ['Saved before paper pages were retired.'],
      savedAt: '2026-04-05T03:00:00.000Z',
      route: '/paper/paper-1',
    })

    expect(normalized?.route).toBe('/node/node-1?anchor=paper%3Apaper-1')
  })
})
