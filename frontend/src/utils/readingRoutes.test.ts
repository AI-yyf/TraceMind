import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildNodeAnchorRoute,
  buildPaperAnchorRoute,
  canonicalizePaperLikeRoute,
  normalizeResolvedReadingRouteForPaper,
  resolvePrimaryReadingRouteForPaper,
} from './readingRoutes'

describe('readingRoutes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('appends paper anchors onto node routes', () => {
    expect(buildPaperAnchorRoute('/node/node-1', 'paper-1')).toBe(
      '/node/node-1?anchor=paper%3Apaper-1',
    )
    expect(buildPaperAnchorRoute('/node/node-1?stageMonths=3', 'paper-1')).toBe(
      '/node/node-1?stageMonths=3&anchor=paper%3Apaper-1',
    )
  })

  it('prefers node routes and related node routes for paper anchors', () => {
    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-1',
        nodeRoute: '/node/node-1',
      }),
    ).toBe('/node/node-1?anchor=paper%3Apaper-1')

    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-1',
        relatedNodes: [{ route: '/node/node-2' }],
      }),
    ).toBe('/node/node-2?anchor=paper%3Apaper-1')
  })

  it('attaches missing paper anchors onto existing topic or node reading routes', () => {
    expect(
      normalizeResolvedReadingRouteForPaper({
        paperId: 'paper-7',
        route: '/topic/topic-9',
        anchorId: 'paper:paper-7',
      }),
    ).toBe('/topic/topic-9?anchor=paper%3Apaper-7')

    expect(
      normalizeResolvedReadingRouteForPaper({
        paperId: 'paper-8',
        route: '/node/node-4?stageMonths=6',
        anchorId: 'paper:paper-8',
      }),
    ).toBe('/node/node-4?stageMonths=6&anchor=paper%3Apaper-8')
  })

  it('falls back to topic anchors before returning home when no node is known', () => {
    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-3',
        topicId: 'topic-1',
      }),
    ).toBe('/topic/topic-1?anchor=paper%3Apaper-3')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-4',
      }),
    ).toBe('/')
    expect(warnSpy).toHaveBeenCalledWith(
      'Cannot resolve route for paper paper-4: no node or topic association',
    )
  })

  it('preserves non-paper routes and custom anchors', () => {
    expect(
      resolvePrimaryReadingRouteForPaper({
        paperId: 'paper-5',
        route: '/topic/topic-2?anchor=paper%3Apaper-5',
        topicId: 'topic-2',
      }),
    ).toBe('/topic/topic-2?anchor=paper%3Apaper-5')

    expect(
      normalizeResolvedReadingRouteForPaper({
        paperId: 'paper-5',
        route: '/favorites?topic=topic-2',
        anchorId: 'paper:paper-5',
      }),
    ).toBeNull()

    expect(buildNodeAnchorRoute('/topic/topic-1?stageMonths=1', 'paper:paper-6')).toBe(
      '/topic/topic-1?stageMonths=1&anchor=paper%3Apaper-6',
    )
  })

  it('ignores legacy paper routes and falls back to topic anchors when only topic context is available', () => {
    expect(
      canonicalizePaperLikeRoute({
        paperId: 'paper-9',
        route: '/paper/paper-9',
        topicId: 'topic-7',
      }),
    ).toBe('/topic/topic-7?anchor=paper%3Apaper-9')
  })

  it('ignores legacy paper routes and falls back to node anchors when node context is available', () => {
    expect(
      canonicalizePaperLikeRoute({
        paperId: 'paper-10',
        route: '/paper/paper-10',
        nodeRoute: '/node/node-3?stageMonths=6',
      }),
    ).toBe('/node/node-3?stageMonths=6&anchor=paper%3Apaper-10')
  })
})
