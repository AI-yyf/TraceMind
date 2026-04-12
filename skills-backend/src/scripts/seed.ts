/**
 * 数据库 Seed 脚本
 * 填充示例数据用于演示
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('开始填充示例数据...')

  await prisma.node_papers.deleteMany()
  await prisma.figures.deleteMany()
  await prisma.tables.deleteMany()
  await prisma.formulas.deleteMany()
  await prisma.paper_sections.deleteMany()
  await prisma.research_nodes.deleteMany()
  await prisma.papers.deleteMany()
  await prisma.topic_stages.deleteMany()
  await prisma.topics.deleteMany()

  console.log('已清空现有数据')

  const topic = await prisma.topics.create({
    data: {
      id: 'topic-1',
      nameZh: '自动驾驶世界模型',
      nameEn: 'Autonomous Driving World Models',
      focusLabel: '端到端自动驾驶',
      summary: '研究自动驾驶领域中基于世界模型的端到端学习方法',
      description: '本主题追踪自动驾驶领域从传统模块化方法到端到端世界模型的重要演进。',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const stages = await Promise.all([
    prisma.topic_stages.create({
      data: { id: crypto.randomUUID(), topicId: topic.id, order: 1, name: '问题提出', description: '自动驾驶的挑战与机遇' },
    }),
    prisma.topic_stages.create({
      data: { id: crypto.randomUUID(), topicId: topic.id, order: 2, name: '基础方法', description: '早期端到端自动驾驶探索' },
    }),
    prisma.topic_stages.create({
      data: { id: crypto.randomUUID(), topicId: topic.id, order: 3, name: '技术改进', description: '世界模型与仿真环境' },
    }),
    prisma.topic_stages.create({
      data: { id: crypto.randomUUID(), topicId: topic.id, order: 4, name: '应用拓展', description: '多模态融合与泛化' },
    }),
    prisma.topic_stages.create({
      data: { id: crypto.randomUUID(), topicId: topic.id, order: 5, name: '综合分析', description: '最新进展与未来方向' },
    }),
  ])

  console.log('创建主题: ' + topic.nameZh)
  console.log('创建 ' + stages.length + ' 个阶段')

  const papersData = [
    {
      id: 'paper-1',
      title: '通过不确定性实现端到端自动驾驶',
      titleZh: '通过不确定性实现端到端自动驾驶',
      titleEn: 'End-to-End Driving Through Uncertainty',
      authors: JSON.stringify(['王晨奕', '雷霆']),
      published: new Date('2022-03-15'),
      summary: '提出了一种基于不确定性估计的端到端自动驾驶方法，能够在复杂场景中做出稳健的决策。',
      explanation: '这篇论文是端到端自动驾驶领域的重要早期工作，证明了深度学习能够直接从摄像头图像学习驾驶策略。',
      arxivUrl: 'https://arxiv.org/abs/2203.00001',
      citationCount: 156,
      status: 'published',
      tags: JSON.stringify(['端到端', '不确定性', '自动驾驶']),
      figurePaths: JSON.stringify([]),
    },
    {
      id: 'paper-2',
      title: '自动驾驶世界模型',
      titleZh: '自动驾驶世界模型',
      titleEn: 'World Models for Autonomous Driving',
      authors: JSON.stringify(['王小明', '陈丽']),
      published: new Date('2023-06-20'),
      summary: '提出了一个用于自动驾驶的世界模型，能够预测未来场景并辅助决策。',
      explanation: '这篇论文首次将世界模型概念引入自动驾驶领域，世界模型能够学习环境的动态特性。',
      arxivUrl: 'https://arxiv.org/abs/2306.00001',
      citationCount: 89,
      status: 'published',
      tags: JSON.stringify(['世界模型', '预测', '仿真']),
      figurePaths: JSON.stringify([]),
    },
    {
      id: 'paper-3',
      title: 'UniAD：统一自动驾驶框架',
      titleZh: 'UniAD：统一自动驾驶框架',
      titleEn: 'UniAD: Unified Autonomous Driving',
      authors: JSON.stringify(['李逸飞', '周伟']),
      published: new Date('2023-11-10'),
      summary: '提出了一个统一的自动驾驶框架，整合感知、预测和规划模块。',
      explanation: '这是近年来最具影响力的自动驾驶框架之一，通过设计专门的注意力机制实现对周围环境的联合建模。',
      arxivUrl: 'https://arxiv.org/abs/2311.00001',
      citationCount: 234,
      status: 'published',
      tags: JSON.stringify(['统一框架', '感知', '预测', '规划']),
      figurePaths: JSON.stringify([]),
    },
    {
      id: 'paper-4',
      title: 'GAIA-1：自动驾驶生成式世界模型',
      titleZh: 'GAIA-1：自动驾驶生成式世界模型',
      titleEn: 'GAIA-1: Generative World Model for Autonomous Driving',
      authors: JSON.stringify(['OpenDriveLab']),
      published: new Date('2024-02-28'),
      summary: '提出了一个生成式世界模型，能够生成逼真的驾驶场景并进行仿真测试。',
      explanation: '这是世界模型在自动驾驶领域的重大突破，不仅能预测未来，还能生成逼真的视频场景。',
      arxivUrl: 'https://arxiv.org/abs/2402.00001',
      citationCount: 67,
      status: 'published',
      tags: JSON.stringify(['生成式模型', '世界模型', '仿真']),
      figurePaths: JSON.stringify([]),
    },
    {
      id: 'paper-5',
      title: 'LMDrive：语言增强的端到端驾驶',
      titleZh: 'LMDrive：语言增强的端到端驾驶',
      titleEn: 'LMDrive: Language-Enabled End-to-End Driving',
      authors: JSON.stringify(['DriveLM团队']),
      published: new Date('2024-05-15'),
      summary: '提出了一个语言增强的端到端驾驶系统，能够理解和响应自然语言指令。',
      explanation: '这是多模态大语言模型在自动驾驶领域的典型应用，系统能够理解自然语言指令并做出相应决策。',
      arxivUrl: 'https://arxiv.org/abs/2405.00001',
      citationCount: 45,
      status: 'published',
      tags: JSON.stringify(['大语言模型', '多模态', '语言指令']),
      figurePaths: JSON.stringify([]),
    },
  ]

  for (const paperData of papersData) {
    await prisma.papers.create({
      data: {
        ...paperData,
        topicId: topic.id,
        pdfPath: null,
        coverPath: null,
        tablePaths: JSON.stringify([]),
        contentMode: 'editorial',
        updatedAt: new Date(),
      },
    })
  }

  console.log('创建 ' + papersData.length + ' 篇论文')

  const nodesData = [
    {
      id: 'node-1',
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '端到端自动驾驶的诞生',
      nodeSubtitle: '问题与动机',
      nodeSummary: '端到端自动驾驶方法首次被提出，旨在通过单一神经网络直接从原始传感器输入学习到车辆控制输出。',
      nodeExplanation: '这一阶段的研究主要解决端到端自动驾驶的基本可行性问题。研究表明，深度学习能够直接从摄像头图像学习驾驶策略，证明了从感知到控制端到端学习的潜力。',
      primaryPaperId: 'paper-1',
      isMergeNode: false,
      status: 'canonical',
      fullContent: JSON.stringify({
        summary: {
          oneLine: '端到端自动驾驶概念的首次提出与验证',
          keyContribution: '证明了单一神经网络可以完成从感知到控制的全流程',
          mainResults: ['提出基于不确定性估计的端到端方法', '在模拟环境中验证了方法有效性', '为后续研究奠定基础'],
        },
      }),
    },
    {
      id: 'node-2',
      topicId: topic.id,
      stageIndex: 2,
      nodeLabel: '世界模型的引入',
      nodeSubtitle: '预测与仿真',
      nodeSummary: '世界模型被引入自动驾驶领域，用于预测未来场景并辅助决策制定。',
      nodeExplanation: '这一阶段的核心创新在于引入世界模型。世界模型能够学习环境的动态特性，预测未来状态，从而帮助自动驾驶系统做出更好的规划决策。',
      primaryPaperId: 'paper-2',
      isMergeNode: false,
      status: 'canonical',
      fullContent: JSON.stringify({
        summary: {
          oneLine: '世界模型成为自动驾驶预测与仿真的核心组件',
          keyContribution: '提出可预测未来的世界模型架构',
          mainResults: ['实现基于世界模型的场景预测', '显著提升规划决策质量', '为仿真测试提供基础'],
        },
      }),
    },
    {
      id: 'node-3',
      topicId: topic.id,
      stageIndex: 3,
      nodeLabel: '统一框架的突破',
      nodeSubtitle: '感知预测规划一体化',
      nodeSummary: 'UniAD提出统一框架，将感知、预测、规划等多个任务整合到单一模型中。',
      nodeExplanation: 'UniAD是自动驾驶领域的里程碑工作。它通过设计专门的注意力机制，实现了对周围环境的联合建模，以及对未来轨迹的准确预测和规划。',
      primaryPaperId: 'paper-3',
      isMergeNode: true,
      status: 'canonical',
      fullContent: JSON.stringify({
        summary: {
          oneLine: 'UniAD实现自动驾驶Tasks级别的统一建模',
          keyContribution: '首个同时完成感知、预测、规划三大任务的全栈框架',
          mainResults: ['提出Query形式的感知输出', '实现端到端轨迹预测', '在nuScenes上取得最优成绩'],
        },
      }),
    },
    {
      id: 'node-4',
      topicId: topic.id,
      stageIndex: 4,
      nodeLabel: '生成式世界模型',
      nodeSubtitle: '真实场景生成',
      nodeSummary: '生成式世界模型能够生成逼真的驾驶场景，为自动驾驶训练提供无限数据。',
      nodeExplanation: 'GAIA-1代表生成式AI在自动驾驶领域的突破。它不仅能预测未来，还能生成逼真的视频场景，为仿真和训练提供了全新的可能性。',
      primaryPaperId: 'paper-4',
      isMergeNode: false,
      status: 'canonical',
      fullContent: JSON.stringify({
        summary: {
          oneLine: '生成式世界模型开启自动驾驶数据生成新范式',
          keyContribution: '实现高质量驾驶场景视频生成',
          mainResults: ['支持长时序场景生成', '保持主体一致性', '可用于仿真训练'],
        },
      }),
    },
    {
      id: 'node-5',
      topicId: topic.id,
      stageIndex: 5,
      nodeLabel: '多模态大模型赋能',
      nodeSubtitle: '语言指令理解',
      nodeSummary: '大语言模型为自动驾驶带来语义理解和指令跟随能力。',
      nodeExplanation: 'LMDrive展示了大语言模型与端到端驾驶的结合。系统能够理解自然语言指令，如"在那个红绿灯前停下"，并做出相应决策。',
      primaryPaperId: 'paper-5',
      isMergeNode: false,
      status: 'canonical',
      fullContent: JSON.stringify({
        summary: {
          oneLine: '大语言模型为自动驾驶带来语义理解和自然交互能力',
          keyContribution: '首次实现自然语言指令的端到端控制',
          mainResults: ['支持复杂导航指令', '提升可解释性', '增强人机协作'],
        },
      }),
    },
  ]

  for (const nodeData of nodesData) {
    await prisma.research_nodes.create({
      data: {
        ...nodeData,
        updatedAt: new Date(),
      },
    })
  }

  await prisma.node_papers.createMany({
    data: [
      { id: crypto.randomUUID(), nodeId: 'node-1', paperId: 'paper-1', order: 0 },
      { id: crypto.randomUUID(), nodeId: 'node-2', paperId: 'paper-2', order: 0 },
      { id: crypto.randomUUID(), nodeId: 'node-3', paperId: 'paper-3', order: 0 },
      { id: crypto.randomUUID(), nodeId: 'node-4', paperId: 'paper-4', order: 0 },
      { id: crypto.randomUUID(), nodeId: 'node-5', paperId: 'paper-5', order: 0 },
    ],
  })

  console.log('创建 ' + nodesData.length + ' 个研究节点')
  console.log('创建节点-论文关联')

  await prisma.model_configs.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        modelId: 'gpt-4o-vision',
        name: 'GPT-4o Vision',
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: '',
        parameters: JSON.stringify({ temperature: 0.3, maxTokens: 4000, topP: 1 }),
        capabilities: JSON.stringify(['vision', 'text', 'analysis']),
        enabled: true,
        updatedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        modelId: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        apiKey: '',
        parameters: JSON.stringify({ temperature: 0.4, maxTokens: 8000, topP: 1 }),
        capabilities: JSON.stringify(['text', 'code', 'math']),
        enabled: true,
        updatedAt: new Date(),
      },
    ],
  })

  await prisma.task_mappings.createMany({
    data: [
      { id: crypto.randomUUID(), taskName: 'figureAnalysis', modelId: 'gpt-4o-vision' },
      { id: crypto.randomUUID(), taskName: 'contentGeneration', modelId: 'claude-3-opus' },
      { id: crypto.randomUUID(), taskName: 'formulaRecognition', modelId: 'gpt-4o-vision' },
      { id: crypto.randomUUID(), taskName: 'ocr', modelId: 'gpt-4o-vision' },
      { id: crypto.randomUUID(), taskName: 'tableExtraction', modelId: 'gpt-4o-vision' },
    ],
  })

  console.log('创建多模态模型配置')
  console.log('')
  console.log('示例数据填充完成！')
  console.log('')
  console.log('主题：自动驾驶世界模型')
  console.log('论文：' + papersData.length + ' 篇')
  console.log('节点：' + nodesData.length + ' 个')
  console.log('阶段：' + stages.length + ' 个')
}

main()
  .catch((e) => {
    console.error('Seed失败：', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
