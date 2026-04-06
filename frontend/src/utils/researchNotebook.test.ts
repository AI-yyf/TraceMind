import { describe, expect, it } from 'vitest'

import type { FavoriteExcerpt } from '@/types/tracker'
import { buildNotebookMarkdown, getResearchNoteKindLabel } from './researchNotebook'

const sampleNote: FavoriteExcerpt = {
  id: 'note-1',
  kind: 'assistant',
  paperId: 'paper-1',
  paperTitleZh: '工作台论文',
  excerptTitle: '为什么右侧栏必须保持上下文',
  paragraphs: ['右侧栏需要像工作台，而不是临时聊天抽屉。'],
  savedAt: '2026-04-05T03:00:00.000Z',
  route: '/paper/paper-1',
  sourceLabel: '研究备忘',
  summary: '总结工作台在阅读流中的角色。',
  tags: ['sidebar', 'context'],
}

describe('researchNotebook i18n', () => {
  it('returns localized note kind labels for supported non-zh languages', () => {
    expect(getResearchNoteKindLabel('assistant', 'ja-JP')).toBe('AI 解説')
    expect(getResearchNoteKindLabel('assistant', 'de-DE')).toBe('KI-Einordnung')
    expect(getResearchNoteKindLabel('assistant', 'ru-RU')).toBe('Пояснение ИИ')
  })

  it('builds notebook markdown with localized headings for non-zh locales', () => {
    const japaneseMarkdown = buildNotebookMarkdown([sampleNote], {}, { locale: 'ja-JP' })
    const germanMarkdown = buildNotebookMarkdown([sampleNote], {}, { locale: 'de-DE' })

    expect(japaneseMarkdown).toContain('# 研究ノート書き出し')
    expect(japaneseMarkdown).toContain('- 項目数: 1')
    expect(japaneseMarkdown).toContain('## 未分類トピック')

    expect(germanMarkdown).toContain('# Export der Forschungsnotizen')
    expect(germanMarkdown).toContain('- Anzahl Einträge: 1')
    expect(germanMarkdown).toContain('## Unsortiertes Thema')
  })
})
