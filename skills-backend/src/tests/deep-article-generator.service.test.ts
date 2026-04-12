import assert from 'node:assert/strict'
import test from 'node:test'

import { omniGateway } from '../services/omni/gateway'
import {
  generateNodeEnhancedArticle,
  type NodeArticleFlowBlock,
  type PaperArticleBlock,
  type PaperTransitionBlock,
} from '../services/topics/deep-article-generator'

function paperArticles(flow: NodeArticleFlowBlock[]) {
  return flow.filter((block): block is PaperArticleBlock => block.type === 'paper-article')
}

function paperTransitions(flow: NodeArticleFlowBlock[]) {
  return flow.filter((block): block is PaperTransitionBlock => block.type === 'paper-transition')
}

test('deep article generator falls back to a full continuous article flow with transitions and core judgment', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  try {
    const result = await generateNodeEnhancedArticle('node-1', {
      nodeContext: {
        title: '语言条件规划接口',
        stageIndex: 2,
        summary: '把语言条件规划从单点结果整理成连续研究线。',
        explanation: '节点需要把两篇论文之间的方法推进与证据结构讲清楚。',
      },
      papers: [
        {
          id: 'paper-1',
          title: '语言条件世界模型',
          titleEn: 'Language-conditioned World Model',
          authors: ['Ada Researcher', 'Bo Scientist'],
          summary: '提出把语言指令引入世界模型规划链路。',
          explanation: '论文把语言条件控制、潜在动力学建模和规划解码放在同一框架里。',
          abstract: 'This paper introduces a language-conditioned world model for controllable planning.',
          publishedAt: '2025-01-10T00:00:00.000Z',
          pdfUrl: 'https://example.com/paper-1.pdf',
          originalUrl: 'https://example.com/paper-1',
          citationCount: 320,
          coverImage: '/uploads/paper-1-cover.png',
          paper_sections: [
            {
              id: 'section-1-intro',
              editorialTitle: 'Introduction',
              sourceSectionTitle: 'Introduction',
              paragraphs:
                'The paper motivates language-conditioned planning in a unified world model.\n\nIt argues that instruction-level control should be trained jointly with latent prediction.',
            },
            {
              id: 'section-1-method',
              editorialTitle: 'Method',
              sourceSectionTitle: 'Method',
              paragraphs:
                'The method introduces a shared latent dynamics model, a language encoder, and a planning decoder.\n\nA controllable latent state links instructions to action rollout.',
            },
            {
              id: 'section-1-exp',
              editorialTitle: 'Experiment',
              sourceSectionTitle: 'Experiment',
              paragraphs:
                'Experiments evaluate controllable driving and long-horizon task completion.\n\nThe setup compares language-conditioned planning against action-only baselines.',
            },
            {
              id: 'section-1-results',
              editorialTitle: 'Results',
              sourceSectionTitle: 'Results',
              paragraphs:
                'Results show better task completion and more stable long-horizon planning.\n\nThe gains are strongest when instruction ambiguity is high.',
            },
            {
              id: 'section-1-placement',
              editorialTitle: 'Topic placement',
              sourceSectionTitle: 'Topic placement',
              paragraphs: 'It is currently grouped into 1 node(s): 语言条件规划接口。',
            },
          ],
          figures: [{ id: 'figure-1' }],
          tables: [{ id: 'table-1' }],
          formulas: [{ id: 'formula-1' }],
        },
        {
          id: 'paper-2',
          title: '可解释语言规划扩展',
          titleEn: 'Interpretable Language Planning Extension',
          authors: ['Chen Analyst'],
          summary: '沿着前作继续推进，把可解释中间变量纳入规划界面。',
          explanation: '论文强调把语言条件规划中的中间决策暴露出来，方便比较与诊断。',
          abstract: 'This paper extends language-conditioned planning with interpretable intermediate plans.',
          publishedAt: '2025-02-18T00:00:00.000Z',
          pdfUrl: 'https://example.com/paper-2.pdf',
          originalUrl: 'https://example.com/paper-2',
          citationCount: 85,
          paper_sections: [
            {
              id: 'section-2-intro',
              editorialTitle: 'Background and motivation',
              sourceSectionTitle: 'Background',
              paragraphs:
                'The follow-up paper focuses on interpretability and diagnosis.\n\nIt claims that controllable planning needs intermediate decision exposure.',
            },
            {
              id: 'section-2-method',
              editorialTitle: 'Architecture',
              sourceSectionTitle: 'Method',
              paragraphs:
                'A staged decoder emits interpretable plan tokens before actions.\n\nThe architecture keeps the same world model backbone while broadening supervision.',
            },
            {
              id: 'section-2-results',
              editorialTitle: 'Analysis and results',
              sourceSectionTitle: 'Results',
              paragraphs:
                'The paper reports better diagnosability with modest planning gains.\n\nError analysis shows which instructions fail before action generation.',
            },
          ],
          figures: [{ id: 'figure-2' }],
          tables: [{ id: 'table-2' }],
          formulas: [],
        },
      ],
    })

    const flow = result.flow
    const papers = paperArticles(flow)
    const transitions = paperTransitions(flow)

    assert.equal(flow[0]?.type, 'introduction')
    assert.equal(papers.length, 2)
    assert.equal(transitions.length, 1)
    assert.equal(flow[1]?.type, 'paper-article')
    assert.equal(flow[2]?.type, 'paper-transition')
    assert.equal(flow[3]?.type, 'paper-article')
    assert.ok(flow.some((block) => block.type === 'synthesis'))
    assert.equal(flow.at(-1)?.type, 'closing')

    assert.equal(papers[0]?.subsections.length, 8)
    assert.ok(
      papers[0]?.subsections.every((subsection) => subsection.content.trim().length > 0),
      'each fallback subsection should contain readable narrative content',
    )
    assert.ok(
      papers[0]?.subsections.every(
        (subsection) =>
          !subsection.content.includes('Topic placement') &&
          !subsection.content.includes('It is currently grouped into 1 node(s)'),
      ),
      'fallback subsections should drop topic-placement metadata fragments',
    )
    assert.equal(papers[0]?.coverImage, '/uploads/paper-1-cover.png')
    assert.ok(
      papers[0]?.subsections.some(
        (subsection) =>
          subsection.kind === 'method' && subsection.evidenceIds.includes('formula:formula-1'),
      ),
      'method subsection should preserve formula evidence anchors',
    )
    assert.equal(transitions[0]?.fromPaperId, 'paper-1')
    assert.equal(transitions[0]?.toPaperId, 'paper-2')
    assert.ok((transitions[0]?.content ?? '').length > 0)
    assert.ok(result.coreJudgment.content.length > 0)
    assert.ok(result.coreJudgment.contentEn.length > 0)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
  }
})

test('deep article generator orders introductions chronologically and keeps the core judgment problem-specific', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  try {
    const result = await generateNodeEnhancedArticle('node-chronology', {
      nodeContext: {
        title: 'World-model closed-loop planning',
        stageIndex: 4,
        summary: 'Tracks how closed-loop driving moves from latent prediction to planning-grounded world modeling.',
        explanation: 'The node should read as one article from the earliest planning setup to the later closed-loop landing point.',
      },
      papers: [
        {
          id: 'paper-late',
          title: 'Closed-Loop Planning with Latent World Models',
          titleEn: 'Closed-Loop Planning with Latent World Models',
          authors: ['Later Author'],
          summary: 'Turns latent prediction into closed-loop planning evidence for autonomous driving.',
          explanation: 'Emphasizes planning stability, latent rollouts, and closed-loop control.',
          abstract: 'Closed-loop planning with latent world models for autonomous driving.',
          publishedAt: '2025-02-10T00:00:00.000Z',
          paper_sections: [
            {
              id: 'paper-late-intro',
              editorialTitle: 'Introduction',
              sourceSectionTitle: 'Introduction',
              paragraphs: 'This later paper lands the stage with planning-oriented closed-loop evidence.',
            },
          ],
          figures: [],
          tables: [],
          formulas: [],
        },
        {
          id: 'paper-early',
          title: 'Learning Latent Dynamics for Driving',
          titleEn: 'Learning Latent Dynamics for Driving',
          authors: ['Early Author'],
          summary: 'Builds the earliest latent-dynamics setup for driving prediction.',
          explanation: 'Defines the initial task framing and the first latent prediction backbone.',
          abstract: 'An early latent-dynamics paper for driving prediction.',
          publishedAt: '2024-11-01T00:00:00.000Z',
          paper_sections: [
            {
              id: 'paper-early-intro',
              editorialTitle: 'Introduction',
              sourceSectionTitle: 'Introduction',
              paragraphs: 'This earlier paper defines the initial task framing for latent driving prediction.',
            },
          ],
          figures: [],
          tables: [],
          formulas: [],
        },
      ],
    })

    const introduction = result.flow[0]
    assert.equal(introduction?.type, 'introduction')
    assert.match(introduction?.content ?? '', /Learning Latent Dynamics for Driving/u)
    assert.match(introduction?.content ?? '', /Closed-Loop Planning with Latent World Models/u)
    assert.ok(
      (introduction?.content ?? '').indexOf('Learning Latent Dynamics for Driving') <
        (introduction?.content ?? '').indexOf('Closed-Loop Planning with Latent World Models'),
      'the introduction should follow the chronological reading order',
    )
    assert.doesNotMatch(result.coreJudgment.contentEn, /evolving judgment chain|isolated results/iu)
    assert.match(result.coreJudgment.contentEn, /Learning Latent Dynamics for Driving/u)
    assert.match(result.coreJudgment.contentEn, /Closed-Loop Planning with Latent World Models/u)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
  }
})
