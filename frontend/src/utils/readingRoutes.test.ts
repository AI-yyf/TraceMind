import { describe, expect, it } from 'vitest'

import {
  buildNodeAnchorRoute,
  buildPaperAnchorRoute,
  resolvePrimaryReadingRouteForPaper,
} from './readingRoutes'

describe('readingRoutes', () => {
  it('appends paper anchors onto node routes', () => {
    expect(buildPaperAnchorRoute('/node/node-1', 'paper-1')).toBe(
      '/node/node-1?anchor=paper%3Apaper-1',
    )
    expect(buildPaperAnchorRoute('/node/node-1?stageMonths=3', 'paper-1')).toBe(
      '/node/node-1?stageMonths=3&anchor=paper%3Apaper-1',
    )
  })

  it('resolves paper links to node anchors before falling back to legacy paper routes', () => {
    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-1',
        route: '/paper/paper-1',
        nodeRoute: '/node/node-1',
      }),
    ).toBe('/node/node-1?anchor=paper%3Apaper-1')

    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-1',
        route: '/paper/paper-1',
        relatedNodes: [{ route: '/node/node-2' }],
      }),
    ).toBe('/node/node-2?anchor=paper%3Apaper-1')
  })

  it('falls back to topic anchors before exposing legacy paper routes when no node is known', () => {
    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-3',
        route: '/paper/paper-3',
        topicId: 'topic-1',
      }),
    ).toBe('/topic/topic-1?anchor=paper%3Apaper-3')

    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-4',
        route: '/paper/paper-4',
      }),
    ).toBe('/paper/paper-4')
  })

  it('preserves non-paper routes and custom anchors', () => {
    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-5',
        route: '/topic/topic-2?anchor=paper%3Apaper-5',
        topicId: 'topic-2',
      }),
    ).toBe('/topic/topic-2?anchor=paper%3Apaper-5')

    expect(buildNodeAnchorRoute('/topic/topic-1?stageMonths=1', 'paper:paper-6')).toBe(
      '/topic/topic-1?stageMonths=1&anchor=paper%3Apaper-6',
    )
  })
})
