import { PrismaClient } from '@prisma/client'

import { loadTopicDefinitions } from '../../topic-config'
import {
  ensureConfiguredTopicMaterialized,
  pruneLegacySeedTopics,
} from '../services/topics/topic-config-sync'

const prisma = new PrismaClient()

const TOPIC_SYSTEM_CONFIG_PREFIXES = [
  'topic:',
  'topic-stage-config:v1:',
  'alpha:topic-artifact:',
  'alpha:reader-artifact:',
  'generation-artifact-index:v1:',
  'generation-judgments:v1:',
  'topic-research-world:v1:',
] as const

async function resetTopicState() {
  await prisma.node_papers.deleteMany()
  await prisma.figures.deleteMany()
  await prisma.tables.deleteMany()
  await prisma.formulas.deleteMany()
  await prisma.paper_sections.deleteMany()
  await prisma.paper_candidate_pool.deleteMany()
  await prisma.research_nodes.deleteMany()
  await prisma.papers.deleteMany()
  await prisma.topic_stages.deleteMany()
  await prisma.topic_guidance_ledgers.deleteMany()
  await prisma.topic_session_memories.deleteMany()
  await prisma.research_pipeline_states.deleteMany()
  await prisma.research_world_snapshots.deleteMany()
  await prisma.topics.deleteMany()
  await prisma.system_configs.deleteMany({
    where: {
      OR: TOPIC_SYSTEM_CONFIG_PREFIXES.map((prefix) => ({
        key: { startsWith: prefix },
      })),
    },
  })
}

async function seedModelCatalog() {
  await prisma.task_mappings.deleteMany()
  await prisma.model_configs.deleteMany()

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
}

async function seedCanonicalTopics() {
  const topicDefinitions = loadTopicDefinitions()

  for (const topicDefinition of topicDefinitions) {
    await ensureConfiguredTopicMaterialized(topicDefinition.id)
  }

  return topicDefinitions
}

async function main() {
  console.log('Seeding canonical backend data...')

  await resetTopicState()
  await pruneLegacySeedTopics()
  await seedModelCatalog()
  const topicDefinitions = await seedCanonicalTopics()

  const [topicCount, paperCount, nodeCount, stageCount] = await Promise.all([
    prisma.topics.count(),
    prisma.papers.count(),
    prisma.research_nodes.count(),
    prisma.topic_stages.count(),
  ])

  console.log('')
  console.log('Seeded canonical topics:')
  for (const topicDefinition of topicDefinitions) {
    console.log(`- ${topicDefinition.id}: ${topicDefinition.nameEn}`)
  }
  console.log('')
  console.log('=== Seed Summary ===')
  console.log(`topics: ${topicCount}`)
  console.log(`papers: ${paperCount}`)
  console.log(`nodes: ${nodeCount}`)
  console.log(`stages: ${stageCount}`)
}

void main()
  .catch((error) => {
    console.error('Seed failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
