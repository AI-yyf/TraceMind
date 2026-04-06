import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGenerationFingerprint } from '../services/generation/memory-store'
import { __testing as orchestratorTesting } from '../services/generation/orchestrator'

function createContextPass(overrides: Record<string, unknown> = {}): any {
  return {
    passId: 'pass-1',
    templateId: 'article.node',
    subjectType: 'node',
    subjectId: 'node-1',
    summary: 'Node one established the main line.',
    updatedAt: '2026-04-03T00:00:00.000Z',
    output: {
      headline: 'Node one established the main line.',
    },
    ...overrides,
  }
}

function createJudgment(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'judgment-1',
    kind: 'finding',
    confidence: 'high',
    content: 'The main line is now anchored in world-model planning.',
    subjectType: 'node',
    scopeId: 'node-1',
    sourceTemplateId: 'article.node',
    updatedAt: '2026-04-03T00:00:00.000Z',
    ...overrides,
  }
}

function createArtifact(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'node:node-1',
    kind: 'node',
    entityId: 'node-1',
    stageIndex: 2,
    title: 'Planning Fidelity Node',
    headline: 'Planning fidelity became the real center of gravity.',
    summary: 'This node article now frames the topic around robust planning evidence.',
    standfirst: 'The node article rewrote the local thesis around planning fidelity.',
    keyArguments: ['Planning fidelity is better grounded than broad autonomy claims.'],
    updatedAt: '2026-04-03T00:00:00.000Z',
    ...overrides,
  }
}

test('buildContinuityFingerprint only reacts to local continuity state', () => {
  const baseTopicMemory = {
    topicSnapshot: null,
    recentPasses: [createContextPass({ passId: 'recent-1', subjectId: 'node-2' })],
    sameSubjectPasses: [createContextPass()],
    anchorPasses: [createContextPass({ passId: 'anchor-1', subjectType: 'topic', subjectId: 'topic-1' })],
    artifactIndex: [createArtifact()],
    judgmentLedger: [],
    openQuestions: [],
    reviewerWatchpoints: [],
    evidenceWatchpoints: [],
    continuityThreads: [],
    evolutionChains: [],
    researchJudgments: [createJudgment({ id: 'judgment-ambient', scopeId: 'node-2' })],
    sameScopeJudgments: [createJudgment()],
  }

  const recentChanged = {
    ...baseTopicMemory,
    recentPasses: [createContextPass({ passId: 'recent-2', subjectId: 'node-3' })],
    anchorPasses: [createContextPass({ passId: 'anchor-2', subjectType: 'stage', subjectId: 'research-stage:2:round:1' })],
    researchJudgments: [createJudgment({ id: 'judgment-ambient-2', scopeId: 'node-4' })],
  }

  const sameSubjectChanged = {
    ...baseTopicMemory,
    sameSubjectPasses: [
      createContextPass(),
      createContextPass({
        passId: 'pass-2',
        summary: 'Node one now folds in reviewer corrections.',
        updatedAt: '2026-04-03T00:10:00.000Z',
      }),
    ],
  }

  const artifactChanged = {
    ...baseTopicMemory,
    artifactIndex: [
      createArtifact({
        updatedAt: '2026-04-03T00:10:00.000Z',
        headline: 'Planning fidelity now absorbs reviewer corrections.',
      }),
    ],
  }

  const baseFingerprint = orchestratorTesting.buildContinuityFingerprint('node', baseTopicMemory)
  const ambientFingerprint = orchestratorTesting.buildContinuityFingerprint('node', recentChanged)
  const localFingerprint = orchestratorTesting.buildContinuityFingerprint('node', sameSubjectChanged)
  const artifactFingerprint = orchestratorTesting.buildContinuityFingerprint('node', artifactChanged)

  assert.equal(baseFingerprint, ambientFingerprint)
  assert.notEqual(baseFingerprint, localFingerprint)
  assert.notEqual(baseFingerprint, artifactFingerprint)
})

test('split generation fingerprints keep stable input identity while context changes', () => {
  const baseOptions = {
    request: {
      templateId: 'article.node',
      input: {
        nodeId: 'node-1',
        title: 'Planning fidelity',
      },
    },
    language: 'zh',
    templateContent: {
      system: 'system',
      user: 'user',
    },
    editorialPolicy: {
      identity: 'Research editor',
      mission: 'Stay grounded.',
      reasoning: 'Prefer stepwise judgment.',
      style: 'Concise.',
      evidence: 'Only claim what is supported.',
      industryLens: 'Focus on deployment.',
      continuity: 'Respect prior work.',
      refinement: 'Tighten overclaims.',
    },
    runtime: {
      defaultLanguage: 'zh',
      cacheGeneratedOutputs: true,
      useTopicMemory: true,
      usePreviousPassOutputs: true,
      preferMultimodalEvidence: true,
      maxRetriesPerPass: 2,
      topicPreviewPasses: 2,
      topicBlueprintPasses: 2,
      topicLocalizationPasses: 1,
      topicChatPasses: 2,
      stageNamingPasses: 2,
      nodeArticlePasses: 3,
      paperArticlePasses: 2,
      selfRefinePasses: 1,
      researchOrchestrationPasses: 2,
      researchReportPasses: 2,
      researchCycleDelayMs: 1000,
      researchStageStallLimit: 2,
      researchStagePaperLimit: 6,
      researchArtifactRebuildLimit: 8,
      nodeCardFigureCandidateLimit: 8,
      topicSessionMemoryEnabled: true,
      topicSessionMemoryInitEventCount: 3,
      topicSessionMemoryChatTurnsBetweenCompaction: 4,
      topicSessionMemoryResearchCyclesBetweenCompaction: 2,
      topicSessionMemoryTokenThreshold: 2600,
      topicSessionMemoryRecentEventLimit: 20,
      topicSessionMemoryRecallEnabled: true,
      topicSessionMemoryRecallLimit: 4,
      topicSessionMemoryRecallLookbackLimit: 18,
      topicSessionMemoryRecallRecencyBias: 0.35,
      languageTemperature: 0.18,
      multimodalTemperature: 0.12,
      maxEvidencePerArticle: 10,
      contextWindowStages: 6,
      contextWindowNodes: 16,
      editorialPolicies: {},
    },
    modelConfigFingerprint: 'model-fingerprint-1',
  } as any

  const inputFingerprintA = buildGenerationFingerprint(
    orchestratorTesting.buildInputFingerprintPayload(baseOptions),
  )
  const inputFingerprintB = buildGenerationFingerprint(
    orchestratorTesting.buildInputFingerprintPayload({
      ...baseOptions,
      request: {
        ...baseOptions.request,
        memoryContext: {
          reviewer: 'changed',
        },
      },
    }),
  )
  const contextFingerprintA = buildGenerationFingerprint(
    orchestratorTesting.buildContextFingerprintPayload({
      memoryContext: {
        reviewer: 'baseline',
      },
      continuityFingerprint: 'continuity-a',
    }),
  )
  const contextFingerprintB = buildGenerationFingerprint(
    orchestratorTesting.buildContextFingerprintPayload({
      memoryContext: {
        reviewer: 'changed',
      },
      continuityFingerprint: 'continuity-b',
    }),
  )

  assert.equal(inputFingerprintA, inputFingerprintB)
  assert.notEqual(contextFingerprintA, contextFingerprintB)
})

test('resolveGenerationCacheMatch distinguishes exact hits from stale-context reuse', () => {
  const cachedRecord = {
    passId: 'article.node:node:node-1:zh',
    templateId: 'article.node',
    language: 'zh',
    subjectType: 'node',
    subjectId: 'node-1',
    fingerprint: 'stable-a',
    inputFingerprint: 'input-a',
    contextFingerprint: 'context-a',
    continuityFingerprint: 'continuity-a',
    slot: 'language',
    status: 'ready',
    usedCache: false,
    attemptCount: 1,
    output: {
      headline: 'Planning fidelity became the center of gravity.',
    },
    updatedAt: '2026-04-03T00:00:00.000Z',
  } as any

  assert.equal(
    orchestratorTesting.resolveGenerationCacheMatch({
      cached: cachedRecord,
      cacheGeneratedOutputs: true,
      force: false,
      fingerprint: 'stable-a',
      inputFingerprint: 'input-a',
      contextFingerprint: 'context-a',
      continuityFingerprint: 'continuity-a',
    }),
    'exact',
  )

  assert.equal(
    orchestratorTesting.resolveGenerationCacheMatch({
      cached: cachedRecord,
      cacheGeneratedOutputs: true,
      force: false,
      fingerprint: 'stable-b',
      inputFingerprint: 'input-a',
      contextFingerprint: 'context-b',
      continuityFingerprint: 'continuity-b',
    }),
    'stale-context',
  )

  assert.equal(
    orchestratorTesting.resolveGenerationCacheMatch({
      cached: cachedRecord,
      cacheGeneratedOutputs: true,
      force: false,
      fingerprint: 'stable-c',
      inputFingerprint: 'input-c',
      contextFingerprint: 'context-c',
      continuityFingerprint: 'continuity-c',
    }),
    'miss',
  )
})

test('buildRefinementPromptPayload includes concrete refinement targets from topic memory', () => {
  const payload = orchestratorTesting.buildRefinementPromptPayload({
    templateUserPrompt: 'Write the next node synthesis.',
    outputContract: '{"headline":"","summary":""}',
    editorialPolicy: {
      identity: 'Research editor',
      mission: 'Stay grounded.',
      reasoning: 'Prefer stepwise judgment.',
      style: 'Concise.',
      evidence: 'Only claim what is supported.',
      industryLens: 'Focus on deployment.',
      continuity: 'Respect prior work.',
      refinement: 'Tighten overclaims.',
    },
    input: {
      nodeId: 'node-1',
    },
    topicMemory: {
      topicSnapshot: null,
      recentPasses: [],
      sameSubjectPasses: [createContextPass()],
      anchorPasses: [],
      artifactIndex: [createArtifact()],
      judgmentLedger: [],
      openQuestions: ['Which benchmark still breaks the planning stack?'],
      reviewerWatchpoints: ['Separate planning evidence from autonomy claims.'],
      evidenceWatchpoints: [],
      continuityThreads: ['Planning fidelity remains the local anchor.'],
      evolutionChains: ['Refined: "broad autonomy" -> "planning fidelity"'],
      researchJudgments: [],
      sameScopeJudgments: [createJudgment()],
    },
    previousDraft: {
      headline: 'Old draft',
    },
    round: 1,
  })

  assert.match(payload, /reviewerWatchpoints/i)
  assert.match(payload, /Separate planning evidence from autonomy claims\./)
  assert.match(payload, /Which benchmark still breaks the planning stack\?/)
  assert.match(payload, /Planning fidelity became the real center of gravity\./)
})

test('scoreOutputQuality prefers richer outputs that stay closer to local research memory', () => {
  const topicMemory = {
    topicSnapshot: null,
    recentPasses: [],
    sameSubjectPasses: [createContextPass()],
    anchorPasses: [],
    artifactIndex: [createArtifact()],
    judgmentLedger: [],
    openQuestions: ['Which benchmark still breaks the planning stack?'],
    reviewerWatchpoints: ['Separate planning evidence from autonomy claims.'],
    evidenceWatchpoints: [],
    continuityThreads: ['Planning fidelity remains the local anchor.'],
    evolutionChains: ['Refined: "broad autonomy" -> "planning fidelity"'],
    researchJudgments: [],
    sameScopeJudgments: [createJudgment()],
  }

  const weakScore = orchestratorTesting.scoreOutputQuality(
    {
      headline: 'Autonomy matters.',
      summary: 'The system looks promising.',
    },
    topicMemory,
    '{"headline":"","summary":"","whyItMatters":"","bullets":[]}',
  )

  const strongScore = orchestratorTesting.scoreOutputQuality(
    {
      headline: 'Planning fidelity became the real center of gravity.',
      summary: 'Planning fidelity remains the local anchor and separates grounded evidence from broad autonomy claims.',
      whyItMatters: 'This keeps the node aligned with supported judgments and reviewer corrections.',
      bullets: [
        'Separate planning evidence from autonomy claims.',
        'Which benchmark still breaks the planning stack?',
      ],
    },
    topicMemory,
    '{"headline":"","summary":"","whyItMatters":"","bullets":[]}',
  )

  assert.ok(strongScore > weakScore)
})
