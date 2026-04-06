import { describe, expect, it } from 'vitest'

import {
  compactTopicSurfaceTitle,
  dedupeTopicPresentation,
  isPresentationNoiseTopic,
  isRegressionSeedTopic,
  isTopicSurfaceNoiseText,
  sanitizeTopicSurfaceText,
} from './topicPresentation'

describe('topicPresentation', () => {
  it('filters regression seed topics', () => {
    expect(
      isRegressionSeedTopic({
        nameZh: 'Regression coverage',
        summary: 'Create a regression topic for multimodal retrieval.',
      }),
    ).toBe(true)
  })

  it('treats unreadable placeholder titles as presentation noise', () => {
    expect(
      isPresentationNoiseTopic({
        title: '?????',
        summary: '?????',
      }),
    ).toBe(true)
  })

  it('dedupes repeated topics while keeping readable entries', () => {
    const result = dedupeTopicPresentation([
      {
        id: 'topic-newest',
        title: 'Research orchestration systems',
        titleSecondary: 'Research Orchestration Systems',
        summary: 'A study of memory, scheduling, and grounded scholarly agents.',
      },
      {
        id: 'topic-older',
        title: 'Research orchestration systems',
        titleSecondary: 'Research Orchestration Systems',
        summary: 'A study of memory, scheduling, and grounded scholarly agents.',
      },
      {
        id: 'topic-broken',
        title: '?????',
        summary: '?????',
      },
    ])

    expect(result.map((item) => item.id)).toEqual(['topic-newest'])
  })

  it('filters prompt-style residue from topic surface text', () => {
    expect(
      sanitizeTopicSurfaceText(
        'The user wants a 500-800 word Chinese narrative. Key requirements: include evidence awareness.',
      ),
    ).toBe('')
  })

  it('treats process narration as topic-surface noise', () => {
    expect(
      isTopicSurfaceNoiseText('这轮 1 小时 研究已暂停，系统围绕当前主题主线持续检索并回看已有节点。'),
    ).toBe(true)
  })

  it('compacts long English node titles for the topic surface', () => {
    expect(
      compactTopicSurfaceTitle(
        'Analysis of AV merging behavior in mixed traffic using large-scale AV driving datasets',
      ),
    ).toBe('AV merging behavior in mixed traffic')
  })
})
