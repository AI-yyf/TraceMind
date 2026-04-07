import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../../skill-packs/research/paper-tracker/executor'

test('paper tracker sanitizes noisy discovery terms before they reach external search', () => {
  const queries = __testing.sanitizeDiscoveryTerms([
    'Autonomous Driving World Models',
    '自动驾驶世界模型',
    'arxiv-api',
    'hep-th',
    'cs.RO',
    '问题提出',
    '端到端自动驾驶',
  ])

  assert.deepEqual(queries, [
    'Autonomous Driving World Models',
    '自动驾驶世界模型',
    '端到端自动驾驶',
  ])
})

test('paper tracker extracts explicit verdict lines from compact classifier output', () => {
  const parsed = __testing.parsePaperEvaluationLines([
    'verdict=admit',
    'candidateType=direct',
    'citeIntent=supporting',
    'confidence=0.81',
    'why=Strong overlap with the topic mainline and stage focus.',
  ].join('\n'))

  assert.ok(parsed)
  assert.equal(parsed?.candidateType, 'direct')
  assert.equal(parsed?.citeIntent, 'supporting')
  assert.equal(parsed?.confidence, 0.81)
  assert.match(parsed?.why ?? '', /topic mainline/u)
})

test('paper tracker identifies meta classifier narration so repair can retry', () => {
  const raw =
    'The user wants me to classify whether this paper fits the active research topic. I should classify it carefully before answering.'
  const parsed = __testing.inferPaperEvaluationFromText(raw)

  assert.ok(parsed)
  assert.equal(__testing.looksMetaEvaluation(raw, parsed!, 'text'), true)
})

test('paper tracker rejects low-signal classifier output even when it contains parseable fragments', () => {
  const raw =
    'The classification criteria: - Admit if the paper advances the mainline directly - Admit if the paper advances the mainline directly.'
  const parsed = __testing.inferPaperEvaluationFromText(raw)

  assert.ok(parsed)
  assert.equal(__testing.looksMetaEvaluation(raw, parsed!, 'text'), true)
})

test('paper tracker rejects paper evaluations that never mention any paper-specific signal', () => {
  const weak = __testing.looksPaperSpecificEvaluationWeak(
    {
      id: 'paper-weak',
      title: 'OccLLaMA: An Occupancy-Language-Action Generative World Model for Autonomous Driving',
      summary: 'Generative occupancy world model for autonomous driving.',
      authors: [],
      published: '2024-09-05',
      categories: [],
      arxivUrl: 'https://example.com/paper-weak',
    },
    {
      verdict: 'reject',
      candidateType: 'direct',
      confidence: 0.5,
      citeIntent: 'supporting',
      why: 'The topic is "Autonomous Driving VLA World Models".',
    },
  )

  assert.equal(weak, true)
})

test('paper tracker matches only semantically aligned queries against paper text', () => {
  const matched = __testing.collectMatchedQueries(
    {
      id: 'paper-1',
      title: 'End-to-End Autonomous Driving with World Models',
      summary:
        'We study world-model-based planning for end-to-end autonomous driving with closed-loop evaluation.',
      authors: ['Test Author'],
      published: '2026-03-01T00:00:00.000Z',
      categories: ['cs.CV', 'cs.RO'],
      primaryCategory: 'cs.CV',
      arxivUrl: 'https://arxiv.org/abs/2603.00001',
    },
    [
      'Autonomous Driving World Models',
      '端到端自动驾驶',
      'hep-th',
    ],
  )

  assert.deepEqual(matched, [
    'Autonomous Driving World Models',
  ])
})

test('paper tracker heuristic keeps direct world-model matches above the admit floor', () => {
  const score = __testing.calculateSimpleRelevance(
    {
      id: 'paper-direct',
      title: 'OccWorld: Learning a 3D Occupancy World Model for Autonomous Driving',
      summary: 'A 3D occupancy world model for autonomous driving.',
      authors: ['Test Author'],
      published: '2024-10-25T00:00:00.000Z',
      categories: ['cs.CV'],
      primaryCategory: 'cs.CV',
      arxivUrl: 'https://arxiv.org/abs/2410.00001',
    },
    {
      id: 'topic-vla',
      nameZh: '自动驾驶 VLA 世界模型',
      nameEn: 'Autonomous Driving VLA World Models',
      focusLabel: 'autonomous driving VLA world model',
      queryTags: ['vision language action', 'world model'],
      problemPreference: ['planning', 'closed-loop simulation'],
      defaults: {
        bootstrapWindowDays: 3650,
        maxCandidates: 8,
      },
    } as any,
    ['autonomous driving world model', 'autonomous driving vla world model'],
  )

  assert.ok(score >= 0.64)
})

test('paper tracker bootstrap heuristic admits strong time-aligned papers without waiting for model classification', () => {
  const candidate = __testing.buildHeuristicCandidate({
    paper: {
      id: 'paper-bootstrap',
      title: 'Drive-WM: A Driving World Model for Closed-Loop Autonomous Driving',
      summary: 'Driving world model with closed-loop planning for autonomous driving.',
      authors: ['Test Author'],
      published: '2024-11-08T00:00:00.000Z',
      categories: ['cs.CV', 'cs.RO'],
      arxivUrl: 'https://arxiv.org/abs/2411.00008',
      discoverySource: 'openalex',
    },
    confidence: 0.54,
    queryHits: ['autonomous driving world model'],
    stageIndex: 1,
    windowMonths: 1,
    bootstrapMode: true,
  })

  assert.equal(candidate.status, 'admitted')
  assert.equal(candidate.candidateType, 'direct')
  assert.match(candidate.why, /query overlap|world-model match/iu)
})

test('paper tracker heuristic no longer upgrades off-topic papers to direct on confidence alone', () => {
  const candidate = __testing.buildHeuristicCandidate({
    paper: {
      id: 'paper-off-topic',
      title: 'An Effective Data-Driven Approach for Localizing Deep Learning Faults',
      summary:
        'We introduce a data-driven method for localizing faults in deep learning systems used in critical domains such as autonomous driving.',
      authors: ['Test Author'],
      published: '2026-04-03T17:59:50Z',
      categories: ['cs.SE', 'cs.LG'],
      arxivUrl: 'https://arxiv.org/abs/2604.03230',
    },
    confidence: 0.86,
    queryHits: [],
    stageIndex: 3,
    windowMonths: 1,
  })

  assert.equal(candidate.candidateType, 'transfer')
  assert.equal(candidate.status, 'rejected')
})

test('paper tracker topic-domain guard rejects off-topic transfer papers even if they are recent', () => {
  const topicDef = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['vision language action', 'world model', 'autonomous driving'],
    problemPreference: ['planning', 'closed-loop simulation'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const astronomyPaper = {
    id: 'paper-astro',
    title: "Stars Born in the Wind II: Widespread Extra-planar Star Formation in M82's Halo",
    summary: 'We study star formation histories and stellar populations in the halo of M82 using Hubble Space Telescope observations.',
    authors: ['Test Author'],
    published: '2026-04-03T17:59:50Z',
    categories: ['astro-ph.GA'],
    arxivUrl: 'https://arxiv.org/abs/2604.03230',
  }

  assert.equal(
    __testing.passesTopicAdmissionGuard({
      paper: astronomyPaper,
      topicDef,
      queries: ['autonomous driving latent world model', 'self-driving latent world model'],
      candidateType: 'transfer',
    }),
    false,
  )

  const guarded = __testing.enforceTopicAdmissionGuard({
    candidate: {
      paperId: astronomyPaper.id,
      title: astronomyPaper.title,
      published: astronomyPaper.published,
      authors: astronomyPaper.authors,
      candidateType: 'transfer',
      confidence: 0.75,
      status: 'admitted',
      why: 'LLM thought it might be transferable.',
      stageIndex: 1,
      queryHits: [],
      discoveryChannels: ['arxiv-api'],
      arxivData: astronomyPaper as any,
    },
    paper: astronomyPaper as any,
    topicDef,
    queries: ['autonomous driving latent world model', 'self-driving latent world model'],
  })

  assert.equal(guarded.status, 'rejected')
  assert.match(guarded.why, /Rejected by the topic/u)
})

test('paper tracker topic-domain guard rejects unrelated debugging papers during fallback evaluation', () => {
  const topicDef = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['vision language action', 'world model', 'autonomous driving'],
    problemPreference: ['planning', 'closed-loop simulation'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const unrelatedPaper = {
    id: 'paper-debug',
    title: 'An Effective Data-Driven Approach for Localizing Deep Learning Faults',
    summary:
      'We introduce a data-driven method for localizing faults in deep learning systems used in critical domains such as autonomous driving.',
    authors: ['Test Author'],
    published: '2026-04-03T17:59:50Z',
    categories: ['cs.SE', 'cs.LG'],
    arxivUrl: 'https://arxiv.org/abs/2604.03230',
  }

  const guarded = __testing.enforceTopicAdmissionGuard({
    candidate: {
      paperId: unrelatedPaper.id,
      title: unrelatedPaper.title,
      published: unrelatedPaper.published,
      authors: unrelatedPaper.authors,
      candidateType: 'direct',
      confidence: 0.82,
      status: 'admitted',
      why: 'Heuristic fallback thought it might be relevant.',
      stageIndex: 3,
      queryHits: ['vision language action'],
      discoveryChannels: ['openalex'],
      arxivData: unrelatedPaper as any,
    },
    paper: unrelatedPaper as any,
    topicDef,
    queries: ['autonomous driving world model', 'autonomous driving vision language action'],
  })

  assert.equal(guarded.status, 'rejected')
  assert.match(guarded.why, /Rejected by the topic/u)
})

test('paper tracker treats timeout-style arXiv failures as temporary source unavailability', () => {
  const timeoutError = new Error('request timed out while waiting for arXiv')
  ;(timeoutError as Error & { name?: string }).name = 'AbortError'

  assert.equal(__testing.isArxivUnavailableError(timeoutError), true)
  assert.equal(__testing.isArxivUnavailableError(new Error('fetch failed')), true)
  assert.equal(__testing.isArxivUnavailableError(new Error('arXiv API error: 429')), false)
})

test('paper tracker derives the next stage from chronological stage buckets instead of node count', () => {
  const topic = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'VLA world model',
    summary: 'Testing temporal stage planning.',
    description: 'Testing temporal stage planning.',
    createdAt: new Date('2025-01-03T00:00:00.000Z'),
    papers: [
      {
        id: 'seed-paper',
        title: 'Seed VLA World Model',
        titleZh: '种子论文',
        titleEn: 'Seed VLA World Model',
        summary: 'Seed paper.',
        explanation: 'Seed paper.',
        authors: '[]',
        published: new Date('2025-01-10T00:00:00.000Z'),
        tags: '[]',
        arxivUrl: 'https://arxiv.org/abs/2501.00001',
        pdfUrl: null,
      },
      {
        id: 'march-paper',
        title: 'Driving World Model with Language Actions',
        titleZh: '语言动作世界模型',
        titleEn: 'Driving World Model with Language Actions',
        summary: 'March evidence.',
        explanation: 'March evidence.',
        authors: '[]',
        published: new Date('2025-03-20T00:00:00.000Z'),
        tags: '[]',
        arxivUrl: 'https://arxiv.org/abs/2503.00002',
        pdfUrl: null,
      },
    ],
    nodes: [],
    stages: [],
  } as any

  const resolved = __testing.resolveTemporalDiscoveryWindow({
    topic,
    requestedWindowMonths: 1,
    stageMode: 'next-stage',
  })

  assert.equal(resolved.window.currentStageIndex, 3)
  assert.equal(resolved.window.targetStageIndex, 4)
  assert.equal(resolved.window.stageLabel, '2025.04')
  assert.equal(resolved.window.startDate.toISOString(), '2025-04-01T00:00:00.000Z')
  assert.equal(resolved.window.endDateExclusive.toISOString(), '2025-05-01T00:00:00.000Z')
})

test('paper tracker ignores topic creation time when deriving the next temporal stage', () => {
  const topic = {
    id: 'topic-vla-created-late',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'VLA world model',
    summary: 'Testing stage progression against topic creation time.',
    description: 'Testing stage progression against topic creation time.',
    createdAt: new Date('2026-04-07T00:00:00.000Z'),
    papers: [
      {
        id: 'seed-paper',
        title: 'TrafficBots: Towards World Models for Autonomous Driving Simulation and Motion Prediction',
        titleZh: 'TrafficBots',
        titleEn: 'TrafficBots',
        summary: 'Seed paper.',
        explanation: 'Seed paper.',
        authors: '[]',
        published: new Date('2023-05-29T00:00:00.000Z'),
        tags: '[]',
        arxivUrl: 'https://arxiv.org/abs/2305.00001',
        pdfUrl: null,
      },
    ],
    nodes: [],
    stages: [],
  } as any

  const resolved = __testing.resolveTemporalDiscoveryWindow({
    topic,
    requestedWindowMonths: 1,
    stageMode: 'next-stage',
  })

  assert.equal(resolved.window.currentStageIndex, 1)
  assert.equal(resolved.window.targetStageIndex, 2)
  assert.equal(resolved.window.stageLabel, '2023.06')
})

test('paper tracker bootstraps empty topics with a long historical discovery window instead of the current month', () => {
  const topic = {
    id: 'topic-vla-bootstrap',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'Autonomous driving VLA world model',
    summary: 'Bootstrap topic.',
    description: 'Bootstrap topic.',
    createdAt: new Date('2026-04-07T00:00:00.000Z'),
    papers: [],
    nodes: [],
    stages: [],
  } as any

  const resolved = __testing.resolveTemporalDiscoveryWindow({
    topic,
    requestedWindowMonths: 1,
    stageMode: 'next-stage',
    bootstrapWindowDays: 3650,
  })

  assert.equal(resolved.window.currentStageIndex, 0)
  assert.equal(resolved.window.targetStageIndex, 1)
  assert.equal(resolved.window.bootstrapMode, true)
  assert.equal(resolved.window.searchStartDate.toISOString(), '2016-05-01T00:00:00.000Z')
  assert.equal(resolved.window.searchEndDateExclusive.toISOString(), '2026-05-01T00:00:00.000Z')
  assert.match(resolved.window.stageLabel, /^bootstrap 2016\.05-2026\.04$/u)
})

test('paper tracker keeps only the source-stage bucket admitted during bootstrap', () => {
  const constrained = __testing.constrainBootstrapCandidatesToAnchorWindow(
    [
      {
        paperId: 'seed-stage-paper',
        title: 'TrafficBots: Towards World Models for Autonomous Driving Simulation and Motion Prediction',
        published: '2023-05-29T00:00:00.000Z',
        authors: ['Test Author'],
        candidateType: 'direct',
        confidence: 0.86,
        status: 'admitted',
        why: 'Strong mainline source-stage match.',
        stageIndex: 1,
        queryHits: ['autonomous driving world model'],
        discoveryChannels: ['openalex'],
      },
      {
        paperId: 'later-stage-paper',
        title: 'DriveDreamer: Towards Real-world-driven World Models for Autonomous Driving',
        published: '2023-09-18T00:00:00.000Z',
        authors: ['Test Author'],
        candidateType: 'direct',
        confidence: 0.88,
        status: 'admitted',
        why: 'Strong but later-stage match.',
        stageIndex: 1,
        queryHits: ['autonomous driving world model'],
        discoveryChannels: ['openalex'],
      },
    ] as any,
    1,
  )

  assert.equal(constrained.anchorWindow?.label, '2023.05')
  assert.equal(constrained.candidates[0]?.status, 'admitted')
  assert.equal(constrained.candidates[1]?.status, 'rejected')
  assert.match(constrained.candidates[1]?.why ?? '', /Deferred until 2023\.09/u)
})

test('paper tracker demotes generic world-model papers out of the direct mainline', () => {
  const topicDef = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['vision language action', 'world model', 'autonomous driving'],
    problemPreference: ['planning', 'closed-loop simulation'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const paper = {
    id: 'paper-cv',
    title: 'Neural World Models for Computer Vision',
    summary: 'A general world-model paper for video understanding and visual prediction.',
    authors: ['Test Author'],
    published: '2023-06-15T00:00:00.000Z',
    categories: ['cs.CV'],
    arxivUrl: 'https://example.com/paper-cv',
  }

  const signals = __testing.buildTopicAdmissionSignals(paper as any, topicDef, [
    'autonomous driving world model',
    'self-driving world model',
  ])

  assert.equal(signals.directTopicLexicalFit, false)
  assert.equal(__testing.normalizeCandidateTypeBySignals('direct', signals), 'branch')
})

test('paper tracker builds discovery plans from stage anchors and exact time windows', () => {
  const topic = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'VLA world model',
    summary: 'Testing discovery planning.',
    description: 'Testing discovery planning.',
    createdAt: new Date('2025-01-03T00:00:00.000Z'),
    papers: [
      {
        id: 'seed-paper',
        title: 'Seed VLA World Model',
        titleZh: '种子论文',
        titleEn: 'Seed VLA World Model',
        summary: 'Seed paper.',
        explanation: 'Seed paper.',
        authors: '[]',
        published: new Date('2025-01-10T00:00:00.000Z'),
        tags: '[]',
        arxivUrl: 'https://arxiv.org/abs/2501.00001',
        pdfUrl: null,
      },
      {
        id: 'feb-paper',
        title: 'VLA Planning with Latent Driving World Models',
        titleZh: '潜在驾驶世界模型规划',
        titleEn: 'VLA Planning with Latent Driving World Models',
        summary: 'February anchor evidence.',
        explanation: 'February anchor evidence.',
        authors: '[]',
        published: new Date('2025-02-14T00:00:00.000Z'),
        tags: '[]',
        arxivUrl: 'https://arxiv.org/abs/2502.00002',
        pdfUrl: null,
      },
    ],
    nodes: [
      {
        id: 'node-feb',
        stageIndex: 2,
        nodeLabel: 'VLA planning',
        nodeSubtitle: 'Language-conditioned control',
        nodeSummary: 'How language-conditioned planning changes the world-model interface.',
        primaryPaperId: 'feb-paper',
        createdAt: new Date('2025-02-14T00:00:00.000Z'),
        updatedAt: new Date('2025-02-16T00:00:00.000Z'),
        papers: [{ paperId: 'feb-paper' }],
      },
    ],
    stages: [],
  } as any

  const stageWindow = __testing.resolveTemporalDiscoveryWindow({
    topic,
    requestedWindowMonths: 1,
    stageMode: 'next-stage',
  }).window
  const plan = __testing.buildDiscoveryPlan({
    topic,
    topicDef: {
      id: 'topic-vla',
      nameZh: '自动驾驶 VLA 世界模型',
      nameEn: 'Autonomous Driving VLA World Models',
      focusLabel: 'VLA world model',
      queryTags: ['language action driving', 'latent world model'],
      problemPreference: ['planning', 'language-conditioned control'],
      defaults: {
        bootstrapWindowDays: 180,
        maxCandidates: 8,
      },
    },
    input: {
      topicId: 'topic-vla',
      stageMode: 'next-stage',
      discoverySource: 'external-only',
    },
    stageWindow,
  })

  assert.equal(plan.stageIndex, 3)
  assert.equal(plan.stageLabel, '2025.03')
  assert.equal(plan.startDate.toISOString(), '2025-03-01T00:00:00.000Z')
  assert.equal(plan.endDateExclusive.toISOString(), '2025-04-01T00:00:00.000Z')
  assert.ok(plan.anchorPapers.includes('2502.00002'))
  assert.ok(plan.queries.some((query) => /VLA|planning|latent world model/iu.test(query)))
  assert.ok(plan.discoveryQueries.some((query) => query.targetProblemIds.includes('node-feb')))
})

test('paper tracker expands VLA discovery queries into domain-method and domain-problem pairs', () => {
  const topic = {
    id: 'topic-vla-query',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    summary: 'Closed-loop planning and simulation for driving agents.',
    description: 'Closed-loop planning and simulation for driving agents.',
    createdAt: new Date('2026-04-07T00:00:00.000Z'),
    papers: [],
    nodes: [],
    stages: [],
  } as any

  const stageWindow = __testing.resolveTemporalDiscoveryWindow({
    topic,
    requestedWindowMonths: 1,
    stageMode: 'next-stage',
    bootstrapWindowDays: 3650,
  }).window
  const plan = __testing.buildDiscoveryPlan({
    topic,
    topicDef: {
      id: topic.id,
      nameZh: topic.nameZh,
      nameEn: topic.nameEn,
      focusLabel: topic.focusLabel,
      queryTags: [
        'vision language action',
        'latent world model',
        'closed-loop simulation',
      ],
      problemPreference: ['planning', 'control', 'simulation'],
      defaults: {
        bootstrapWindowDays: 3650,
        maxCandidates: 8,
      },
    },
    input: {
      topicId: topic.id,
      stageMode: 'next-stage',
      discoverySource: 'external-only',
    },
    stageWindow,
  })

  assert.ok(
    plan.queries.some(
      (query) =>
        /\b(?:autonomous driving|driving)\b/iu.test(query) &&
        /\b(?:world model|world models|vla|vision language action)\b/iu.test(query),
    ),
  )
  assert.ok(
    plan.queries.some(
      (query) =>
        /\b(?:autonomous driving|driving)\b/iu.test(query) &&
        /\b(?:planning|control|simulation|closed-loop)\b/iu.test(query),
    ),
  )
})
