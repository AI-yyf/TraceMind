import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertBackendTopicCollectionContract,
  assertEvidencePayloadContract,
  assertNodeViewModelContract,
  assertPaperViewModelContract,
  assertTopicResearchExportBatchContract,
  assertTopicResearchExportBundleContract,
  assertTopicResearchSessionContract,
  assertTopicResearchBriefContract,
  assertTopicChatResponseContract,
  assertTopicViewModelContract,
} from '../services/topics/topic-contracts'

function makeTopicNodeCard() {
  return {
    nodeId: 'node-1',
    anchorId: 'node:node-1',
    route: '/node/node-1',
    title: 'Node title',
    titleEn: 'Node title',
    subtitle: 'Node subtitle',
    summary: 'Node summary',
    explanation: 'Node explanation',
    paperCount: 2,
    figureCount: 1,
    tableCount: 0,
    formulaCount: 0,
    evidenceCount: 1,
    paperIds: ['paper-1', 'paper-2'],
    primaryPaperTitle: 'Paper title',
    primaryPaperId: 'paper-1',
    coverImage: null,
    isMergeNode: false,
    provisional: false,
    updatedAt: '2026-04-15T00:00:00.000Z',
    branchLabel: 'Mainline',
    branchColor: '#7d1938',
    editorial: {
      eyebrow: 'Node',
      digest: 'Digest',
      whyNow: 'Why now',
      nextQuestion: 'Next question',
    },
  }
}

function makeBackendTopicListItem() {
  return {
    id: 'topic-1',
    nameZh: '主题一',
    nameEn: 'Topic One',
    focusLabel: 'Focus',
    summary: 'Summary',
    createdAt: '2026-04-15T00:00:00.000Z',
    localization: {
      title: 'Topic One',
    },
  }
}

function makeTopicViewModel() {
  const nodeCard = makeTopicNodeCard()
  return {
    schemaVersion: 'topic-workbench-v11',
    topicId: 'topic-1',
    title: 'Topic title',
    titleEn: 'Topic title',
    subtitle: 'Topic subtitle',
    focusLabel: 'Topic focus',
    summary: 'Topic summary',
    description: 'Topic description',
    language: 'zh',
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    generatedAt: '2026-04-15T00:00:00.000Z',
    hero: {
      kicker: 'Topic',
      title: 'Topic title',
      standfirst: 'Standfirst',
      strapline: 'Strapline',
    },
    stageConfig: {
      windowMonths: 3,
      defaultWindowMonths: 1,
      minWindowMonths: 1,
      maxWindowMonths: 24,
      adjustable: true,
    },
    summaryPanel: {
      thesis: 'Thesis',
      metaRows: [],
      stats: [],
      actions: [],
    },
    stats: {
      stageCount: 1,
      nodeCount: 1,
      paperCount: 2,
      mappedPaperCount: 2,
      unmappedPaperCount: 0,
      evidenceCount: 1,
    },
    timeline: {
      stages: [
        {
          stageIndex: 1,
          title: '2026.01-2026.03',
          titleEn: '2026.01-2026.03',
          description: 'Stage description',
          branchLabel: 'Mainline',
          branchColor: '#7d1938',
          yearLabel: '2026',
          dateLabel: '2026.01-2026.03',
          timeLabel: '2026.01-2026.03',
          stageThesis: 'Stage thesis',
          editorial: {
            kicker: 'Window',
            summary: 'Summary',
            transition: 'Transition',
          },
        },
      ],
    },
    graph: {
      columnCount: 1,
      lanes: [
        {
          id: 'lane:main',
          laneIndex: 0,
          branchIndex: null,
          isMainline: true,
          side: 'center',
          color: '#7d1938',
          roleLabel: 'Mainline',
          label: 'Mainline',
          labelEn: 'Mainline',
          legendLabel: 'Mainline Mainline',
          legendLabelEn: 'Mainline Mainline',
          description: 'Lane description',
          periodLabel: '2026.01-2026.03',
          nodeCount: 1,
          stageCount: 1,
          latestNodeId: 'node-1',
          latestAnchorId: 'node:node-1',
        },
      ],
      nodes: [
        {
          ...nodeCard,
          stageIndex: 1,
          branchPathId: 'branch:main',
          parentNodeIds: [],
          timeLabel: '2026.01-2026.03',
          layoutHint: {
            column: 1,
            span: 1,
            row: 1,
            emphasis: 'primary',
            laneIndex: 0,
            branchIndex: null,
            isMainline: true,
            side: 'center',
          },
          coverAsset: {
            imagePath: null,
            alt: 'Paper title',
            source: 'generated-brief',
          },
          cardEditorial: nodeCard.editorial,
        },
      ],
    },
    generationState: {
      hero: 'ready',
      stageTimeline: 'ready',
      nodeCards: 'ready',
      closing: 'ready',
    },
    stages: [
      {
        stageIndex: 1,
        title: '2026.01-2026.03',
        titleEn: '2026.01-2026.03',
        description: 'Stage description',
        branchLabel: 'Mainline',
        branchColor: '#7d1938',
        editorial: {
          kicker: 'Window',
          summary: 'Summary',
          transition: 'Transition',
        },
        trackedPaperCount: 2,
        mappedPaperCount: 2,
        unmappedPaperCount: 0,
        nodes: [nodeCard],
      },
    ],
    papers: [
      {
        paperId: 'paper-1',
        anchorId: 'paper:paper-1',
        route: '/node/node-1?anchor=paper%3Apaper-1',
        title: 'Paper title',
        titleEn: 'Paper title',
        summary: 'Paper summary',
        explanation: 'Paper explanation',
        publishedAt: '2026-02-01T00:00:00.000Z',
        authors: ['Author'],
        citationCount: 3,
        originalUrl: 'https://example.com/paper-1',
        pdfUrl: 'https://example.com/paper-1.pdf',
        coverImage: null,
        figuresCount: 1,
        tablesCount: 0,
        formulasCount: 0,
        sectionsCount: 2,
      },
      {
        paperId: 'paper-2',
        anchorId: 'paper:paper-2',
        route: '/node/node-1?anchor=paper%3Apaper-2',
        title: 'Paper two',
        titleEn: 'Paper two',
        summary: 'Paper two summary',
        explanation: 'Paper two explanation',
        publishedAt: '2026-02-02T00:00:00.000Z',
        authors: ['Author Two'],
        citationCount: 1,
        originalUrl: 'https://example.com/paper-2',
        pdfUrl: 'https://example.com/paper-2.pdf',
        coverImage: null,
        figuresCount: 0,
        tablesCount: 0,
        formulasCount: 0,
        sectionsCount: 1,
      },
    ],
    unmappedPapers: [],
    narrativeArticle: 'Narrative article',
    closingEditorial: {
      title: 'Closing',
      paragraphs: ['Closing paragraph'],
      reviewerNote: 'Reviewer note',
    },
    resources: [],
    chatContext: {
      suggestedQuestions: ['What matters here?'],
    },
  }
}

function makeNodeViewModel() {
  const featuredFigure = {
    anchorId: 'figure:paper-1-fig-1',
    type: 'figure',
    route: '/node/node-1?evidence=figure%3Apaper-1-fig-1',
    title: 'Figure 1',
    label: 'Paper one / Figure 1',
    quote: 'Important chart',
    content: 'Important chart explanation',
    page: 1,
    sourcePaperId: 'paper-1',
    sourcePaperTitle: 'Paper one',
    imagePath: '/uploads/paper-1-fig-1.png',
  } as const
  const supportingSection = {
    anchorId: 'section:paper-2-results',
    type: 'section',
    route: '/node/node-1?evidence=section%3Apaper-2-results',
    title: 'Results',
    label: 'Paper two / Results',
    quote: 'The extension paper validates the broader scope.',
    content: 'The extension paper validates the broader scope.',
    page: 2,
    sourcePaperId: 'paper-2',
    sourcePaperTitle: 'Paper two',
  } as const

  return {
    schemaVersion: 'v1',
    nodeId: 'node-1',
    title: 'Node title',
    titleEn: 'Node title',
    headline: 'Headline',
    subtitle: 'Node subtitle',
    summary: 'Node summary',
    explanation: 'Node explanation',
    stageIndex: 1,
    stageLabel: '2026.04',
    updatedAt: '2026-04-15T00:00:00.000Z',
    isMergeNode: false,
    provisional: false,
    topic: {
      topicId: 'topic-1',
      title: 'Topic title',
      route: '/topic/topic-1',
    },
    stageWindowMonths: 3,
    stats: {
      paperCount: 2,
      figureCount: 1,
      tableCount: 0,
      formulaCount: 0,
    },
    standfirst: 'Standfirst',
    paperRoles: [
      {
        paperId: 'paper-1',
        title: 'Paper one',
        titleEn: 'Paper one',
        route: '/node/node-1?anchor=paper%3Apaper-1',
        summary: 'Summary',
        publishedAt: '2026-04-01T00:00:00.000Z',
        role: 'Origin',
        contribution: 'Contribution',
        figuresCount: 1,
        tablesCount: 0,
        formulasCount: 0,
        coverImage: null,
      },
      {
        paperId: 'paper-2',
        title: 'Paper two',
        titleEn: 'Paper two',
        route: '/node/node-1?anchor=paper%3Apaper-2',
        summary: 'Summary',
        publishedAt: '2026-04-02T00:00:00.000Z',
        role: 'Extension',
        contribution: 'Contribution',
        figuresCount: 0,
        tablesCount: 0,
        formulasCount: 0,
        coverImage: null,
      },
    ],
    comparisonBlocks: [],
    article: {
      periodLabel: '2026.04',
      timeRangeLabel: 'Current',
      flow: [],
      sections: [],
      closing: ['Closing'],
    },
    critique: {
      title: 'Critique',
      summary: 'Summary',
      bullets: ['Bullet'],
    },
    evidence: [
      featuredFigure,
      supportingSection,
    ],
    researchView: {
      evidence: {
        featuredAnchorIds: [featuredFigure.anchorId],
        supportingAnchorIds: [supportingSection.anchorId],
        featured: [featuredFigure],
        supporting: [supportingSection],
        paperBriefs: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            role: 'Origin',
            publishedAt: '2026-04-01T00:00:00.000Z',
            summary: 'Paper one introduces the core comparison.',
            contribution: 'Provides the decisive first figure for the node judgment.',
            evidenceAnchorIds: [featuredFigure.anchorId],
            keyFigureIds: [featuredFigure.anchorId],
            keyTableIds: [],
            keyFormulaIds: [],
          },
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            role: 'Extension',
            publishedAt: '2026-04-02T00:00:00.000Z',
            summary: 'Paper two broadens the same line into a wider setting.',
            contribution: 'Supplies the validating results paragraph for the broader scope.',
            evidenceAnchorIds: [supportingSection.anchorId],
            keyFigureIds: [],
            keyTableIds: [],
            keyFormulaIds: [],
          },
        ],
        evidenceChains: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            subsectionKind: 'result',
            subsectionTitle: 'Main comparison',
            summary: 'The origin paper contributes the most decisive visual comparison.',
            evidenceAnchorIds: [featuredFigure.anchorId],
          },
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            subsectionKind: 'analysis',
            subsectionTitle: 'Scope extension',
            summary: 'The extension paper explains why the mainline can generalize.',
            evidenceAnchorIds: [supportingSection.anchorId],
          },
        ],
        coverage: {
          totalEvidenceCount: 2,
          renderableEvidenceCount: 1,
          figureCount: 1,
          tableCount: 0,
          formulaCount: 0,
          sectionCount: 1,
          featuredCount: 1,
          supportingCount: 1,
        },
      },
      methods: {
        entries: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            title: 'Method',
            summary: 'Method summary',
            keyPoints: ['Point'],
          },
        ],
        evolution: [
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            contribution: 'Contribution',
            fromPaperId: 'paper-1',
            fromPaperTitle: 'Paper one',
            toPaperId: 'paper-2',
            toPaperTitle: 'Paper two',
            transitionType: 'scope-broaden',
            anchorId: supportingSection.anchorId,
            evidenceAnchorIds: [supportingSection.anchorId],
          },
        ],
        dimensions: ['Dimension'],
      },
      problems: {
        items: [
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            title: 'Problem',
            status: 'partial',
          },
        ],
        openQuestions: ['Question'],
      },
      coreJudgment: {
        content: 'Judgment',
        contentEn: 'Judgment',
        confidence: 'medium',
        quickTags: ['Tag'],
      },
    },
    references: [
      {
        paperId: 'paper-1',
        title: 'Paper one',
      },
      {
        paperId: 'paper-2',
        title: 'Paper two',
      },
    ],
  }
}

function makePaperViewModel(mutate?: (paper: ReturnType<typeof makePaperViewModelBase>) => void) {
  const paper = makePaperViewModelBase()
  mutate?.(paper)
  return paper
}

function makePaperViewModelBase() {
  return {
    schemaVersion: 'paper-article-v1',
    paperId: 'paper-1',
    title: 'Paper title',
    titleEn: 'Paper title',
    summary: 'Paper summary',
    explanation: 'Paper explanation',
    publishedAt: '2026-02-01T00:00:00.000Z',
    authors: ['Author'],
    citationCount: 3,
    coverImage: null,
    originalUrl: 'https://example.com/paper-1',
    pdfUrl: 'https://example.com/paper-1.pdf',
    topic: {
      topicId: 'topic-1',
      title: 'Topic title',
      route: '/topic/topic-1',
    },
    stageWindowMonths: 3,
    stats: {
      sectionCount: 1,
      figureCount: 1,
      tableCount: 0,
      formulaCount: 0,
      relatedNodeCount: 1,
    },
    relatedNodes: [
      {
        nodeId: 'node-1',
        title: 'Node title',
        subtitle: 'Node subtitle',
        summary: 'Node summary',
        stageIndex: 1,
        stageLabel: '2026.04',
        route: '/node/node-1',
      },
    ],
    standfirst: 'Standfirst',
    article: {
      periodLabel: '2026.04',
      timeRangeLabel: 'Current',
      flow: [
        {
          id: 'paper-flow-1',
          type: 'text',
          title: 'Flow',
          body: ['Paper body'],
        },
      ],
      sections: [
        {
          id: 'paper-section-1',
          kind: 'lead',
          title: 'Section',
          body: ['Paper content'],
        },
      ],
      closing: ['Closing'],
    },
    critique: {
      title: 'Critique',
      summary: 'Summary',
      bullets: ['Bullet'],
    },
    evidence: [
      {
        anchorId: 'figure:paper-1-fig-1',
        type: 'figure',
        route: '/node/node-1?evidence=figure%3Apaper-1-fig-1',
        title: 'Figure 1',
        label: 'Figure 1',
        quote: 'Important chart',
        content: 'Important chart explanation',
        page: 1,
        sourcePaperId: 'paper-1',
      },
    ],
    references: [
      {
        paperId: 'paper-2',
        title: 'Reference paper',
        publishedAt: '2025-01-01T00:00:00.000Z',
        authors: ['Other Author'],
        citationCount: 1,
      },
    ],
  }
}

function makeTopicChatResponse() {
  return {
    messageId: 'msg-1',
    answer: 'Grounded answer',
    citations: [
      {
        anchorId: 'paper:paper-1',
        type: 'paper',
        route: '/node/node-1?anchor=paper%3Apaper-1',
        label: 'Paper one',
        quote: 'Important quote',
      },
    ],
    suggestedActions: [
      {
        label: 'Explain this node',
        action: 'explain',
      },
    ],
    workbenchAction: {
      kind: 'start-research',
      summary: 'Start a research cycle',
      targetTab: 'research',
      targetResearchView: 'search',
    },
  }
}

function makeEvidencePayload() {
  return {
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
    thumbnailPath: '/uploads/paper-1/figure-1.png',
    metadata: {
      topicId: 'topic-1',
      paperId: 'paper-1',
    },
  }
}

function makeTopicResearchBrief() {
  return {
    topicId: 'topic-1',
    session: {
      task: null,
      progress: null,
      report: null,
      active: false,
      strategy: {
        cycleDelayMs: 0,
        stageStallLimit: 0,
        reportPasses: 0,
        currentStageStalls: 0,
      },
    },
    pipeline: {
      updatedAt: null,
      lastRun: null,
      currentStage: null,
      recentHistory: [],
      globalOpenQuestions: [],
      continuityThreads: [],
      subjectFocus: {
        nodeId: null,
        paperIds: [],
        stageIndex: null,
        relatedHistory: [],
        relatedNodeActions: [],
      },
    },
    sessionMemory: {
      updatedAt: null,
      initializedAt: null,
      lastCompactedAt: null,
      summary: {
        currentFocus: '',
        continuity: '',
        establishedJudgments: [],
        openQuestions: [],
        researchMomentum: [],
        conversationStyle: '',
        lastResearchMove: '',
        lastUserIntent: '',
      },
      recentEvents: [],
    },
    world: {
      schemaVersion: 'topic-world-v1',
      topicId: 'topic-1',
      version: 1,
      updatedAt: '2026-04-15T00:00:00.000Z',
      language: 'en',
      summary: {
        thesis: '',
        currentFocus: '',
        continuity: '',
        dominantQuestion: '',
        dominantCritique: '',
        agendaHeadline: '',
        maturity: 'nascent',
      },
      stages: [],
      nodes: [],
      papers: [],
      claims: [],
      highlights: [],
      questions: [],
      critiques: [],
      agenda: [],
    },
    guidance: {
      schemaVersion: 'topic-guidance-v1',
      topicId: 'topic-1',
      updatedAt: null,
      directives: [],
      latestApplication: null,
      summary: {
        activeDirectiveCount: 0,
        acceptedDirectiveCount: 0,
        deferredDirectiveCount: 0,
        latestDirective: '',
        focusHeadline: '',
        styleHeadline: '',
        challengeHeadline: '',
        latestAppliedSummary: '',
        latestAppliedAt: null,
        latestAppliedDirectiveCount: 0,
      },
    },
    cognitiveMemory: {
      focus: '',
      continuity: '',
      conversationContract: '',
      projectMemories: [],
      feedbackMemories: [],
      referenceMemories: [],
    },
  }
}

function makeTopicResearchSessionState() {
  return {
    task: {
      id: 'task-topic-1',
      name: 'Topic research session',
      cronExpression: 'manual',
      enabled: true,
      topicId: 'topic-1',
      action: 'refresh',
      researchMode: 'duration',
      options: {
        durationHours: 4,
        cycleDelayMs: 0,
        stageIndex: null,
        maxIterations: 4,
        stageRounds: [],
      },
    },
    progress: {
      taskId: 'task-topic-1',
      topicId: 'topic-1',
      topicName: 'Topic 1',
      researchMode: 'duration',
      durationHours: 4,
      currentStage: 1,
      totalStages: 3,
      stageProgress: 0.25,
      currentStageRuns: 1,
      currentStageTargetRuns: 4,
      stageRunMap: { '1': 1 },
      totalRuns: 1,
      successfulRuns: 1,
      failedRuns: 0,
      discoveredPapers: 2,
      admittedPapers: 1,
      generatedContents: 1,
      lastRunAt: '2026-04-15T00:00:00.000Z',
      lastRunResult: 'success',
      startedAt: '2026-04-15T00:00:00.000Z',
      deadlineAt: '2026-04-15T04:00:00.000Z',
      completedAt: null,
      activeSessionId: 'session-topic-1',
      completedStageCycles: 0,
      latestSummary: 'Stage 1 research is underway.',
      status: 'active',
    },
    report: {
      schemaVersion: 'topic-research-report-v1',
      reportId: 'report-topic-1',
      taskId: 'task-topic-1',
      topicId: 'topic-1',
      topicName: 'Topic 1',
      researchMode: 'duration',
      trigger: 'manual',
      status: 'running',
      durationHours: 4,
      startedAt: '2026-04-15T00:00:00.000Z',
      deadlineAt: '2026-04-15T04:00:00.000Z',
      completedAt: null,
      updatedAt: '2026-04-15T00:30:00.000Z',
      currentStage: 1,
      totalStages: 3,
      completedStageCycles: 0,
      totalRuns: 1,
      successfulRuns: 1,
      failedRuns: 0,
      discoveredPapers: 2,
      admittedPapers: 1,
      generatedContents: 1,
      latestStageSummary: 'Stage 1 remains active.',
      headline: '',
      dek: '',
      summary: '',
      paragraphs: [],
      keyMoves: [],
      openQuestions: [],
      latestNodeActions: [],
    },
    active: true,
    strategy: {
      cycleDelayMs: 0,
      stageStallLimit: 0,
      reportPasses: 0,
      currentStageStalls: 0,
    },
  }
}

function makeTopicResearchExportBundle() {
  const brief = makeTopicResearchBrief()
  const session = makeTopicResearchSessionState()

  return {
    schemaVersion: 'topic-export-bundle-v2',
    exportedAt: '2026-04-15T01:00:00.000Z',
    topic: makeTopicViewModel(),
    report: session.report,
    world: brief.world,
    guidance: brief.guidance,
    pipeline: {
      updatedAt: brief.pipeline.updatedAt,
      overview: brief.pipeline,
    },
    sessionMemory: brief.sessionMemory,
    stageDossiers: [
      {
        stageIndex: 1,
        title: '2026.01-2026.03',
        titleEn: '2026.01-2026.03',
        description: 'Stage description',
        branchLabel: 'Mainline',
        branchColor: '#7d1938',
        yearLabel: '2026',
        dateLabel: '2026.01-2026.03',
        timeLabel: '2026.01-2026.03',
        stageThesis: 'Stage thesis',
        editorial: {
          kicker: 'Window',
          summary: 'Summary',
          transition: 'Transition',
        },
        nodeCount: 1,
        nodeIds: ['node-1'],
        pipeline: brief.pipeline,
      },
    ],
    nodeDossiers: [makeNodeViewModel()],
  }
}

function makeTopicResearchExportBatch() {
  return {
    schemaVersion: 'topic-export-batch-v2',
    exportedAt: '2026-04-15T01:00:00.000Z',
    topicCount: 1,
    bundles: [makeTopicResearchExportBundle()],
  }
}

test('backend topic collection contract accepts a backend topic list payload', () => {
  assert.doesNotThrow(() =>
    assertBackendTopicCollectionContract([makeBackendTopicListItem()]),
  )
})

test('backend topic collection contract rejects malformed topic list entries', () => {
  assert.throws(
    () =>
      assertBackendTopicCollectionContract([
        {
          id: 'topic-1',
        },
      ]),
    /missing "nameZh"/i,
  )
})

test('topic contract accepts a lane-aware topic view model', () => {
  assert.doesNotThrow(() => assertTopicViewModelContract(makeTopicViewModel()))
})

test('topic contract rejects lanes that point to missing latest nodes', () => {
  const payload = makeTopicViewModel()
  payload.graph.lanes[0]!.latestNodeId = 'missing-node'

  assert.throws(
    () => assertTopicViewModelContract(payload),
    /latestNodeId "missing-node"/i,
  )
})

test('topic contract rejects graph lanes that omit backend legend naming fields', () => {
  const payload = makeTopicViewModel()
  delete (payload.graph.lanes[0] as Partial<(typeof payload.graph.lanes)[number]>).label

  assert.throws(
    () => assertTopicViewModelContract(payload),
    /graph lane 1 is missing "label"/i,
  )
})

test('topic contract rejects duplicate graph lane indexes', () => {
  const payload = makeTopicViewModel()
  payload.graph.lanes.push({
    ...payload.graph.lanes[0]!,
    id: 'lane:duplicate-main',
  })

  assert.throws(
    () => assertTopicViewModelContract(payload),
    /duplicates laneIndex 0/i,
  )
})

test('topic contract rejects graph nodes that omit their editorial card payload', () => {
  const payload = makeTopicViewModel()
  payload.graph.nodes[0] = {
    ...payload.graph.nodes[0]!,
    editorial: undefined as never,
  }

  assert.throws(
    () => assertTopicViewModelContract(payload),
    /Topic graph node 1 editorial/i,
  )
})

test('topic contract rejects stage nodes whose primary paper is missing from paperIds', () => {
  const payload = makeTopicViewModel()
  payload.stages[0]!.nodes[0] = {
    ...payload.stages[0]!.nodes[0]!,
    primaryPaperId: 'paper-1',
    paperIds: ['paper-2'],
  }

  assert.throws(
    () => assertTopicViewModelContract(payload),
    /primaryPaperId "paper-1" is missing from paperIds/i,
  )
})

test('node contract accepts a workbench-ready node view model', () => {
  assert.doesNotThrow(() => assertNodeViewModelContract(makeNodeViewModel()))
})

test('node contract accepts canonical origin nodes with stageIndex 0', () => {
  const payload = makeNodeViewModel()
  payload.stageIndex = 0

  assert.doesNotThrow(() => assertNodeViewModelContract(payload))
})

test('node contract rejects reference lists that do not cover all paperRoles', () => {
  const payload = makeNodeViewModel()
  payload.references = [{ paperId: 'paper-1', title: 'Paper one' }]

  assert.throws(
    () => assertNodeViewModelContract(payload),
    /reference list must cover every node paper/i,
  )
})

test('paper contract accepts a workbench-ready paper view model', () => {
  assert.doesNotThrow(() => assertPaperViewModelContract(makePaperViewModel()))
})

test('paper contract accepts canonical related nodes with stageIndex 0', () => {
  const payload = makePaperViewModel()
  payload.relatedNodes[0]!.stageIndex = 0

  assert.doesNotThrow(() => assertPaperViewModelContract(payload))
})

test('topic chat contract rejects malformed citations', () => {
  const payload = makeTopicChatResponse()
  payload.citations[0] = {
    anchorId: 'paper:paper-1',
    type: 'paper',
    route: '',
    label: 'Paper one',
    quote: 'Important quote',
  }

  assert.throws(
    () => assertTopicChatResponseContract(payload),
    /citation 1 is missing "route"/i,
  )
})

test('evidence contract accepts a grounded evidence payload', () => {
  assert.doesNotThrow(() => assertEvidencePayloadContract(makeEvidencePayload()))
})

test('evidence contract rejects anchor/type drift', () => {
  const payload = makeEvidencePayload()
  payload.anchorId = 'table:paper-1-tab-1'

  assert.throws(
    () => assertEvidencePayloadContract(payload),
    /does not match type "figure"/i,
  )
})

test('topic research brief contract accepts a workbench-ready brief', () => {
  assert.doesNotThrow(() => assertTopicResearchBriefContract(makeTopicResearchBrief()))
})

test('topic research brief contract accepts structure-derived world entries with stable targets', () => {
  const payload = makeTopicResearchBrief()
  const nodeId = 'topic-1:stage-0:paper-1'
  const world = payload.world as {
    stages: unknown[]
    nodes: unknown[]
    papers: unknown[]
    claims: unknown[]
    highlights: unknown[]
    questions: unknown[]
    critiques: unknown[]
    agenda: unknown[]
  }

  world.stages = [
    {
      id: 'stage-0',
      stageIndex: 0,
      title: 'Origin stage',
      titleEn: 'Origin stage',
      summary: 'The first stage establishes the canonical starting point.',
      nodeIds: [nodeId],
      paperIds: ['paper-1'],
      confidence: 'medium',
      status: 'forming',
    },
  ]
  world.nodes = [
    {
      id: nodeId,
      stageIndex: 0,
      title: 'Origin node',
      subtitle: 'Foundational paper',
      summary: 'A single-paper node remains stable enough to anchor the topic.',
      paperIds: ['paper-1'],
      primaryPaperId: 'paper-1',
      coverImage: null,
      confidence: 'medium',
      maturity: 'forming',
      keyQuestion: 'What evidence still needs reinforcement?',
      dominantCritique: 'The node boundary should stay narrow.',
    },
  ]
  world.papers = [
    {
      id: 'paper-1',
      title: 'Paper one',
      titleEn: 'Paper one',
      summary: 'The paper anchors the first node.',
      coverImage: null,
      publishedAt: '2026-04-15T00:00:00.000Z',
      nodeIds: [nodeId],
      stageIndexes: [0],
    },
  ]
  world.claims = [
    {
      id: 'claim-1',
      scope: 'node',
      scopeId: nodeId,
      statement: 'The origin node should stay evidence-first.',
      kind: 'finding',
      confidence: 'medium',
      status: 'accepted',
      supportPaperIds: ['paper-1'],
      supportNodeIds: [nodeId],
      source: 'structure',
    },
  ]
  world.highlights = [
    {
      id: 'highlight-1',
      scope: 'node',
      scopeId: nodeId,
      title: 'Origin node is grounded',
      detail: 'The structure-derived highlight keeps the node tied to the canonical paper.',
      source: 'structure',
    },
  ]
  world.questions = [
    {
      id: 'question-1',
      scope: 'node',
      scopeId: nodeId,
      question: 'Does the node need a second corroborating paper?',
      priority: 'important',
      source: 'structure',
      status: 'open',
    },
  ]
  world.critiques = [
    {
      id: 'critique-1',
      targetType: 'node',
      targetId: nodeId,
      summary: 'Keep the node boundary narrow.',
      source: 'structure',
      severity: 'medium',
      resolved: false,
    },
  ]
  world.agenda = [
    {
      id: 'agenda-1',
      kind: 'repair-critique',
      targetType: 'node',
      targetId: nodeId,
      title: 'Tighten the node boundary',
      rationale: 'The node should remain evidence-first.',
      priorityScore: 82,
      suggestedPrompt: 'Tighten the node boundary.',
      status: 'queued',
    },
  ]

  assert.doesNotThrow(() => assertTopicResearchBriefContract(payload))
})

test('topic research brief contract rejects highlights that reference missing world targets', () => {
  const payload = makeTopicResearchBrief()
  ;(payload.world as { highlights: unknown[] }).highlights = [
    {
      id: 'highlight-1',
      scope: 'node',
      scopeId: 'node-missing',
      title: 'Broken highlight',
      detail: 'This should fail because the node does not exist.',
      source: 'structure',
    },
  ]

  assert.throws(
    () => assertTopicResearchBriefContract(payload),
    /highlight 1 references missing node "node-missing"/i,
  )
})

test('topic research brief contract rejects world topic drift', () => {
  const payload = makeTopicResearchBrief()
  payload.world.topicId = 'topic-2'

  assert.throws(
    () => assertTopicResearchBriefContract(payload),
    /drifted to topicId "topic-2" instead of "topic-1"/i,
  )
})

test('topic export bundle contract accepts a complete export bundle payload', () => {
  assert.doesNotThrow(() =>
    assertTopicResearchExportBundleContract(makeTopicResearchExportBundle()),
  )
})

test('topic export bundle contract rejects node dossier paper drift against the topic paper list', () => {
  const payload = makeTopicResearchExportBundle()
  payload.nodeDossiers[0]!.paperRoles[0]!.paperId = 'paper-missing'
  payload.nodeDossiers[0]!.paperRoles[0]!.route = '/node/node-1?anchor=paper%3Apaper-missing'
  payload.nodeDossiers[0]!.evidence[0] = {
    ...payload.nodeDossiers[0]!.evidence[0]!,
    sourcePaperId: 'paper-missing',
  } as unknown as (typeof payload.nodeDossiers)[number]['evidence'][number]
  payload.nodeDossiers[0]!.researchView!.evidence.paperBriefs[0]!.paperId = 'paper-missing'
  payload.nodeDossiers[0]!.researchView!.evidence.evidenceChains[0]!.paperId = 'paper-missing'
  payload.nodeDossiers[0]!.researchView!.methods.entries[0]!.paperId = 'paper-missing'
  payload.nodeDossiers[0]!.researchView!.methods.evolution[0]!.fromPaperId = 'paper-missing'
  payload.nodeDossiers[0]!.references[0]!.paperId = 'paper-missing'

  assert.throws(
    () => assertTopicResearchExportBundleContract(payload),
    /missing paper/i,
  )
})

test('topic export bundle contract rejects stage dossiers that point to missing topic nodes', () => {
  const payload = makeTopicResearchExportBundle()
  payload.stageDossiers[0]!.nodeIds[0] = 'node-missing'

  assert.throws(
    () => assertTopicResearchExportBundleContract(payload),
    /references missing topic node "node-missing"/i,
  )
})

test('topic export batch contract rejects topicCount drift', () => {
  const payload = makeTopicResearchExportBatch()
  payload.topicCount = 2

  assert.throws(
    () => assertTopicResearchExportBatchContract(payload),
    /topicCount does not match the number of bundles/i,
  )
})

test('topic export bundle contract rejects sub-month stage config bounds', () => {
  const payload = makeTopicResearchExportBundle()
  payload.topic.stageConfig.minWindowMonths = 0.25

  assert.throws(
    () => assertTopicResearchExportBundleContract(payload),
    /minWindowMonths/i,
  )
})

test('topic export bundle contract rejects stage windows outside the advertised bounds', () => {
  const payload = makeTopicResearchExportBundle()
  payload.topic.stageConfig.windowMonths = 30

  assert.throws(
    () => assertTopicResearchExportBundleContract(payload),
    /windowMonths falls outside the advertised bounds/i,
  )
})

test('topic export bundle contract rejects session memory summaries that omit current focus', () => {
  const payload = makeTopicResearchExportBundle()
  delete (payload.sessionMemory.summary as Partial<typeof payload.sessionMemory.summary>).currentFocus

  assert.throws(
    () => assertTopicResearchExportBundleContract(payload),
    /sessionMemory summary is missing "currentFocus"/i,
  )
})

test('topic research session contract accepts a populated session payload', () => {
  assert.doesNotThrow(() =>
    assertTopicResearchSessionContract(makeTopicResearchSessionState(), 'topic-1'),
  )
})

test('topic research session contract rejects progress topic drift', () => {
  const payload = makeTopicResearchSessionState()
  payload.progress.topicId = 'topic-2'

  assert.throws(
    () => assertTopicResearchSessionContract(payload, 'topic-1'),
    /drifted to topicId "topic-2" instead of "topic-1"/i,
  )
})
