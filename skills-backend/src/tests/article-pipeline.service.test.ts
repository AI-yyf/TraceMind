import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as articlePipelineTesting } from '../services/topics/article-pipeline'

function createResearchPipelineContext() {
  return {
    currentStage: {
      stageSummary: 'Stage 2 tightened the node narrative around planning fidelity.',
      openQuestions: ['Which benchmark still breaks the planning stack?'],
    },
    lastRun: {
      stageSummary: 'Latest cycle pulled the topic back from broad autonomy claims.',
    },
    continuityThreads: [
      'Stage 2: keep the story anchored in planning fidelity evidence.',
    ],
    globalOpenQuestions: ['Which benchmark still breaks the planning stack?'],
    subjectFocus: {
      relatedNodeActions: ['Strengthen the node around planning evidence rather than autonomy rhetoric.'],
    },
    sessionMemory: {
      currentFocus: 'Focus on planning fidelity first.',
      continuity: 'The node now centers on grounded planning evidence.',
      openQuestions: ['Which benchmark still breaks the planning stack?'],
      researchMomentum: ['Reviewer pulled back autonomy overclaim.'],
      conversationStyle: 'Write like the same research editor across cycles.',
    },
    guidance: {
      summary: {
        focusHeadline: 'Stay on the current node.',
        latestAppliedSummary: 'Stage 2 applied one focus directive.',
      },
      activeDirectives: [
        {
          directiveType: 'focus',
          scopeLabel: 'Guidance-sensitive node',
          effectSummary: 'Keep the next writing cycle on planning fidelity.',
          instruction: 'Do not broaden the topic.',
          promptHint: 'Avoid expanding to generic autonomy.',
          appliesToRuns: 'next-run',
          status: 'accepted',
        },
      ],
      latestApplication: {
        summary: 'Stage 2 applied the focus directive.',
        appliedAt: '2026-04-04T01:00:00.000Z',
        stageIndex: 2,
        directives: [
          {
            directiveType: 'focus',
            scopeLabel: 'Guidance-sensitive node',
            note: 'Planning fidelity first.',
            status: 'accepted',
          },
        ],
      },
    },
    cognitiveMemory: {
      focus: 'Planning fidelity became the center of gravity.',
      continuity: 'This theme now tracks planning evidence instead of general autonomy.',
      conversationContract: 'Answer like the same research editor across cycles.',
      projectMemories: [
        {
          title: 'Current Focus',
          summary: 'Planning fidelity is the strongest supported line.',
        },
      ],
      feedbackMemories: [
        {
          title: 'Active Guidance',
          summary: 'Do not broaden beyond the current node.',
        },
      ],
      referenceMemories: [
        {
          title: 'Open Question',
          summary: 'Which benchmark still fails the planning stack?',
        },
      ],
    },
  }
}

test('buildArticleAuthorBrief distills pipeline, guidance, and cognitive memory into a writer brief', () => {
  const brief = articlePipelineTesting.buildArticleAuthorBrief(createResearchPipelineContext())

  assert.ok(brief)
  assert.equal(brief?.focus, 'Planning fidelity became the center of gravity.')
  assert.equal(
    brief?.continuity,
    'This theme now tracks planning evidence instead of general autonomy.',
  )
  assert.equal(brief?.activeDirectives.length, 1)
  assert.equal(brief?.activeDirectives[0]?.directiveType, 'focus')
  assert.equal(brief?.activeDirectives[0]?.scopeLabel, 'Guidance-sensitive node')
  assert.ok(brief?.pipelineSignals.some((item) => item.includes('planning fidelity')))
  assert.ok(
    brief?.openQuestions.includes('Which benchmark still breaks the planning stack?'),
  )
  assert.ok(
    brief?.feedbackMemories.some((item) => item.includes('Do not broaden beyond the current node.')),
  )
  assert.ok(brief?.guidanceRule.includes('durable user calibration'))
})

test('mergeMemoryContext injects explicit authorBrief while preserving researchPipeline payload', () => {
  const researchPipelineContext = createResearchPipelineContext()
  const merged = articlePipelineTesting.mergeMemoryContext(
    {
      paperCount: 3,
      primaryPaperId: 'paper-1',
    },
    researchPipelineContext,
  ) as {
    paperCount: number
    primaryPaperId: string
    authorBrief?: {
      focus: string
      activeDirectives: Array<{ promptHint: string }>
    }
    researchPipeline?: {
      guidance?: {
        activeDirectives?: Array<{ instruction: string }>
      }
    }
  }

  assert.equal(merged.paperCount, 3)
  assert.equal(merged.primaryPaperId, 'paper-1')
  assert.equal(
    merged.authorBrief?.focus,
    'Planning fidelity became the center of gravity.',
  )
  assert.equal(merged.authorBrief?.activeDirectives[0]?.promptHint, 'Avoid expanding to generic autonomy.')
  assert.equal(
    merged.researchPipeline?.guidance?.activeDirectives?.[0]?.instruction,
    'Do not broaden the topic.',
  )
})

test('node paper fallback keeps section and evidence coverage visible for long-form node writing', () => {
  const paper = {
    id: 'paper-1',
    title: 'Paper title',
    titleZh: '论文标题',
    titleEn: 'Paper title',
    topicId: 'topic-1',
    published: new Date('2026-01-01T00:00:00.000Z'),
    summary: 'This paper opens the node with a concrete task framing.',
    explanation: 'It then tightens the mechanism, evidence chain, and unresolved constraints.',
    arxivUrl: 'https://arxiv.org/abs/2601.00001',
    pdfUrl: 'https://arxiv.org/pdf/2601.00001.pdf',
    pdfPath: null,
    sections: [
      {
        sourceSectionTitle: 'Introduction',
        editorialTitle: '问题提出',
        paragraphs: 'The paper explains why the old setting fails and why a new mechanism is required.',
      },
      {
        sourceSectionTitle: 'Method',
        editorialTitle: '方法机制',
        paragraphs: 'The method section defines the core mechanism and the main design constraint.',
      },
    ],
    figures: [
      {
        number: 1,
        caption: 'Figure 1 compares the new mechanism against the old baseline.',
        analysis: 'The figure shows where the gain actually appears.',
        page: 3,
      },
    ],
    tables: [
      {
        number: 1,
        caption: 'Table 1 reports the main benchmark comparison.',
        rawText: 'Method | Score\nNew | 0.91\nOld | 0.84',
        page: 5,
      },
    ],
    formulas: [
      {
        number: '1',
        latex: 'L = L_{task} + \\lambda L_{align}',
        rawText: 'The loss combines task and alignment objectives.',
        page: 4,
      },
    ],
  }

  const compact = articlePipelineTesting.summarizePaper(paper)
  const fallback = articlePipelineTesting.buildNodePaperFallback(paper, 0, 'paper-1')

  assert.equal(compact.sections.length, 2)
  assert.equal(compact.figures.length, 1)
  assert.equal(compact.tables.length, 1)
  assert.equal(compact.formulas.length, 1)
  assert.equal(fallback.role, '主线论文')
  assert.ok(fallback.overviewTitle.includes('主线'))
  assert.ok(fallback.body.some((paragraph) => paragraph.includes('Figure 1')))
  assert.ok(fallback.body.some((paragraph) => paragraph.includes('Table 1')))
  assert.ok(fallback.body.some((paragraph) => paragraph.includes('Formula 1')))
  assert.ok(fallback.body.some((paragraph) => paragraph.includes('2 个正文 section')))
})
