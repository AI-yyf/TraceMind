import type {
  NodeViewModel,
  PaperViewModel,
  TopicResearchBrief,
  TopicResearchExportBatch,
  TopicResearchExportBundle,
  TopicResearchSessionState,
  TopicViewModel,
} from '@/types/alpha'

export function makeTopicResearchSessionState(
  mutate?: (session: TopicResearchSessionState) => void,
): TopicResearchSessionState {
  const session: TopicResearchSessionState = {
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
        stageIndex: undefined,
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
      figureCount: 2,
      tableCount: 1,
      formulaCount: 0,
      figureGroupCount: 1,
      lastRunAt: '2026-04-15T00:00:00.000Z',
      lastRunResult: 'success',
      startedAt: '2026-04-15T00:00:00.000Z',
      deadlineAt: '2026-04-15T04:00:00.000Z',
      completedAt: null,
      activeSessionId: 'session-topic-1',
      completedStageCycles: 0,
      currentStageStalls: 0,
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

  mutate?.(session)
  return session
}

export function makeTopicResearchBrief(
  mutate?: (brief: TopicResearchBrief) => void,
): TopicResearchBrief {
  const brief: TopicResearchBrief = {
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

  mutate?.(brief)
  return brief
}

function makeTopicNodeCard(): TopicViewModel['stages'][number]['nodes'][number] {
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
    figureGroupCount: 0,
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

export function makeTopicViewModel(): TopicViewModel {
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

export function makeNodeViewModel(): NodeViewModel {
  const figureEvidence = {
    anchorId: 'figure:paper-1-fig-1',
    type: 'figure' as const,
    route: '/node/node-1?evidence=figure%3Apaper-1-fig-1',
    title: 'Figure 1',
    label: 'Paper one / Figure 1',
    quote: 'Important chart',
    content: 'Important chart explanation',
    page: 1,
    sourcePaperId: 'paper-1',
    sourcePaperTitle: 'Paper one',
    imagePath: '/uploads/paper-1-fig-1.png',
    whyItMatters: 'This figure anchors the node into one visible primary comparison.',
  }

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
      paperCount: 1,
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
        role: 'origin',
        contribution: 'Contribution',
        figuresCount: 1,
        tablesCount: 0,
        formulasCount: 0,
        coverImage: null,
      },
    ],
    comparisonBlocks: [
      {
        id: 'comparison-1',
        title: 'Key comparison',
        summary: 'Comparison summary',
        papers: [
          {
            paperId: 'paper-1',
            title: 'Paper one',
            route: '/node/node-1?anchor=paper%3Apaper-1',
            role: 'origin',
          },
        ],
        points: [
          {
            label: 'Point',
            detail: 'Detail',
          },
        ],
      },
    ],
    article: {
      periodLabel: '2026.04',
      timeRangeLabel: 'Current',
      flow: [
        {
          id: 'flow-1',
          type: 'text',
          title: 'Flow',
          body: ['Body'],
        },
      ],
      sections: [
        {
          id: 'section-1',
          kind: 'lead',
          title: 'Section',
          body: ['Content'],
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
      figureEvidence,
    ],
    researchView: {
      evidence: {
        featuredAnchorIds: [figureEvidence.anchorId],
        supportingAnchorIds: [],
        featured: [figureEvidence],
        supporting: [],
        paperBriefs: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            role: 'origin',
            publishedAt: '2026-04-01T00:00:00.000Z',
            summary: 'Paper one establishes the node core through one decisive visual comparison.',
            contribution: 'Defines the stable origin claim and its primary visual evidence.',
            evidenceAnchorIds: [figureEvidence.anchorId],
            keyFigureIds: [figureEvidence.anchorId],
            keyTableIds: [],
            keyFormulaIds: [],
          },
        ],
        evidenceChains: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            subsectionKind: 'results',
            subsectionTitle: 'Result',
            summary: 'The figure carries the main comparison that the node depends on.',
            evidenceAnchorIds: [figureEvidence.anchorId],
          },
        ],
        coverage: {
          totalEvidenceCount: 1,
          renderableEvidenceCount: 1,
          figureCount: 1,
          tableCount: 0,
          formulaCount: 0,
          sectionCount: 0,
          featuredCount: 1,
          supportingCount: 0,
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
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            contribution: 'Contribution',
            anchorId: figureEvidence.anchorId,
            evidenceAnchorIds: [figureEvidence.anchorId],
          },
        ],
        dimensions: ['Dimension'],
      },
      problems: {
        items: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
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
    ],
  }
}

export function makePaperViewModel(
  mutate?: (paper: PaperViewModel) => void,
): PaperViewModel {
  const paper: PaperViewModel = {
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

  mutate?.(paper)
  return paper
}

export function makeTopicResearchExportBundle(
  mutate?: (bundle: TopicResearchExportBundle) => void,
): TopicResearchExportBundle {
  const brief = makeTopicResearchBrief()
  const session = makeTopicResearchSessionState()
  const bundle: TopicResearchExportBundle = {
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

  mutate?.(bundle)
  return bundle
}

export function makeTopicResearchExportBatch(
  mutate?: (batch: TopicResearchExportBatch) => void,
): TopicResearchExportBatch {
  const batch: TopicResearchExportBatch = {
    schemaVersion: 'topic-export-batch-v2',
    exportedAt: '2026-04-15T01:00:00.000Z',
    topicCount: 1,
    bundles: [makeTopicResearchExportBundle()],
  }

  mutate?.(batch)
  return batch
}
