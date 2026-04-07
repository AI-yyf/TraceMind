import assert from 'node:assert/strict'
import test from 'node:test'

import { collectNodeRelatedPaperIds } from '../services/topics/node-paper-association'

function createPaper(args: {
  id: string
  title: string
  summary: string
  explanation?: string
  figures?: number
  cover?: boolean
  publishedAt?: string
}) {
  return {
    id: args.id,
    title: args.title,
    titleZh: args.title,
    titleEn: args.title,
    summary: args.summary,
    explanation: args.explanation ?? args.summary,
    published: new Date(args.publishedAt ?? '2026-04-01T00:00:00.000Z'),
    coverPath: args.cover ? `uploads/${args.id}/cover.png` : null,
    figures: Array.from({ length: args.figures ?? 0 }, (_, index) => ({
      imagePath: `uploads/${args.id}/figure-${index + 1}.png`,
      caption: index === 0 ? 'method overview' : 'result figure',
    })),
  }
}

test('collectNodeRelatedPaperIds broadens world-model nodes toward visual, concept-aligned papers', () => {
  const papers = [
    createPaper({
      id: 'paper-2',
      title: 'Autonomous Driving World Models',
      summary: 'A seed world model paper for autonomous driving.',
    }),
    createPaper({
      id: 'kinematics-paper',
      title: 'Kinematics-Aware Latent World Models for Data-Efficient Autonomous Driving',
      summary:
        'A kinematics-aware latent world model that improves long-horizon imagination and data efficiency.',
      figures: 5,
      cover: true,
      publishedAt: '2026-03-05T00:00:00.000Z',
    }),
    createPaper({
      id: 'dynflow-paper',
      title: 'DynFlowDrive: Flow-Based Dynamic World Modeling for Autonomous Driving',
      summary:
        'A flow-based dynamic world modeling approach for autonomous driving policy learning and planning.',
      figures: 6,
      cover: true,
      publishedAt: '2026-03-18T00:00:00.000Z',
    }),
    createPaper({
      id: 'lane-paper',
      title: 'Adaptive Lane Keeping via Advanced PER-TD3',
      summary:
        'A reinforcement-learning lane-keeping paper without world-model framing.',
      figures: 0,
      cover: false,
      publishedAt: '2025-10-17T00:00:00.000Z',
    }),
  ]

  const relatedIds = collectNodeRelatedPaperIds({
    stageTitle: '世界模型的引入',
    node: {
      primaryPaperId: 'paper-2',
      nodeLabel: '世界模型的引入',
      nodeSubtitle: '预测与仿真',
      nodeSummary:
        '这一阶段把 end-to-end driving 推向 latent world model，通过内部仿真器建模状态转移。',
      nodeExplanation:
        '关键是用 world model、latent state transition 和 kinematics-aware dynamics 来补足直接映射的不足。',
      primaryPaper: {
        title: 'Autonomous Driving World Models',
        titleZh: '自动驾驶世界模型',
        titleEn: 'Autonomous Driving World Models',
      },
      papers: [{ paperId: 'paper-2' }],
    },
    papers,
  })

  assert.equal(relatedIds[0], 'paper-2')
  assert.equal(relatedIds.includes('kinematics-paper'), true)
  assert.equal(relatedIds.includes('dynflow-paper'), true)
  assert.equal(relatedIds.includes('lane-paper'), false)
})

test('collectNodeRelatedPaperIds pulls multimodal, figure-backed papers into thin multimodal nodes', () => {
  const papers = [
    createPaper({
      id: 'paper-5',
      title: 'LMDrive: Language-Enhanced End-to-End Driving',
      summary: 'A seed paper for natural-language-conditioned driving.',
    }),
    createPaper({
      id: 'unidrive-paper',
      title: 'UniDriveDreamer: A Single-Stage Multimodal World Model for Autonomous Driving',
      summary:
        'A single-stage unified multimodal world model that jointly generates video and LiDAR observations.',
      figures: 8,
      cover: true,
      publishedAt: '2026-02-02T00:00:00.000Z',
    }),
    createPaper({
      id: 'survey-paper',
      title: 'Foundation Models in Autonomous Driving: A Survey on Scenario Generation and Scenario Analysis',
      summary:
        'A survey covering world models, multimodal large models, and scenario generation.',
      figures: 1,
      cover: false,
      publishedAt: '2026-01-01T00:00:00.000Z',
    }),
  ]

  const relatedIds = collectNodeRelatedPaperIds({
    stageTitle: '多模态大模型赋能',
    node: {
      primaryPaperId: 'paper-5',
      nodeLabel: '多模态大模型赋能',
      nodeSubtitle: '语言指令理解',
      nodeSummary:
        '这一阶段从生成式世界模型推进到 multimodal understanding，让系统理解语言指令与跨模态场景。',
      nodeExplanation:
        '重点不是单纯大模型，而是 multimodal world model、language instruction 和 unified multimodal generation 的结合。',
      primaryPaper: {
        title: 'LMDrive: Language-Enhanced End-to-End Driving',
        titleZh: 'LMDrive：语言增强的端到端驾驶',
        titleEn: 'LMDrive: Language-Enhanced End-to-End Driving',
      },
      papers: [{ paperId: 'paper-5' }],
    },
    papers,
  })

  assert.equal(relatedIds[0], 'paper-5')
  assert.equal(relatedIds.includes('unidrive-paper'), true)
  assert.equal(relatedIds.includes('survey-paper'), true)
})

test('collectNodeRelatedPaperIds includes papers directly referenced in node prose', () => {
  const papers = [
    createPaper({
      id: 'paper-1',
      title: 'UniAD: Planning-Oriented Autonomous Driving',
      summary: 'Primary planning paper.',
    }),
    createPaper({
      id: 'paper-5',
      title: 'LMDrive: Language-Enhanced End-to-End Driving',
      summary: 'Language-grounded driving paper.',
      figures: 2,
      cover: true,
    }),
  ]

  const relatedIds = collectNodeRelatedPaperIds({
    stageTitle: 'Language-grounded planning',
    node: {
      primaryPaperId: 'paper-1',
      nodeLabel: 'Planning with language',
      nodeSubtitle: 'Grounded control',
      nodeSummary:
        'This node compares paper-1 against paper-5《LMDrive》 to explain how language context changes the planning interface.',
      nodeExplanation:
        'The article prose repeatedly returns to paper-5 as the clearest bridge between planning and instruction-grounded driving.',
      primaryPaper: {
        title: 'UniAD: Planning-Oriented Autonomous Driving',
        titleZh: 'UniAD',
        titleEn: 'UniAD: Planning-Oriented Autonomous Driving',
      },
      papers: [{ paperId: 'paper-1' }],
    },
    papers,
  })

  assert.equal(relatedIds.includes('paper-1'), true)
  assert.equal(relatedIds.includes('paper-5'), true)
})

test('collectNodeRelatedPaperIds respects stage-scoped paper allowlists', () => {
  const papers = [
    createPaper({
      id: 'paper-2',
      title: 'Autonomous Driving World Models',
      summary: 'Seed paper for the node.',
    }),
    createPaper({
      id: 'kinematics-paper',
      title: 'Kinematics-Aware Latent World Models for Autonomous Driving',
      summary: 'Stage-local supporting paper.',
      figures: 4,
      cover: true,
      publishedAt: '2026-03-05T00:00:00.000Z',
    }),
    createPaper({
      id: 'dynflow-paper',
      title: 'DynFlowDrive: Flow-Based Dynamic World Modeling for Autonomous Driving',
      summary: 'Semantically close but outside the active stage bucket.',
      figures: 5,
      cover: true,
      publishedAt: '2026-07-12T00:00:00.000Z',
    }),
  ]

  const relatedIds = collectNodeRelatedPaperIds({
    stageTitle: 'World-model evidence in 2026.03',
    allowedPaperIds: ['paper-2', 'kinematics-paper'],
    node: {
      primaryPaperId: 'paper-2',
      nodeLabel: 'World-model evidence',
      nodeSubtitle: 'Latent prediction and dynamics',
      nodeSummary:
        'This node should only compare the seed paper against same-stage evidence about latent world modeling.',
      nodeExplanation:
        'The later dynflow paper is relevant in content, but it belongs to a later stage and must not leak into this node.',
      primaryPaper: {
        title: 'Autonomous Driving World Models',
        titleZh: '自动驾驶世界模型',
        titleEn: 'Autonomous Driving World Models',
      },
      papers: [{ paperId: 'paper-2' }],
    },
    papers,
  })

  assert.deepEqual(relatedIds, ['paper-2', 'kinematics-paper'])
})
