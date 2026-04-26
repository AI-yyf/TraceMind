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
    const paperOneEvidenceIds = new Set(papers[0]?.subsections.flatMap((subsection) => subsection.evidenceIds) ?? [])
    assert.ok(paperOneEvidenceIds.has('figure:figure-1'), 'paper one should preserve figure evidence anchors')
    assert.ok(paperOneEvidenceIds.has('table:table-1'), 'paper one should preserve table evidence anchors')
    assert.ok(paperOneEvidenceIds.has('formula:formula-1'), 'paper one should preserve formula evidence anchors')
    const paperOneNarrative = papers[0]?.subsections.map((subsection) => subsection.content).join('\n') ?? ''
    assert.match(paperOneNarrative, /\[\[figure:figure-1\]\]/u)
    assert.match(paperOneNarrative, /\[\[table:table-1\]\]/u)
    assert.match(paperOneNarrative, /\[\[formula:formula-1\]\]/u)
    assert.equal(transitions[0]?.fromPaperId, 'paper-1')
    assert.equal(transitions[0]?.toPaperId, 'paper-2')
    assert.ok((transitions[0]?.content ?? '').length > 0)
    assert.ok(result.coreJudgment.content.length > 0)
    assert.ok(result.coreJudgment.contentEn.length > 0)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
  }
})

test('deep article generator skips provider calls in grounded-fast mode and still preserves anchored evidence', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  const originalComplete = omniGateway.complete
  let availabilityChecks = 0
  let completionCalls = 0

  omniGateway.hasAvailableModel = async () => {
    availabilityChecks += 1
    return true
  }
  omniGateway.complete = async () => {
    completionCalls += 1
    throw new Error('provider should not be called in grounded-fast mode')
  }

  try {
    const result = await generateNodeEnhancedArticle('node-grounded-fast', {
      nodeContext: {
        title: 'Grounded stage article',
        stageIndex: 1,
        summary: 'Uses restored paper sections to build the enhanced article locally.',
        explanation: 'The backend should return a deterministic node article without waiting on slow provider calls.',
      },
      papers: [
        {
          id: 'paper-grounded-1',
          title: 'Grounded Planning Paper',
          titleEn: 'Grounded Planning Paper',
          authors: ['Codex Test'],
          summary: 'Frames the stage problem from restored sections.',
          explanation: 'Links the planning setup to evidence the backend already has.',
          abstract: 'A grounded planning paper with restored sections and evidence.',
          publishedAt: '2025-01-01T00:00:00.000Z',
          paper_sections: [
            {
              id: 'paper-grounded-1-intro',
              editorialTitle: 'Introduction',
              sourceSectionTitle: 'Introduction',
              paragraphs:
                'This paper defines the grounded planning problem for the stage.\n\nIt explains why the backend can restore a continuous article locally.',
            },
            {
              id: 'paper-grounded-1-method',
              editorialTitle: 'Method',
              sourceSectionTitle: 'Method',
              paragraphs:
                'The method couples a planning backbone with preserved section evidence.\n\nThe restored article can cite formulas and tables without another model pass.',
            },
            {
              id: 'paper-grounded-1-results',
              editorialTitle: 'Results',
              sourceSectionTitle: 'Results',
              paragraphs:
                'Results show the grounded article path stays stable under cache rebuilds.\n\nThe restored evidence keeps the node judgment anchored.',
            },
          ],
          figures: [{ id: 'paper-grounded-1-figure', caption: 'Grounded pipeline figure' }],
          tables: [{ id: 'paper-grounded-1-table', caption: 'Grounded pipeline table' }],
          formulas: [{ id: 'paper-grounded-1-formula', latex: 'y=f(x)' }],
        },
      ],
    })

    const papers = paperArticles(result.flow)

    assert.equal(availabilityChecks, 0)
    assert.equal(completionCalls, 0)
    assert.equal(papers.length, 1)
    assert.ok(
      papers[0]?.subsections.some((subsection) => subsection.evidenceIds.includes('formula:paper-grounded-1-formula')),
      'grounded-fast mode should still preserve formula anchors in subsection evidence ids',
    )
    const groundedNarrative = papers[0]?.subsections.map((subsection) => subsection.content).join('\n') ?? ''
    assert.match(groundedNarrative, /\[\[figure:paper-grounded-1-figure\]\]/u)
    assert.match(groundedNarrative, /\[\[table:paper-grounded-1-table\]\]/u)
    assert.match(groundedNarrative, /\[\[formula:paper-grounded-1-formula\]\]/u)
    assert.ok(result.coreJudgment.content.length > 0)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    omniGateway.complete = originalComplete
  }
})

test('deep article generator reconstructs formula anchors from preserved table text when explicit formulas are missing', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  try {
    const result = await generateNodeEnhancedArticle('node-synthetic-formula', {
      nodeContext: {
        title: 'Closed-loop planning objective',
        stageIndex: 2,
        summary: 'Keeps the planning objective grounded even when the PDF extractor missed explicit formula regions.',
        explanation: 'The article should still embed a formula anchor reconstructed from preserved evidence text.',
      },
      papers: [
        {
          id: 'paper-synthetic-formula',
          title: 'Objective Recovery for Planning',
          titleEn: 'Objective Recovery for Planning',
          authors: ['Codex Test'],
          summary: 'Shows how to recover the planning objective from preserved table text.',
          explanation: 'The method section cites a loss definition that only survived inside table OCR.',
          abstract: 'Recover objective equations from preserved research evidence.',
          publishedAt: '2025-03-01T00:00:00.000Z',
          paper_sections: [
            {
              id: 'paper-synthetic-formula-method',
              editorialTitle: 'Method',
              sourceSectionTitle: 'Method',
              paragraphs:
                'The planner optimizes the recovered objective so that long-horizon control remains grounded in explicit evidence.',
            },
            {
              id: 'paper-synthetic-formula-results',
              editorialTitle: 'Results',
              sourceSectionTitle: 'Results',
              paragraphs:
                'The recovered article keeps figures, tables, and formulas inside one continuous narrative.',
            },
          ],
          figures: [],
          tables: [
            {
              id: 'paper-synthetic-formula-table-1',
              number: 1,
              caption: 'Objective terms',
              rawText: 'Objective terms\nLoss = L_plan + lambda * L_ctrl\nPlanner score 0.81',
            },
          ],
          formulas: [],
        },
      ],
    })

    const paper = paperArticles(result.flow)[0]
    const syntheticAnchor = 'formula:synthetic-table-paper-synthetic-formula-table-1-1'

    assert.ok(paper, 'expected one paper article block')
    assert.ok(
      paper?.subsections.some((subsection) => subsection.evidenceIds.includes(syntheticAnchor)),
      'method/article subsections should preserve reconstructed formula anchors',
    )

    const narrative = paper?.subsections.map((subsection) => subsection.content).join('\n') ?? ''
    assert.match(narrative, /\[\[formula:synthetic-table-paper-synthetic-formula-table-1-1\]\]/u)
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

test('deep article generator rewrites embedded English summaries into Chinese editorial prose', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  try {
    const result = await generateNodeEnhancedArticle('node-english-rewrite', {
      nodeContext: {
        title: '自动驾驶监督信号演进',
        stageIndex: 2,
        summary: '把自动驾驶里从直接感知到规划监督的线索重新写成编辑文章。',
        explanation: '文章需要把英文摘要噪声改写成中文叙述，而不是直接塞进正文。',
      },
      papers: [
        {
          id: 'paper-affordance',
          title: 'DeepDriving',
          titleEn: 'DeepDriving',
          authors: ['Author A'],
          summary:
            'Introduces affordance-centered direct perception as an interpretable precursor to later end-to-end driving policy learning.',
          explanation:
            'The paper keeps the perception-planning interface explicit, which makes it a useful branch reference when comparing later closed-loop driving systems.',
          abstract:
            'Introduces affordance-centered direct perception as an interpretable precursor to later end-to-end driving policy learning.',
          publishedAt: '2015-11-11T00:00:00.000Z',
          paper_sections: [],
          figures: [],
          tables: [],
          formulas: [],
        },
        {
          id: 'paper-cheating',
          title: 'Learning by Cheating',
          titleEn: 'Learning by Cheating',
          authors: ['Author B'],
          summary:
            'Uses privileged planning signals during training to stabilize end-to-end driving and strengthen closed-loop behavior under complex scenarios.',
          explanation:
            'This paper is a bridge from raw behavior cloning toward structured planning supervision.',
          abstract:
            'Uses privileged planning signals during training to stabilize end-to-end driving and strengthen closed-loop behavior under complex scenarios.',
          publishedAt: '2019-12-27T00:00:00.000Z',
          paper_sections: [],
          figures: [],
          tables: [],
          formulas: [],
        },
      ],
    })

    const articles = paperArticles(result.flow)
    assert.equal(articles.length, 2)
    assert.match(articles[0]?.introduction ?? '', /以 affordance 为中心的直接感知/u)
    assert.match(articles[0]?.introduction ?? '', /可解释中间表示/u)
    assert.doesNotMatch(articles[0]?.introduction ?? '', /Introduces affordance-centered direct perception/iu)
    assert.match(articles[1]?.introduction ?? '', /训练阶段的特权规划信号/u)
    assert.match(articles[1]?.introduction ?? '', /复杂场景下的闭环表现/u)
    assert.doesNotMatch(articles[1]?.introduction ?? '', /Uses privileged planning signals during training/iu)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
  }
})

test('deep article generator removes low-signal extraction noise and adds editorial lead-ins to subsection prose', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  try {
    const result = await generateNodeEnhancedArticle('node-editorial-cleanup', {
      nodeContext: {
        title: '自动驾驶控制信号拆解',
        stageIndex: 3,
        summary: '把节点文章从抽取痕迹改写成连续评述。',
        explanation: '不应该把保留了多少张图表这种系统句子直接落进正文。',
      },
      papers: [
        {
          id: 'paper-editorial-cleanup',
          title: 'Control Signal Disentanglement for Driving',
          titleEn: 'Control Signal Disentanglement for Driving',
          authors: ['Author A'],
          summary: 'Explains why disentangled driving control matters for later planning interfaces.',
          explanation: 'Keeps the paper article readable even when the extractor recovered noisy helper sentences.',
          abstract: 'A paper about disentangling control signals for driving.',
          publishedAt: '2025-03-11T00:00:00.000Z',
          paper_sections: [
            {
              id: 'paper-editorial-cleanup-method',
              editorialTitle: 'Method',
              sourceSectionTitle: 'Method',
              paragraphs:
                '当前保留了 3 张图、4 张表和 2 个公式，可用于把方法、实验与结果重新落回证据层。\n\nThe method separates structure, identity, and ego-action before the planner recombines them.',
            },
            {
              id: 'paper-editorial-cleanup-results',
              editorialTitle: 'Results',
              sourceSectionTitle: 'Results',
              paragraphs:
                'Figure 2 provided the key visual evidence.\n\nThe results show that disentanglement reduces cross-signal interference in complex scenes.',
            },
          ],
          figures: [{ id: 'paper-editorial-cleanup-figure', caption: 'Control structure' }],
          tables: [],
          formulas: [],
        },
      ],
    })

    const paper = paperArticles(result.flow)[0]
    assert.ok(paper, 'expected one paper article block')

    const methodSubsection = paper?.subsections.find((subsection) => subsection.kind === 'method')
    const resultsSubsection = paper?.subsections.find((subsection) => subsection.kind === 'results')

    assert.ok(methodSubsection, 'expected a method subsection')
    assert.ok(resultsSubsection, 'expected a results subsection')
    assert.doesNotMatch(methodSubsection?.content ?? '', /当前保留了 3 张图/u)
    assert.doesNotMatch(resultsSubsection?.content ?? '', /Figure 2 provided the key visual evidence/iu)
    assert.match(methodSubsection?.content ?? '', /^方法上，/u)
    assert.match(resultsSubsection?.content ?? '', /^结果上，/u)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
  }
})

test('deep article generator strips low-signal extraction sentences even when they are appended inside a paragraph', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  try {
    const result = await generateNodeEnhancedArticle('node-editorial-fragment-cleanup', {
      nodeContext: {
        title: 'Driving signal disentanglement',
        stageIndex: 2,
        summary: 'Keeps internal extractor notes out of the final article paragraphs.',
        explanation: 'Low-signal helper sentences should be removed even when they appear after a valid editorial claim.',
      },
      papers: [
        {
          id: 'paper-editorial-fragment-cleanup',
          title: 'Signal Disentanglement for Driving Policies',
          titleEn: 'Signal Disentanglement for Driving Policies',
          authors: ['Author A'],
          summary:
            'This paper separates structure, identity, and ego-action before a planner recombines them.',
          explanation:
            `This paper matters for later planning interfaces. \u5f53\u524d\u8fd8\u6ca1\u6709\u4fdd\u7559\u4e0b\u6765\u7684\u56fe\u3001\u8868\u6216\u516c\u5f0f\u8bc1\u636e\uff0c\u53ea\u80fd\u5148\u6839\u636e\u6458\u8981\u4e0e\u6b63\u6587\u7247\u6bb5\u91cd\u5efa\u8bba\u8bc1\u94fe\u3002`,
          abstract: 'A paper about disentangling control signals for driving.',
          publishedAt: '2025-04-02T00:00:00.000Z',
          paper_sections: [
            {
              id: 'paper-editorial-fragment-cleanup-method',
              editorialTitle: 'Method',
              sourceSectionTitle: 'Method',
              paragraphs:
                `The method separates structure, identity, and ego-action before the planner recombines them. \u5f53\u524d\u4fdd\u7559\u4e86 25 \u5f20\u56fe\u30011 \u5f20\u8868\u548c 2 \u4e2a\u516c\u5f0f\uff0c\u53ef\u7528\u4e8e\u628a\u65b9\u6cd5\u3001\u5b9e\u9a8c\u4e0e\u7ed3\u679c\u91cd\u65b0\u843d\u56de\u8bc1\u636e\u5c42\u3002`,
            },
            {
              id: 'paper-editorial-fragment-cleanup-results',
              editorialTitle: 'Results',
              sourceSectionTitle: 'Results',
              paragraphs:
                'The results show that disentanglement reduces cross-signal interference in complex scenes. Figure 2 provided the key visual evidence.',
            },
          ],
          figures: [],
          tables: [],
          formulas: [],
        },
      ],
    })

    const paper = paperArticles(result.flow)[0]
    const narrative = [
      paper?.introduction ?? '',
      ...(paper?.subsections.map((subsection) => subsection.content) ?? []),
      paper?.conclusion ?? '',
    ].join('\n\n')

    assert.ok(paper, 'expected one paper article block')
    assert.doesNotMatch(
      narrative,
      /\u5f53\u524d\u4fdd\u7559\u4e86\s*25\s*\u5f20\u56fe/u,
    )
    assert.doesNotMatch(
      narrative,
      /\u5f53\u524d\u8fd8\u6ca1\u6709\u4fdd\u7559\u4e0b\u6765\u7684\u56fe\u3001\u8868\u6216\u516c\u5f0f\u8bc1\u636e/u,
    )
    assert.doesNotMatch(narrative, /Figure 2 provided the key visual evidence/iu)
    assert.match(narrative, /\u65b9\u6cd5\u4e0a/u)
    assert.match(narrative, /\u7ed3\u679c\u4e0a/u)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
  }
})
