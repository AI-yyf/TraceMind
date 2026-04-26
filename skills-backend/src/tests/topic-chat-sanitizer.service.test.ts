import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../services/topics/alpha-topic'

test('topic chat sanitizer rejects leaked reasoning traces from compatible models', () => {
  const leaked = `authorContext and selectedEvidence are available.
First, let's analyze the key constraints.
Let me organize the answer before I respond.`

  assert.equal(__testing.looksLikeReasoningLeak(leaked), true)
  assert.equal(__testing.normalizeChatAnswerText(leaked), '')
})

test('topic chat sanitizer preserves clean final answers', () => {
  const answer = `Answer: the mainline moves from end-to-end driving, to world models, and then to unified frameworks.
The main unresolved boundary is still the quality of the evidence index.`

  assert.equal(
    __testing.normalizeChatAnswerText(answer),
    `the mainline moves from end-to-end driving, to world models, and then to unified frameworks.
The main unresolved boundary is still the quality of the evidence index.`,
  )
})

test('topic chat author context drops failed zero-yield research reports so they do not dominate answers', () => {
  const report = __testing.compactTopicChatResearchReport({
    schemaVersion: 'topic-research-report-v1',
    reportId: 'report-1',
    taskId: 'task-1',
    topicId: 'topic-1',
    topicName: 'Topic',
    researchMode: 'duration',
    trigger: 'manual',
    status: 'paused',
    durationHours: 1,
    startedAt: '2026-04-02T12:18:02.833Z',
    deadlineAt: '2026-04-02T13:18:02.833Z',
    completedAt: '2026-04-02T12:26:56.246Z',
    updatedAt: '2026-04-02T13:30:35.685Z',
    currentStage: 1,
    totalStages: 5,
    completedStageCycles: 0,
    totalRuns: 1,
    successfulRuns: 0,
    failedRuns: 1,
    discoveredPapers: 0,
    admittedPapers: 0,
    generatedContents: 0,
    latestStageSummary: 'args.orchestration.nodeActions is not iterable',
    headline: 'Execution fault',
    dek: 'Internal error',
    summary: 'This stale failure report should not dominate topic chat.',
    paragraphs: ['Old failure paragraph'],
    keyMoves: ['Old failure move'],
    openQuestions: ['Old failure question'],
    latestNodeActions: [],
  })

  assert.equal(report, null)
})

test('topic chat request parser treats structured workbench payload as the only grounding source', () => {
  const parsed = __testing.parseTopicChatRequest(
    'How many mainline papers are visible right now?',
    {
      controls: {
        responseStyle: 'brief',
        reasoningEnabled: true,
        retrievalEnabled: false,
      },
      contextItems: ['node: World Models', 'paper: GAIA-1'],
      agentBrief: 'Focus on deployment risk boundaries.',
      materials: [
        {
          id: 'material-1',
          kind: 'text',
          name: 'deployment-notes.md',
          mimeType: 'text/markdown',
          summary: 'Failure modes covering planner latency and recovery boundaries.',
          highlights: ['Planner latency', 'Recovery boundary'],
          status: 'ready',
        },
      ],
    },
  )

  assert.equal(parsed.userQuestion, 'How many mainline papers are visible right now?')
  assert.deepEqual(parsed.contextItems, ['node: World Models', 'paper: GAIA-1'])
  assert.equal(parsed.controls.responseStyle, 'brief')
  assert.equal(parsed.controls.reasoningEnabled, true)
  assert.equal(parsed.controls.retrievalEnabled, false)
  assert.equal(parsed.retrievalQuery.includes('GAIA-1'), true)
  assert.equal(parsed.retrievalQuery.includes('deployment-notes.md'), true)
})

test('topic chat request parser falls back to default controls when no structured workbench is provided', () => {
  const parsed = __testing.parseTopicChatRequest('What is currently on the topic mainline?')

  assert.equal(parsed.userQuestion, 'What is currently on the topic mainline?')
  assert.deepEqual(parsed.contextItems, [])
  assert.equal(parsed.controls.responseStyle, 'balanced')
  assert.equal(parsed.controls.reasoningEnabled, true)
  assert.equal(parsed.controls.retrievalEnabled, true)
  assert.equal(parsed.retrievalQuery, 'What is currently on the topic mainline?')
})

test('topic chat can answer current mainline paper counts without deferring to the model', () => {
  const catalog: Parameters<typeof __testing.buildDirectTopicChatResponse>[1] = {
    topicId: 'topic-1',
    topicTitle: 'Autonomous Driving World Models',
    stageCount: 5,
    nodeCount: 5,
    paperCount: 5,
    papers: [
      {
        paperId: 'paper-1',
        anchorId: 'paper:paper-1',
        route: '/node/node-1?anchor=paper%3Apaper-1',
        title: 'End-to-End Driving Through Uncertainty',
        titleEn: 'End-to-End Driving Through Uncertainty',
        summary: 'Early end-to-end system.',
        explanation: 'Validated that direct policy learning could work.',
        aliases: ['End-to-End Driving Through Uncertainty'],
        stageIndex: 1,
        stageTitle: 'Problem framing',
        nodeId: 'node-1',
        nodeTitle: 'End-to-end driving emerges',
        nodeSummary: 'Stage origin point',
      },
      {
        paperId: 'paper-5',
        anchorId: 'paper:paper-5',
        route: '/node/node-5?anchor=paper%3Apaper-5',
        title: 'LMDrive',
        titleEn: 'LMDrive',
        summary: 'Latest stage',
        explanation: 'Language models reinforce the driving stack.',
        aliases: ['LMDrive'],
        stageIndex: 5,
        stageTitle: 'Integrated analysis',
        nodeId: 'node-5',
        nodeTitle: 'Multimodal models reinforce planning',
        nodeSummary: 'Current mainline edge',
      },
    ],
  }

  const response = __testing.buildDirectTopicChatResponse(
    'How many papers are currently visible on the mainline?',
    catalog,
  )

  assert.equal(Boolean(response), true)
  assert.match(response?.answer ?? '', /5/u)
  assert.equal(response?.citations.length ?? 0, 2)
})

test('topic chat clearly says when a named paper is not part of the current mainline', () => {
  const catalog: Parameters<typeof __testing.buildDirectTopicChatResponse>[1] = {
    topicId: 'topic-1',
    topicTitle: 'Autonomous Driving World Models',
    stageCount: 5,
    nodeCount: 5,
    paperCount: 5,
    papers: [
      {
        paperId: 'paper-3',
        anchorId: 'paper:paper-3',
        route: '/node/node-3?anchor=paper%3Apaper-3',
        title: 'UniAD',
        titleEn: 'UniAD',
        summary: 'Unified system architecture.',
        explanation: 'Integrates perception, prediction, and planning.',
        aliases: ['UniAD'],
        stageIndex: 3,
        stageTitle: 'Unified architectures',
        nodeId: 'node-3',
        nodeTitle: 'Unified architectures break through',
        nodeSummary: 'Mainline core node',
      },
    ],
  }

  const response = __testing.buildDirectTopicChatResponse(
    'What role does YC-Bench play in this topic?',
    catalog,
  )

  assert.equal(Boolean(response), true)
  assert.match(response?.answer ?? '', /YC-Bench/u)
  assert.equal(response?.citations.length ?? 0, 0)
})
