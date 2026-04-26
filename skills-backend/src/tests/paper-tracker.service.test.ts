import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../../skill-packs/research/paper-tracker/executor'
import { __testing as discoveryTesting } from '../../skill-packs/research/paper-tracker/discovery'
import { prisma } from '../lib/prisma'
import { loadTopicStageConfig } from '../services/topics/topic-stage-config'

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

test('paper tracker rejects 5G communication papers during early autonomous-driving continuity stages', () => {
  const topicDef = {
    id: 'autonomous-driving',
    nameZh: '自动驾驶世界模型',
    nameEn: 'Autonomous Driving World Models',
    focusLabel: 'autonomous driving world model',
    queryTags: ['autonomous driving', 'end-to-end driving', 'self-driving control'],
    problemPreference: ['closed-loop control', 'planning'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const communicationPaper = {
    id: 'paper-5g',
    title: 'A Comparison of Symbol-Wise and Self-Contained Frame Structure for 5G Services',
    summary:
      'We compare symbol-wise and self-contained radio frame structures for 5G services, focusing on latency, throughput, and numerology choices in wireless communication.',
    authors: ['Test Author'],
    published: '2017-02-03T00:00:00.000Z',
    categories: ['cs.NI'],
    primaryCategory: 'cs.NI',
    arxivUrl: 'https://arxiv.org/abs/1702.00001',
  }

  const admissionContext = {
    topicId: 'autonomous-driving',
    targetStageIndex: 2,
    bootstrapMode: false,
    stageLabel: '2016.10-2017.03',
    anchorPaperTitles: [
      'End to End Learning for Self-Driving Cars',
      'Brain-Inspired Cognitive Model with Attention for Self-Driving Cars',
    ],
    anchorNodeTexts: ['end-to-end driving control', 'driving attention and recovery'],
  } as any

  const queries = ['end-to-end autonomous driving', 'self-driving control', 'driving attention']
  const relevance = __testing.calculateSimpleRelevance(
    communicationPaper as any,
    topicDef,
    queries,
    admissionContext,
  )

  assert.equal(
    __testing.passesTopicAdmissionGuard({
      paper: communicationPaper as any,
      topicDef,
      queries,
      candidateType: 'branch',
      admissionContext,
    }),
    false,
  )
  assert.ok(relevance <= 0.34, `expected early-stage noise papers to be penalized, got ${relevance}`)
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

test('paper tracker builds a broader discovery plan without diluting stage-bounded search', () => {
  const topic = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    summary: 'Testing broader discovery planning.',
    description: 'Testing broader discovery planning.',
    createdAt: new Date('2025-01-03T00:00:00.000Z'),
    papers: [],
    nodes: [],
    stages: [],
  } as any

  const topicDef = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['vision language action', 'world model', 'autonomous driving'],
    problemPreference: ['planning', 'closed-loop simulation', 'latent dynamics'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const stageWindow = {
    currentStageIndex: 2,
    targetStageIndex: 2,
    windowMonths: 3,
    stageLabel: '2026.01-2026.03',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDateExclusive: new Date('2026-04-01T00:00:00.000Z'),
    searchStartDate: new Date('2026-01-01T00:00:00.000Z'),
    searchEndDateExclusive: new Date('2026-04-01T00:00:00.000Z'),
    anchorStageIndex: 1,
    bootstrapMode: false,
    anchorPapers: [
      {
        paperId: 'paper-1',
        title: 'Drive-WM: A Driving World Model for Closed-Loop Autonomous Driving',
        published: '2026-01-12T00:00:00.000Z',
      },
    ],
    anchorNodes: [
      {
        nodeId: 'node-1',
        title: 'Closed-loop world models',
        summary: 'Latent dynamics, planning, and world-model-based simulation for self-driving.',
      },
    ],
  } as any

  const plan = __testing.buildDiscoveryPlan({
    topic,
    topicDef,
    input: {
      topicId: 'topic-vla',
    },
    stageWindow,
  })

  assert.equal(plan.discoveryRounds, 2)
  assert.ok(plan.queries.length >= 8)
  assert.ok(plan.maxCandidates >= 18)
})

test('paper tracker duration policy overrides stage and node caps for long-running research', () => {
  const settings = __testing.resolvePaperTrackerResearchSettings({
    input: {
      topicId: 'topic-vla',
      maxCandidates: 200,
      maxPapersPerNode: 20,
      minimumUsefulPapersPerNode: 10,
      durationResearchPolicy: {
        maxCandidatesPerStage: 200,
        targetPapersPerNode: 20,
        minimumUsefulPapersPerNode: 10,
        targetCandidatesBeforeAdmission: 180,
        highConfidenceThreshold: 0.74,
      },
    },
    researchConfig: {
      maxCandidatesPerStage: 12,
      discoveryQueryLimit: 24,
      admissionThreshold: 0.63,
      maxPapersPerNode: 6,
      minPapersPerNode: 5,
      targetCandidatesBeforeAdmission: 60,
      highConfidenceThreshold: 0.83,
      semanticScholarLimit: 10,
      discoveryRounds: 2,
    },
  })

  assert.equal(settings.maxCandidatesPerStage, 200)
  assert.equal(settings.maxPapersPerNode, 20)
  assert.equal(settings.minimumUsefulPapersPerNode, 10)
  assert.equal(settings.targetCandidatesBeforeAdmission, 200)
  assert.equal(settings.highConfidenceThreshold, 0.74)
})

test('paper tracker configurable high-confidence thresholds control direct and branch admissions', () => {
  assert.equal(
    __testing.shouldAdmitCandidate(
      {
        verdict: 'reject',
        candidateType: 'direct',
        confidence: 0.76,
      },
      {
        directHighConfidenceThreshold: 0.75,
        branchHighConfidenceThreshold: 0.71,
      },
    ),
    'admitted',
  )

  assert.equal(
    __testing.shouldAdmitCandidate(
      {
        verdict: 'reject',
        candidateType: 'branch',
        confidence: 0.72,
      },
      {
        directHighConfidenceThreshold: 0.75,
        branchHighConfidenceThreshold: 0.71,
      },
    ),
    'admitted',
  )

  assert.equal(
    __testing.shouldAdmitCandidate(
      {
        verdict: 'reject',
        candidateType: 'direct',
        confidence: 0.7,
      },
      {
        directHighConfidenceThreshold: 0.75,
        branchHighConfidenceThreshold: 0.71,
      },
    ),
    'candidate',
  )
})

test('paper tracker multi-angle duration plans add rationale-rich discovery queries', () => {
  const topic = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    summary: 'Testing multi-angle discovery planning.',
    description: 'Testing multi-angle discovery planning.',
    createdAt: new Date('2025-01-03T00:00:00.000Z'),
    papers: [],
    nodes: [],
    stages: [],
  } as any

  const topicDef = {
    id: 'topic-vla',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['vision language action', 'world model', 'autonomous driving'],
    problemPreference: ['planning', 'closed-loop simulation', 'latent dynamics'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const stageWindow = {
    currentStageIndex: 2,
    targetStageIndex: 2,
    windowMonths: 3,
    stageLabel: '2026.01-2026.03',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDateExclusive: new Date('2026-04-01T00:00:00.000Z'),
    searchStartDate: new Date('2026-01-01T00:00:00.000Z'),
    searchEndDateExclusive: new Date('2026-04-01T00:00:00.000Z'),
    anchorStageIndex: 1,
    bootstrapMode: false,
    anchorPapers: [
      {
        paperId: 'paper-1',
        title: 'Drive-WM: A Driving World Model for Closed-Loop Autonomous Driving',
        published: '2026-01-12T00:00:00.000Z',
      },
    ],
    anchorNodes: [
      {
        nodeId: 'node-1',
        title: 'Closed-loop world models',
        summary: 'Latent dynamics, planning, and world-model-based simulation for self-driving.',
      },
    ],
  } as any

  const baselinePlan = __testing.buildDiscoveryPlan({
    topic,
    topicDef,
    input: {
      topicId: 'topic-vla',
      maxCandidates: 200,
    },
    stageWindow,
    discoveryQueryLimit: 16,
    discoveryRounds: 3,
    semanticScholarLimit: 20,
    maxPapersPerNode: 20,
  })

  const plan = __testing.buildMultiAngleDiscoveryPlan({
    topic,
    topicDef,
    input: {
      topicId: 'topic-vla',
      maxCandidates: 200,
      durationResearchPolicy: {
        researchAngles: [
          {
            id: 'evidence-audit',
            label: 'Evidence Audit',
            focus: 'citation',
            prompts: ['benchmark', 'ablation', 'evaluation protocol'],
          },
          {
            id: 'artifact-grounding',
            label: 'Artifact Grounding',
            focus: 'method',
            prompts: ['table evidence', 'formula objective'],
          },
        ],
      },
    },
    stageWindow,
    discoveryQueryLimit: 16,
    discoveryRounds: 3,
    semanticScholarLimit: 20,
    maxPapersPerNode: 20,
    minimumUsefulPapersPerNode: 10,
  })

  assert.equal(plan.maxPapersPerNode, 20)
  assert.equal(plan.minimumUsefulPapersPerNode, 10)
  assert.equal(plan.maxCandidates, 200)
  assert.ok(plan.queries.length >= baselinePlan.queries.length)
  assert.ok(plan.discoveryQueries.some((query) => /Evidence Audit lens/u.test(query.rationale)))
  assert.ok(plan.discoveryQueries.some((query) => query.focus === 'method'))
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

test('paper tracker admits early autonomous-driving continuity papers before world-model terminology appears', () => {
  const topicDef = {
    id: 'autonomous-driving',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['autonomous driving', 'self-driving', 'world model'],
    problemPreference: ['closed-loop robustness', 'recovery policy', 'world modeling'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const paper = {
    id: 'paper-early-driving',
    title: 'Query-Efficient Imitation Learning for End-to-End Simulated Driving',
    summary:
      'We study imitation learning for end-to-end autonomous driving with intervention recovery and closed-loop evaluation in simulation.',
    authors: ['Test Author'],
    published: '2017-02-15T00:00:00.000Z',
    categories: ['cs.RO', 'cs.LG'],
    arxivUrl: 'https://example.com/paper-early-driving',
  }

  const admissionContext = {
    topicId: 'autonomous-driving',
    targetStageIndex: 2,
    bootstrapMode: false,
    stageLabel: '2016.10-2017.03',
    anchorPaperTitles: ['End to End Learning for Self-Driving Cars'],
    anchorNodeTexts: [
      'End-to-end driving policy formation',
      'Direct camera-to-control driving policies and recovery strategies.',
    ],
  }
  const queries = [
    'end-to-end autonomous driving',
    'imitation learning driving',
    'self-driving recovery',
  ]

  const signals = __testing.buildTopicAdmissionSignals(
    paper as any,
    topicDef,
    queries,
    admissionContext as any,
  )

  assert.equal(signals.earlyStageDrivingFit, true)
  assert.equal(
    __testing.passesTopicAdmissionGuard({
      paper: paper as any,
      topicDef,
      queries,
      candidateType: 'branch',
      admissionContext: admissionContext as any,
    }),
    true,
  )

  const guarded = __testing.enforceTopicAdmissionGuard({
    candidate: {
      paperId: paper.id,
      title: paper.title,
      published: paper.published,
      authors: paper.authors,
      candidateType: 'direct',
      confidence: 0.72,
      status: 'admitted',
      why: 'Strong early-stage autonomous-driving continuity.',
      stageIndex: 2,
      queryHits: queries,
      discoveryChannels: ['openalex'],
      arxivData: paper as any,
    },
    paper: paper as any,
    topicDef,
    queries,
    admissionContext: admissionContext as any,
  })

  assert.equal(guarded.status, 'admitted')
  assert.equal(guarded.candidateType, 'branch')
})

test('paper tracker admits early autonomous-driving interpretability papers as stage continuity branches', () => {
  const topicDef = {
    id: 'autonomous-driving',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['autonomous driving', 'self-driving', 'world model'],
    problemPreference: ['closed-loop robustness', 'recovery policy', 'world modeling'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const paper = {
    id: 'paper-interpretable-driving',
    title: 'Interpretable Learning for Self-Driving Cars by Visualizing Causal Attention',
    summary:
      'Deep neural perception and control networks for self-driving vehicles should provide easy-to-interpret rationales. We use a visual attention model trained end-to-end from images to steering angle and apply causal filtering to expose which regions truly influence steering control.',
    authors: ['Test Author'],
    published: '2017-03-30T00:00:00.000Z',
    categories: ['cs.CV', 'cs.RO'],
    arxivUrl: 'https://example.com/paper-interpretable-driving',
  }

  const admissionContext = {
    topicId: 'autonomous-driving',
    targetStageIndex: 2,
    bootstrapMode: false,
    stageLabel: '2016.10-2017.03',
    anchorPaperTitles: ['End to End Learning for Self-Driving Cars'],
    anchorNodeTexts: [
      'End-to-end driving policy formation',
      'Direct camera-to-control driving policies and recovery strategies.',
    ],
  }
  const queries = [
    'End to End Learning for Self-Driving Cars',
    'end-to-end autonomous driving',
    'causal attention self-driving',
  ]

  const signals = __testing.buildTopicAdmissionSignals(
    paper as any,
    topicDef,
    queries,
    admissionContext as any,
  )

  assert.equal(signals.earlyStageDrivingFit, true)
  assert.equal(signals.earlyStageNoiseSignal, false)
  assert.ok(signals.stageContinuityEvidenceScore >= 4)
  assert.equal(
    __testing.passesTopicAdmissionGuard({
      paper: paper as any,
      topicDef,
      queries,
      candidateType: 'branch',
      admissionContext: admissionContext as any,
    }),
    true,
  )
})

test('paper tracker keeps perception-only autonomous-driving stacks out of the early continuity bridge', () => {
  const topicDef = {
    id: 'autonomous-driving',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['autonomous driving', 'self-driving', 'world model'],
    problemPreference: ['closed-loop robustness', 'recovery policy', 'world modeling'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const paper = {
    id: 'paper-multinet',
    title: 'MultiNet: Real-time Joint Semantic Reasoning for Autonomous Driving',
    summary:
      'We present a unified architecture for classification, detection, and semantic segmentation in autonomous driving. The shared encoder can be trained end-to-end and reaches real-time inference on KITTI.',
    authors: ['Test Author'],
    published: '2016-12-22T00:00:00.000Z',
    categories: ['cs.CV'],
    arxivUrl: 'https://example.com/paper-multinet',
  }

  const admissionContext = {
    topicId: 'autonomous-driving',
    targetStageIndex: 2,
    bootstrapMode: false,
    stageLabel: '2016.10-2017.03',
    anchorPaperTitles: ['End to End Learning for Self-Driving Cars'],
    anchorNodeTexts: [
      'End-to-end driving policy formation',
      'Direct camera-to-control driving policies and recovery strategies.',
    ],
  }
  const queries = [
    'End to End Learning for Self-Driving Cars',
    'end-to-end autonomous driving',
    'autonomous driving end-to-end',
  ]

  const signals = __testing.buildTopicAdmissionSignals(
    paper as any,
    topicDef,
    queries,
    admissionContext as any,
  )

  assert.equal(signals.earlyStageDrivingFit, true)
  assert.equal(signals.earlyStageNoiseSignal, true)
  assert.equal(
    __testing.passesTopicAdmissionGuard({
      paper: paper as any,
      topicDef,
      queries,
      candidateType: 'branch',
      admissionContext: admissionContext as any,
    }),
    false,
  )
})

test('paper tracker rejects human-robot trust papers that only mention autonomous driving as a task domain', () => {
  const topicDef = {
    id: 'autonomous-driving',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: 'autonomous driving VLA world model',
    queryTags: ['autonomous driving', 'self-driving', 'world model'],
    problemPreference: ['closed-loop robustness', 'recovery policy', 'world modeling'],
    defaults: {
      bootstrapWindowDays: 3650,
      maxCandidates: 8,
    },
  } as any

  const paper = {
    id: 'paper-trust-robots',
    title: 'Maintaining efficient collaboration with trust-seeking robots',
    summary:
      'We infer a human supervisor trust state and adapt robot behavior to maintain collaboration efficiency. The end-to-end trust-seeking robot framework is demonstrated in aerial terrain coverage and interactive autonomous driving.',
    authors: ['Test Author'],
    published: '2016-10-01T00:00:00.000Z',
    categories: ['cs.RO'],
    arxivUrl: 'https://example.com/paper-trust-robots',
  }

  const admissionContext = {
    topicId: 'autonomous-driving',
    targetStageIndex: 2,
    bootstrapMode: false,
    stageLabel: '2016.10-2017.03',
    anchorPaperTitles: ['End to End Learning for Self-Driving Cars'],
    anchorNodeTexts: [
      'End-to-end driving policy formation',
      'Direct camera-to-control driving policies and recovery strategies.',
    ],
  }
  const queries = [
    'End to End Learning for Self-Driving Cars',
    'end-to-end autonomous driving',
    'autonomous driving end-to-end',
  ]

  const signals = __testing.buildTopicAdmissionSignals(
    paper as any,
    topicDef,
    queries,
    admissionContext as any,
  )

  assert.equal(signals.earlyStageDrivingFit, true)
  assert.equal(signals.humanRobotInteractionSignal, true)
  assert.equal(signals.earlyStageNoiseSignal, true)
  assert.equal(
    __testing.passesTopicAdmissionGuard({
      paper: paper as any,
      topicDef,
      queries,
      candidateType: 'branch',
      admissionContext: admissionContext as any,
    }),
    false,
  )
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

test('structured discovery normalizes Semantic Scholar supplements into stage-filterable candidates', () => {
  const candidate = discoveryTesting.normalizeSemanticScholarCandidate({
    paper: {
      paperId: 'semantic-paper-1',
      externalIds: {
        ArXiv: '2503.01234',
        DOI: '10.1000/example',
      },
      title: 'DriveWorldVLA: Vision-Language-Action World Models for Autonomous Driving',
      abstract: 'A world-model paper for autonomous driving with VLA control.',
      authors: [{ name: 'Ada Researcher' }, { name: 'Bo Scientist' }],
      year: 2025,
      citationCount: 42,
      referenceCount: 10,
      publicationDate: '2025-03-12',
      openAccessPdf: {
        url: 'https://arxiv.org/pdf/2503.01234.pdf',
        status: 'GREEN',
      },
    },
    discoveryChannel: 'semantic-scholar:problem',
    query: {
      query: 'autonomous driving vision language action world model',
      rationale: 'stage supplement',
      targetProblemIds: ['node-vla'],
      targetBranchIds: ['branch-main'],
      targetAnchorPaperIds: ['paper-anchor'],
      focus: 'problem',
    },
    discoveryRound: 1,
  })

  assert.ok(candidate)
  assert.equal(candidate?.paperId, '2503.01234')
  assert.equal(candidate?.source, 'semantic-scholar')
  assert.equal(candidate?.published, '2025-03-12T00:00:00.000Z')
  assert.equal(candidate?.arxivUrl, 'https://arxiv.org/abs/2503.01234')
  assert.equal(candidate?.pdfUrl, 'https://arxiv.org/pdf/2503.01234.pdf')
  assert.deepEqual(candidate?.matchedProblemNodeIds, ['node-vla'])
  assert.deepEqual(candidate?.matchedBranchIds, ['branch-main'])
  assert.deepEqual(candidate?.queryHits, ['autonomous driving vision language action world model'])
})

test('structured discovery dedupes and normalizes external query strings before retrieval fan-out', () => {
  const deduped = discoveryTesting.dedupeDiscoveryQueries([
    {
      query: ' Autonomous Driving World Models ',
      rationale: 'a',
      targetProblemIds: ['node-a'],
      focus: 'problem',
    },
    {
      query: 'autonomous driving world models',
      rationale: 'b',
      targetProblemIds: ['node-b'],
      focus: 'method',
    },
    {
      query: 'Closed-loop planning with language actions',
      rationale: 'c',
      targetProblemIds: ['node-c'],
      focus: 'merge',
    },
  ])

  assert.deepEqual(
    deduped.map((query) => query.query),
    ['Autonomous Driving World Models', 'Closed-loop planning with language actions'],
  )
})

test('structured discovery falls back to anchor-wide window checks when branch targeting is stale', () => {
  const inWindow = discoveryTesting.withinAnyWindow({
    published: '2025-01-20T00:00:00.000Z',
    anchors: [
      {
        paperId: 'anchor-a',
        title: 'Anchor A',
        published: '2025-01-10T00:00:00.000Z',
        branchId: 'branch-a',
      },
    ],
    query: {
      query: 'stale branch filter',
      rationale: 'test fallback behavior',
      targetProblemIds: ['node-a'],
      targetBranchIds: ['missing-branch'],
      focus: 'problem',
    },
    maxWindowMonths: 1,
  })
  const outOfWindow = discoveryTesting.withinAnyWindow({
    published: '2025-03-20T00:00:00.000Z',
    anchors: [
      {
        paperId: 'anchor-a',
        title: 'Anchor A',
        published: '2025-01-10T00:00:00.000Z',
        branchId: 'branch-a',
      },
    ],
    query: {
      query: 'stale branch filter',
      rationale: 'test fallback behavior',
      targetProblemIds: ['node-a'],
      targetBranchIds: ['missing-branch'],
      focus: 'problem',
    },
    maxWindowMonths: 1,
  })

  assert.equal(inWindow, true)
  assert.equal(outOfWindow, false)
})

test('structured discovery widens Semantic Scholar year prefilter while keeping strict date windows later', () => {
  const bounds = discoveryTesting.deriveSemanticScholarYearBounds(
    [
      {
        paperId: 'anchor-1',
        title: 'Anchor 1',
        published: '2025-01-10T00:00:00.000Z',
      },
      {
        paperId: 'anchor-2',
        title: 'Anchor 2',
        published: '2026-05-12T00:00:00.000Z',
      },
    ],
    2,
  )

  assert.equal(bounds.yearStart, 2024)
  assert.equal(bounds.yearEnd, 2027)
})

test('paper tracker materialization turns committed stage papers into stage nodes for isolated topics', async () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const topicId = `paper-tracker-materialization-${uniqueSuffix}`
  const stageIndex = 47
  const stageLabel = '2028.01-2028.06'
  const stageStartDate = new Date('2028-01-01T00:00:00.000Z')
  const stageEndDateExclusive = new Date('2028-07-01T00:00:00.000Z')
  const paperIds = [
    `${topicId}-paper-a`,
    `${topicId}-paper-b`,
  ]
  const topicStageConfigKey = `topic-stage-config:v1:${topicId}`
  const logger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  }
  let createdNodeIds: string[] = []
  await prisma.topics.create({
    data: {
      id: topicId,
      nameZh: 'Paper Tracker Materialization Topic',
      nameEn: 'Paper Tracker Materialization Topic',
      language: 'en',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  await prisma.papers.create({
    data: {
      id: paperIds[0],
      topicId,
      title: 'Query-Efficient Recovery Policies for End-to-End Autonomous Driving',
      titleZh: 'Query-Efficient Recovery Policies for End-to-End Autonomous Driving',
      titleEn: 'Query-Efficient Recovery Policies for End-to-End Autonomous Driving',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2028-01-15T00:00:00.000Z'),
      summary:
        'Studies query-efficient recovery policies for end-to-end autonomous driving with closed-loop evidence.',
      explanation:
        'Focuses on recovery policy learning, intervention efficiency, and closed-loop stabilization for driving.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['stage-materialization-test']),
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
  })
  await prisma.papers.create({
    data: {
      id: paperIds[1],
      topicId,
      title: 'Interpretable Attention Recovery for Self-Driving Control',
      titleZh: 'Interpretable Attention Recovery for Self-Driving Control',
      titleEn: 'Interpretable Attention Recovery for Self-Driving Control',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2028-02-10T00:00:00.000Z'),
      summary:
        'Connects interpretable attention maps to recovery-oriented end-to-end autonomous driving control.',
      explanation:
        'Explains how attention-guided recovery policies improve robustness and interpretability in closed-loop driving.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['stage-materialization-test']),
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
  })

  try {
    const result = await __testing.materializeTrackerStageCoverage({
      topicId,
      stageIndex,
      stageLabel,
      stageStartDate,
      stageEndDateExclusive,
      stageWindowMonths: 6,
      admittedPaperIds: paperIds,
      artifactMode: 'off',
      context: {
        logger,
      } as any,
    })

    createdNodeIds = result.affectedNodeIds

    assert.equal(result.stageIndex, stageIndex)
    assert.equal(result.stagePaperIds.includes(paperIds[0]), true)
    assert.equal(result.stagePaperIds.includes(paperIds[1]), true)
    assert.ok(result.affectedNodeIds.length >= 1)

    const topicStageConfig = await loadTopicStageConfig(topicId)
    assert.equal(topicStageConfig.windowMonths, 6)

    const stage = await prisma.topic_stages.findFirst({
      where: {
        topicId,
        order: stageIndex,
      },
    })
    if (stage) {
      assert.equal(stage.order, stageIndex)
    }

    const nodes = await prisma.research_nodes.findMany({
      where: {
        id: { in: result.affectedNodeIds },
      },
      include: {
        node_papers: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (nodes.length > 0) {
      const nodePaperIds = new Set(nodes.flatMap((node) => node.node_papers.map((entry) => entry.paperId)))
      assert.equal(nodePaperIds.has(paperIds[0]), true)
      assert.equal(nodePaperIds.has(paperIds[1]), true)
    }
  } finally {
    if (createdNodeIds.length > 0) {
      await prisma.node_papers.deleteMany({
        where: {
          nodeId: { in: createdNodeIds },
        },
      })
      await prisma.research_nodes.deleteMany({
        where: {
          id: { in: createdNodeIds },
        },
      })
    }

    await prisma.topic_stages.deleteMany({
      where: {
        topicId,
        order: stageIndex,
      },
    })
    await prisma.papers.deleteMany({
      where: {
        id: { in: paperIds },
      },
    })
    await prisma.topics.deleteMany({
      where: {
        id: topicId,
      },
    })
    await prisma.system_configs.deleteMany({
      where: {
        key: topicStageConfigKey,
      },
    })
  }
})

test('paper tracker semantic scholar query budget now adapts instead of pinning to a fixed value', () => {
  assert.equal(discoveryTesting.resolveSemanticScholarQueryBudget(5, 40), 6)
  assert.equal(discoveryTesting.resolveSemanticScholarQueryBudget(40, 200), 10)
  assert.equal(discoveryTesting.resolveSemanticScholarQueryBudget(120, 400), 15)
})
