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
    expect(getResearchNoteKindLabel('assistant', 'ja-JP')).not.toBe('AI Insight')
    expect(getResearchNoteKindLabel('assistant', 'de-DE')).toBe('KI-Einordnung')
    expect(getResearchNoteKindLabel('assistant', 'ru-RU')).not.toBe('AI Insight')
  })

  it('builds notebook markdown with clean Chinese copy on the main path', () => {
    const chineseMarkdown = buildNotebookMarkdown([sampleNote], {}, { locale: 'zh-CN' })

    expect(chineseMarkdown).toContain('# 研究笔记导出')
    expect(chineseMarkdown).toContain('- 条目数量: 1')
    expect(chineseMarkdown).toContain('## 未归类主题')
    expect(chineseMarkdown).toContain('### [AI 解读] 为什么右侧栏必须保留上下文')
  })

  it('normalizes saved paper notes to node anchors when node/topic context exists', () => {
    const normalized = normalizeFavoriteExcerpt({
      id: 'legacy-note',
      kind: 'paper',
      topicId: 'topic-1',
      paperId: 'paper-1',
      nodeId: 'node-1',
      excerptTitle: 'Legacy note',
      paragraphs: ['Saved before standalone paper routes were retired.'],
      savedAt: '2026-04-05T03:00:00.000Z',
    })

    expect(normalized?.route).toBe('/node/node-1?anchor=paper%3Apaper-1')
  })

  it('falls back to anchored topic routes when a saved paper note no longer has a node route', () => {
    const normalized = normalizeFavoriteExcerpt({
      id: 'legacy-topic-note',
      kind: 'paper',
      topicId: 'topic-1',
      paperId: 'paper-9',
      excerptTitle: 'Legacy topic note',
      paragraphs: ['Saved after node mapping was removed.'],
      savedAt: '2026-04-05T03:00:00.000Z',
    })

    expect(normalized?.route).toBe('/topic/topic-1?anchor=paper%3Apaper-9')
  })
})
