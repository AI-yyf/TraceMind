import { describe, expect, it } from 'vitest'

import {
  makeNodeViewModel,
  makePaperViewModel,
  makeTopicResearchExportBatch,
  makeTopicResearchExportBundle,
  makeTopicResearchSessionState,
} from '@/test/topicResearchBrief'

import {
  assertBackendTopicCollectionContract,
  assertEvidencePayloadContract,
  assertExternalAgentJobPackageContract,
  assertGenerationRuntimeConfigContract,
  assertHealthStatusContract,
  assertModelCapabilitySummaryContract,
  assertModelConfigResponseContract,
  assertModelConfigSaveResponseContract,
  assertModelPresetContract,
  assertNodeViewModelContract,
  assertPaperViewModelContract,
  assertPromptStudioBundleContract,
  assertProviderCatalogContract,
  assertSearchResponseContract,
  assertSanitizedUserModelConfigContract,
  assertTaskCronPresetsContract,
  assertTaskDetailResponseContract,
  assertTaskListContract,
  assertTaskMutationAckContract,
  assertTaskTopicsContract,
  assertTopicNodePickerCollectionContract,
  assertTopicResearchExportBatchContract,
  assertTopicResearchExportBundleContract,
  assertTopicResearchSessionContract,
  assertTopicViewModelContract,
} from './contracts'

const promptLanguageCodes = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru'] as const

function makeGenerationRuntimeConfig() {
  return {
    defaultLanguage: 'zh',
    cacheGeneratedOutputs: true,
    contextAwareCacheReuse: true,
    staleContextRefinePasses: 1,
    useTopicMemory: true,
    usePreviousPassOutputs: true,
    preferMultimodalEvidence: true,
    maxRetriesPerPass: 2,
    topicPreviewPasses: 1,
    topicBlueprintPasses: 1,
    topicLocalizationPasses: 1,
    topicChatPasses: 1,
    stageNamingPasses: 1,
    nodeArticlePasses: 1,
    paperArticlePasses: 1,
    selfRefinePasses: 1,
    researchOrchestrationPasses: 1,
    researchReportPasses: 1,
    researchCycleDelayMs: 1000,
    researchStageStallLimit: 2,
    researchStagePaperLimit: 10,
    researchArtifactRebuildLimit: 3,
    nodeCardFigureCandidateLimit: 4,
    topicSessionMemoryEnabled: true,
    topicSessionMemoryInitEventCount: 10,
    topicSessionMemoryChatTurnsBetweenCompaction: 4,
    topicSessionMemoryResearchCyclesBetweenCompaction: 2,
    topicSessionMemoryTokenThreshold: 4000,
    topicSessionMemoryRecentEventLimit: 12,
    topicSessionMemoryRecallEnabled: true,
    topicSessionMemoryRecallLimit: 8,
    topicSessionMemoryRecallLookbackLimit: 24,
    topicSessionMemoryRecallRecencyBias: 0.5,
    languageTemperature: 0.4,
    multimodalTemperature: 0.2,
    maxEvidencePerArticle: 6,
    contextWindowStages: 3,
    contextWindowNodes: 6,
    editorialPolicies: Object.fromEntries(
      promptLanguageCodes.map((language) => [
        language,
        {
          identity: `${language} identity`,
          mission: `${language} mission`,
          reasoning: `${language} reasoning`,
          style: `${language} style`,
          evidence: `${language} evidence`,
          industryLens: `${language} industry lens`,
          continuity: `${language} continuity`,
          refinement: `${language} refinement`,
        },
      ]),
    ),
  }
}

function makePromptStudioBundle() {
  return {
    languages: promptLanguageCodes.map((code, index) => ({
      code,
      label: code.toUpperCase(),
      nativeName: `${code}-native`,
      isDefault: index === 0,
    })),
    templates: [
      {
        id: 'topic-blueprint',
        family: 'topic',
        title: 'Topic Blueprint',
        description: 'Blueprint prompt',
        slot: 'language',
        order: 1,
        tags: ['core'],
        builtIn: true,
        languageContents: Object.fromEntries(
          promptLanguageCodes.map((language) => [
            language,
            {
              system: `${language} system`,
              user: `${language} user`,
              notes: `${language} notes`,
            },
          ]),
        ),
      },
    ],
    productCopies: [
      {
        id: 'studio.tabModels',
        section: 'studio',
        title: 'Models tab',
        description: 'Models copy',
        order: 1,
        multiline: false,
        builtIn: true,
        languageContents: Object.fromEntries(
          promptLanguageCodes.map((language) => [language, `${language} copy`]),
        ),
      },
    ],
    runtime: makeGenerationRuntimeConfig(),
    runtimeMeta: {
      key: 'prompt-studio-runtime',
      revision: 3,
      hash: 'abc123def456',
      updatedAt: '2026-04-16T00:00:00.000Z',
      source: 'system',
      actor: 'system',
      sizeBytes: 2048,
      topLevelKeys: ['defaultLanguage', 'editorialPolicies'],
      legacy: false,
    },
    runtimeHistory: [
      {
        key: 'prompt-studio-runtime',
        revision: 3,
        hash: 'abc123def456',
        updatedAt: '2026-04-16T00:00:00.000Z',
        source: 'system',
        actor: 'system',
        sizeBytes: 2048,
        topLevelKeys: ['defaultLanguage', 'editorialPolicies'],
        legacy: false,
        previousHash: 'prev123hash',
        warnings: [],
      },
    ],
    externalAgents: {
      rootDir: 'external-agents',
      readmePath: 'external-agents/README.md',
      promptGuidePath: 'external-agents/prompt-guide.md',
      superPromptPath: 'external-agents/super-prompt.md',
      configExamplePath: 'external-agents/config.example.json',
      assets: [
        {
          id: 'readme',
          title: 'README',
          description: 'Getting started guide',
          path: 'external-agents/README.md',
          format: 'markdown',
          builtIn: true,
          content: '# External agents',
        },
      ],
    },
  }
}

describe('topic research session contract', () => {
  it('accepts a populated research session payload', () => {
    expect(() =>
      assertTopicResearchSessionContract(makeTopicResearchSessionState(), 'topic-1'),
    ).not.toThrow()
  })

  it('rejects session progress topic drift', () => {
    const payload = makeTopicResearchSessionState((session) => {
      if (session.progress) {
        session.progress.topicId = 'topic-2'
      }
    })

    expect(() => assertTopicResearchSessionContract(payload, 'topic-1')).toThrow(
      /drifted to topicId "topic-2" instead of "topic-1"/i,
    )
  })
})

describe('evidence payload contract', () => {
  it('accepts a grounded evidence payload', () => {
    expect(() =>
      assertEvidencePayloadContract({
        anchorId: 'figure:paper-1-fig-1',
        type: 'figure',
        route: '/node/node-1?evidence=figure%3Apaper-1-fig-1',
        title: 'Figure 1',
        label: 'Paper one / Figure 1',
        quote: 'Important comparison chart',
        content: 'Important comparison chart with explanation.',
        whyItMatters: 'This is one of the main visual supports for the current claim.',
        placementHint: 'inline-figure',
        importance: 0.91,
        thumbnailPath: '/assets/figure-1.png',
        metadata: {
          topicId: 'topic-1',
          paperId: 'paper-1',
        },
      }),
    ).not.toThrow()
  })

  it('rejects anchor ids that drift away from the declared evidence type', () => {
    expect(() =>
      assertEvidencePayloadContract({
        anchorId: 'table:paper-1-tab-1',
        type: 'figure',
        route: '/node/node-1?evidence=table%3Apaper-1-tab-1',
        title: 'Figure 1',
        label: 'Paper one / Figure 1',
        quote: '',
        content: '',
      }),
    ).toThrow(/does not match type "figure"/i)
  })
})

describe('node and paper boundary contracts', () => {
  it('accepts canonical origin node payloads with stageIndex 0', () => {
    const payload = makeNodeViewModel()
    payload.stageIndex = 0

    expect(() => assertNodeViewModelContract(payload)).not.toThrow()
  })

  it('accepts paper related nodes that point back to stage-0 origins', () => {
    const payload = makePaperViewModel()
    payload.relatedNodes[0]!.stageIndex = 0

    expect(() => assertPaperViewModelContract(payload)).not.toThrow()
  })
})

describe('search contracts', () => {
  it('backfills legacy related node stage indexes instead of rejecting grouped search results', () => {
    const payload = {
      query: 'learning',
      scope: 'topic',
      totals: {
        all: 1,
        topic: 0,
        node: 1,
        paper: 0,
        evidence: 0,
      },
      groups: [
        {
          group: 'node',
          label: 'Nodes',
          items: [
            {
              id: 'node-1',
              kind: 'node',
              title: 'Learning by Cheating',
              subtitle: '',
              excerpt: 'A node-level search result.',
              route: '/node/node-1',
              tags: [],
              matchedFields: ['title'],
              relatedNodes: [
                {
                  nodeId: 'node-1',
                  title: 'Learning by Cheating',
                  route: '/node/node-1',
                },
              ],
            },
          ],
        },
      ],
      facets: {
        stages: [],
        topics: [],
      },
    }

    expect(() => assertSearchResponseContract(payload, 'topic')).not.toThrow()
    const relatedNode = payload.groups[0]?.items[0]?.relatedNodes?.[0] as
      | { stageIndex?: number }
      | undefined
    expect(relatedNode?.stageIndex).toBe(0)
  })
})

describe('backend topic collection contract', () => {
  it('accepts a backend topic list payload', () => {
    expect(() =>
      assertBackendTopicCollectionContract([
        {
          id: 'topic-1',
          nameZh: '主题一',
          nameEn: 'Topic One',
          focusLabel: 'Focus',
          summary: 'Summary',
          createdAt: '2026-04-15T00:00:00.000Z',
          localization: {
            title: 'Topic One',
          },
        },
      ]),
    ).not.toThrow()
  })

  it('rejects malformed topic list entries', () => {
    expect(() =>
      assertBackendTopicCollectionContract([
        {
          id: 'topic-1',
        },
      ]),
    ).toThrow(/missing "nameZh"/i)
  })

})

describe('model config boundary contracts', () => {
  it('accepts a sanitized user model config payload', () => {
    expect(() =>
      assertSanitizedUserModelConfigContract({
        language: {
          provider: 'openai',
          model: 'gpt-5.4',
          apiKeyStatus: 'configured',
        },
        multimodal: null,
        taskOverrides: {
          topic_summary: { provider: 'openai', model: 'gpt-5.4' },
        },
      }),
    ).not.toThrow()
  })

  it('accepts model config response, capability summary, catalog, presets, and save response payloads', () => {
    const catalog = [
      {
        provider: 'openai',
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        adapter: 'openai-compatible',
        providerAuthEnvVars: ['OPENAI_API_KEY'],
        models: [
          {
            id: 'gpt-5.4',
            label: 'GPT-5.4',
            slot: 'language',
            capabilities: {
              text: true,
              image: false,
              pdf: false,
              chart: false,
              formula: false,
              citationsNative: false,
              fileParserNative: false,
              toolCalling: true,
              jsonMode: true,
              streaming: true,
            },
          },
        ],
      },
    ]

    const presets = [
      {
        id: 'default',
        label: 'Default',
        description: 'Recommended pairing',
        language: { provider: 'openai', model: 'gpt-5.4' },
        multimodal: { provider: 'anthropic', model: 'claude-sonnet-4-0' },
      },
    ]

    const capabilitySummary = {
      userId: 'default',
      slots: {
        language: {
          configured: true,
          provider: 'openai',
          model: 'gpt-5.4',
          capability: catalog[0]!.models[0]!.capabilities,
          apiKeyStatus: 'configured',
        },
        multimodal: {
          configured: false,
          provider: null,
          model: null,
          capability: null,
          apiKeyStatus: 'missing',
        },
      },
      roleDefinitions: [
        {
          id: 'topic_architect',
          label: 'Topic Architect',
          description: 'Plans topic generation',
          preferredSlot: 'language',
          defaultTasks: ['topic_summary'],
        },
      ],
      routing: {
        topic_summary: {
          target: 'language',
          defaultTarget: 'language',
        },
      },
    }

    expect(() => assertProviderCatalogContract(catalog)).not.toThrow()
    expect(() => assertModelPresetContract(presets)).not.toThrow()
    expect(() => assertModelCapabilitySummaryContract(capabilitySummary)).not.toThrow()
    expect(() =>
      assertModelConfigResponseContract({
        userId: 'default',
        config: {
          language: {
            provider: 'openai',
            model: 'gpt-5.4',
            apiKeyStatus: 'configured',
          },
          multimodal: null,
        },
        catalog,
        presets,
        roleDefinitions: capabilitySummary.roleDefinitions,
        routing: capabilitySummary.routing,
      }),
    ).not.toThrow()
    expect(() =>
      assertModelConfigSaveResponseContract({
        userId: 'default',
        config: {
          language: {
            provider: 'openai',
            model: 'gpt-5.4',
            apiKeyStatus: 'configured',
          },
          multimodal: null,
        },
        slots: capabilitySummary.slots,
        routing: capabilitySummary.routing,
        validationIssues: [
          {
            code: 'missing_key',
            title: 'Missing key',
            message: 'API key required',
            slot: 'multimodal',
          },
        ],
      }),
    ).not.toThrow()
  })
})

describe('task boundary contracts', () => {
  it('accepts task list, task topics, task cron presets, and task detail payloads', () => {
    const task = {
      id: 'task-1',
      name: 'Daily discovery',
      cronExpression: '0 8 * * *',
      enabled: true,
      topicId: 'topic-1',
      action: 'discover',
      researchMode: 'duration',
      options: {
        durationHours: 8,
        cycleDelayMs: 2000,
      },
      progress: {
        taskId: 'task-1',
        topicId: 'topic-1',
        topicName: 'Topic One',
        researchMode: 'duration',
        durationHours: 8,
        currentStage: 1,
        totalStages: 5,
        stageProgress: 40,
        currentStageRuns: 2,
        currentStageTargetRuns: 5,
        stageRunMap: { '1': 2 },
        totalRuns: 2,
        successfulRuns: 2,
        failedRuns: 0,
        lastRunAt: '2026-04-15T00:00:00.000Z',
        lastRunResult: 'success',
        discoveredPapers: 12,
        admittedPapers: 3,
        generatedContents: 1,
        figureCount: 4,
        tableCount: 2,
        formulaCount: 1,
        figureGroupCount: 1,
        startedAt: '2026-04-15T00:00:00.000Z',
        deadlineAt: '2026-04-15T08:00:00.000Z',
        completedAt: null,
        activeSessionId: null,
        completedStageCycles: 0,
        currentStageStalls: 0,
        latestSummary: 'Stable progress',
        status: 'active',
      },
    }

    expect(() => assertTaskListContract([task])).not.toThrow()
    expect(() =>
      assertTaskTopicsContract([
        {
          id: 'topic-1',
          nameZh: '主题一',
        },
      ]),
    ).not.toThrow()
    expect(() =>
      assertTaskCronPresetsContract([
        { label: 'Daily', value: '0 8 * * *', description: 'Run every morning' },
      ]),
    ).not.toThrow()
    expect(() =>
      assertTaskDetailResponseContract({
        task,
        progress: task.progress,
        history: [
          {
            id: 'hist-1',
            taskId: 'task-1',
            runAt: '2026-04-15T00:00:00.000Z',
            duration: 45000,
            status: 'success',
            stageIndex: 1,
            papersDiscovered: 4,
            papersAdmitted: 1,
            contentsGenerated: 1,
            summary: 'Completed successfully',
          },
        ],
      }),
    ).not.toThrow()
  })

  it('rejects malformed task payloads', () => {
    expect(() =>
      assertTaskListContract([
        {
          id: 'task-1',
          name: 'Broken task',
        },
      ]),
    ).toThrow(/cronExpression/i)
  })

  it('accepts task mutation acknowledgements and rejects malformed ones', () => {
    expect(() => assertTaskMutationAckContract({ success: true })).not.toThrow()
    expect(() => assertTaskMutationAckContract({ success: 'yes' })).toThrow(/success/i)
  })
})

describe('system init boundary contracts', () => {
  it('accepts health payloads', () => {
    expect(() => assertHealthStatusContract({ status: 'ok' })).not.toThrow()
  })

  it('rejects invalid health payloads', () => {
    expect(() => assertHealthStatusContract({ status: 'healthy' })).toThrow(/unsupported/i)
  })
})

describe('prompt studio boundary contracts', () => {
  it('accepts generation runtime config payloads', () => {
    expect(() => assertGenerationRuntimeConfigContract(makeGenerationRuntimeConfig())).not.toThrow()
  })

  it('accepts prompt studio bundle payloads with runtime history and external assets', () => {
    expect(() => assertPromptStudioBundleContract(makePromptStudioBundle())).not.toThrow()
  })

  it('accepts external agent job package payloads', () => {
    expect(() =>
      assertExternalAgentJobPackageContract({
        schemaVersion: 'external-agent-job-v2',
        jobId: 'job-1',
        generatedAt: '2026-04-16T00:00:00.000Z',
        language: 'zh',
        template: {
          id: 'topic-blueprint',
          family: 'topic',
          slot: 'language',
          title: 'Topic Blueprint',
          description: 'Blueprint prompt',
          system: 'system prompt',
          user: 'user prompt',
          notes: 'notes',
          tags: ['core'],
        },
        runtime: makeGenerationRuntimeConfig(),
        editorialPolicy: {
          identity: 'identity',
          mission: 'mission',
          reasoning: 'reasoning',
          style: 'style',
          evidence: 'evidence',
          industryLens: 'industry lens',
          continuity: 'continuity',
          refinement: 'refinement',
        },
        modelTarget: {
          slot: 'language',
          configured: true,
          provider: 'openai',
          model: 'gpt-5.4',
          baseUrl: 'https://api.openai.com/v1',
          apiKeyStatus: 'configured',
        },
        subject: {
          type: 'topic',
          id: 'topic-1',
          topicId: 'topic-1',
          title: 'Topic One',
          route: '/topic/topic-1',
          summary: 'Topic summary',
          snapshot: {
            topicId: 'topic-1',
          },
        },
        scaffold: {
          rootDir: 'external-agents',
          readmePath: 'external-agents/README.md',
          promptGuidePath: 'external-agents/prompt-guide.md',
          superPromptPath: 'external-agents/super-prompt.md',
          configExamplePath: 'external-agents/config.example.json',
          assets: makePromptStudioBundle().externalAgents.assets,
          supportedAgents: ['cursor', 'claude-code'],
          workflow: ['read README', 'load prompt', 'execute task'],
        },
        savedPath: 'external-agents/jobs/job-1.json',
      })).not.toThrow()
  })

  it('rejects prompt studio bundles missing required runtime metadata fields when runtimeMeta is present', () => {
    const validPayload = makePromptStudioBundle()
    const payload: unknown = {
      ...validPayload,
      runtimeMeta: {
        key: validPayload.runtimeMeta.key,
        revision: validPayload.runtimeMeta.revision,
        hash: validPayload.runtimeMeta.hash,
        source: validPayload.runtimeMeta.source,
        actor: validPayload.runtimeMeta.actor,
        sizeBytes: validPayload.runtimeMeta.sizeBytes,
        topLevelKeys: validPayload.runtimeMeta.topLevelKeys,
        legacy: validPayload.runtimeMeta.legacy,
      },
    }

    expect(() => assertPromptStudioBundleContract(payload)).toThrow(/updatedAt/i)
  })

  it('accepts a complete topic node picker collection payload', () => {
    expect(() =>
      assertTopicNodePickerCollectionContract([
        {
          id: 'node-1',
          stageIndex: 1,
          nodeLabel: 'World model scaling',
          nodeSubtitle: 'Compare latent dynamics and planning',
        },
      ]),
    ).not.toThrow()
  })

  it('rejects malformed topic node picker collection payloads', () => {
    expect(() =>
      assertTopicNodePickerCollectionContract([
        {
          id: 'node-1',
          stageIndex: 0,
          nodeLabel: '',
        },
      ]),
    ).toThrow(/stageIndex|nodeLabel/i)
  })
})

describe('topic research export contracts', () => {
  it('accepts a complete export bundle payload', () => {
    expect(() =>
      assertTopicResearchExportBundleContract(makeTopicResearchExportBundle()),
    ).not.toThrow()
  })

  it('rejects stage dossiers that drift away from the topic node list', () => {
    const payload = makeTopicResearchExportBundle((bundle) => {
      bundle.stageDossiers[0]!.nodeIds[0] = 'node-missing'
    })

    expect(() => assertTopicResearchExportBundleContract(payload)).toThrow(
      /references missing topic node "node-missing"/i,
    )
  })

  it('rejects retired paper dossier fields on export bundles', () => {
    const payload = makeTopicResearchExportBundle() as typeof makeTopicResearchExportBundle extends (...args: any[]) => infer T
      ? T & { paperDossiers: unknown[] }
      : never
    payload.paperDossiers = []

    expect(() => assertTopicResearchExportBundleContract(payload)).toThrow(/paperDossiers/i)
  })

  it('rejects retired paper rollup fields on stage dossiers', () => {
    const payload = makeTopicResearchExportBundle()
    Object.assign(payload.stageDossiers[0]!, {
      paperCount: 1,
      paperIds: ['paper-1'],
    })

    expect(() => assertTopicResearchExportBundleContract(payload)).toThrow(/paperCount|paperIds/i)
  })

  it('accepts a complete export batch payload', () => {
    expect(() =>
      assertTopicResearchExportBatchContract(makeTopicResearchExportBatch()),
    ).not.toThrow()
  })

  it('rejects export batches whose topicCount drifts from bundle count', () => {
    const payload = makeTopicResearchExportBatch((batch) => {
      batch.topicCount = 2
    })

    expect(() => assertTopicResearchExportBatchContract(payload)).toThrow(
      /topicCount does not match the number of bundles/i,
    )
  })

  it('rejects topic view models that advertise unsupported sub-month stage bounds', () => {
    const payload = makeTopicResearchExportBundle()
    payload.topic.stageConfig.minWindowMonths = 0.25

    expect(() => assertTopicViewModelContract(payload.topic)).toThrow(/minWindowMonths/i)
  })
})
