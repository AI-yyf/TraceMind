import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { __testing } from '../routes/topic-gen'
import { createApp } from '../server'

async function withDisabledModelConfig(userId: string, run: () => Promise<void>) {
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })

  await prisma.systemConfig.upsert({
    where: { key: configKey },
    update: { value: JSON.stringify({ language: null, multimodal: null }) },
    create: { key: configKey, value: JSON.stringify({ language: null, multimodal: null }) },
  })

  try {
    await run()
  } finally {
    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
}

async function withServer(run: (origin: string) => Promise<void>) {
  const app = createApp()
  const server = createServer(app)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not resolve test server address.')
  }

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('POST /api/topic-gen/preview returns a multilingual preview for non-zh source languages', async () => {
  const userId = 'test-topic-gen-preview'
  await withDisabledModelConfig(userId, async () => {
    await withServer(async (origin) => {
      const previewResponse = await fetch(`${origin}/api/topic-gen/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          sourceLanguage: 'fr',
          sourceDescription:
            'Suivre les agents scientifiques multimodaux capables de planifier, de mémoriser et de justifier leurs décisions expérimentales.',
          descriptionByLanguage: {
            en: 'Track multimodal scientific agents that can plan, remember prior evidence, and justify experimental decisions.',
            zh: '追踪能够规划、保留记忆并解释实验判断的多模态科学研究智能体。',
          },
          language: 'fr',
        }),
      })

      assert.equal(previewResponse.status, 200)

      const previewPayload = (await previewResponse.json()) as {
        success: boolean
        data: {
          primaryLanguage: string
          recommendedStages: number
          locales: Record<string, { name: string; summary: string; focusLabel: string }>
        }
      }

      assert.equal(previewPayload.success, true)
      assert.equal(previewPayload.data.primaryLanguage, 'fr')
      assert.equal(previewPayload.data.recommendedStages >= 3, true)
      assert.equal(previewPayload.data.recommendedStages <= 5, true)
      assert.equal(previewPayload.data.locales.fr.name.length > 0, true)
      assert.equal(previewPayload.data.locales.zh.summary.length > 0, true)
      assert.equal(previewPayload.data.locales.ru.focusLabel.length > 0, true)
    })
  })
})

test('POST /api/topic-gen/create stores multilingual localization and exposes it in topic endpoints', async () => {
  const userId = 'test-topic-gen-create'
  await withDisabledModelConfig(userId, async () => {
    await withServer(async (origin) => {
      const createResponse = await fetch(`${origin}/api/topic-gen/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          sourceLanguage: 'ja',
          sourceDescription:
            'Track retrieval-augmented scientific agents for materials discovery, focusing on planning, memory, and experimental evidence.',
          anchorDescriptions: {
            en: 'Focus on multilingual topic creation for scientific agent systems with planning, memory, and evidence tracking.',
            zh: '聚焦具备规划、记忆与证据追踪能力的科研智能体主题创建。',
          },
          descriptionByLanguage: {
            ru: 'Отслеживать научных агентов для материаловедения с акцентом на планирование, память и экспериментальные доказательства.',
          },
          language: 'ja',
        }),
      })

      assert.equal(createResponse.status, 201)

      const createPayload = (await createResponse.json()) as {
        success: boolean
        data: {
          topicId: string
          blueprint: {
            topic: {
              primaryLanguage: string
              locales: Record<string, { name: string }>
            }
          }
        }
      }

      assert.equal(createPayload.success, true)
      const topicId = createPayload.data.topicId
      assert.equal(typeof createPayload.data.blueprint.topic.locales.ja.name, 'string')
      assert.equal(typeof createPayload.data.blueprint.topic.locales.ru.name, 'string')
      assert.equal(createPayload.data.blueprint.topic.primaryLanguage, 'ja')

      try {
        const [topicResponse, viewModelResponse] = await Promise.all([
          fetch(`${origin}/api/topics/${topicId}`),
          fetch(`${origin}/api/topics/${topicId}/view-model`),
        ])

        assert.equal(topicResponse.status, 200)
        assert.equal(viewModelResponse.status, 200)

        const topicPayload = (await topicResponse.json()) as {
          success: boolean
          data: {
            localization: {
              languageMode: string
              topic: {
                locales: Record<string, { name: string }>
              }
            } | null
          }
        }

        const viewModelPayload = (await viewModelResponse.json()) as {
          success: boolean
          data: {
            localization: {
              topic: {
                locales: Record<string, { name: string }>
              }
              stages: Array<{
                locales: Record<string, { name: string; description: string }>
              }>
            } | null
          }
        }

        assert.equal(topicPayload.success, true)
        assert.equal(viewModelPayload.success, true)
        assert.equal(topicPayload.data.localization?.languageMode, 'ja')
        assert.equal(typeof topicPayload.data.localization?.topic.locales.ja.name, 'string')
        assert.equal(typeof viewModelPayload.data.localization?.topic.locales.fr.name, 'string')
        assert.equal(
          typeof viewModelPayload.data.localization?.stages[0]?.locales.es.description,
          'string',
        )

        const creationRecord = await prisma.systemConfig.findUnique({
          where: { key: `topic:${topicId}:creation` },
        })

        assert.ok(creationRecord)
        const creationPayload = JSON.parse(creationRecord.value) as {
          languageMode: string
          sourceLanguage: string
          sourceDescription: string
          anchorDescriptions?: Record<string, string>
          descriptionByLanguage?: Record<string, string>
        }

        assert.equal(creationPayload.languageMode, 'ja')
        assert.equal(creationPayload.sourceLanguage, 'ja')
        assert.equal(Boolean(creationPayload.descriptionByLanguage?.ja?.length), true)
        assert.equal(Boolean(creationPayload.descriptionByLanguage?.ru?.length), true)
        assert.equal(Boolean(creationPayload.anchorDescriptions?.en?.length), true)
      } finally {
        await new Promise((resolve) => setTimeout(resolve, 500))
        await prisma.systemConfig.deleteMany({
          where: {
            key: {
              startsWith: `topic:${topicId}:`,
            },
          },
        })
        await prisma.topic.delete({
          where: { id: topicId },
        })
      }
    })
  })
})

test('POST /api/topic-gen/create keeps the preview-first flow compatible with multilingual localization', async () => {
  const userId = 'test-topic-gen-preview-fast-create'
  await withDisabledModelConfig(userId, async () => {
    await withServer(async (origin) => {
      const previewResponse = await fetch(`${origin}/api/topic-gen/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          sourceLanguage: 'de',
          sourceDescription:
            'Verfolge wissenschaftliche Agentensysteme, die Planung, Gedächtnis und evidenzbasierte Korrektur in einer fortlaufenden Forschungsschleife verbinden.',
          anchorDescriptions: {
            en: 'Track scientific agent systems that combine planning, memory, and evidence-grounded correction in a continuous research loop.',
            zh: '追踪把规划、记忆与证据校正整合进持续研究回路的科研智能体系统。',
          },
          language: 'de',
        }),
      })

      assert.equal(previewResponse.status, 200)
      const previewPayload = (await previewResponse.json()) as {
        success: boolean
        data: Record<string, unknown>
      }
      assert.equal(previewPayload.success, true)

      const createResponse = await fetch(`${origin}/api/topic-gen/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          sourceLanguage: 'de',
          sourceDescription:
            'Verfolge wissenschaftliche Agentensysteme, die Planung, Gedächtnis und evidenzbasierte Korrektur in einer fortlaufenden Forschungsschleife verbinden.',
          anchorDescriptions: {
            en: 'Track scientific agent systems that combine planning, memory, and evidence-grounded correction in a continuous research loop.',
            zh: '追踪把规划、记忆与证据校正整合进持续研究回路的科研智能体系统。',
          },
          language: 'de',
          preview: previewPayload.data,
        }),
      })

      assert.equal(createResponse.status, 201)

      const createPayload = (await createResponse.json()) as {
        success: boolean
        data: {
          topicId: string
          blueprint: {
            topic: {
              locales: Record<string, { name: string; summary: string }>
            }
            stages: Array<{
              locales: Record<string, { name: string; description: string }>
            }>
          }
        }
      }

      assert.equal(createPayload.success, true)
      const topicId = createPayload.data.topicId

      try {
        assert.equal(typeof createPayload.data.blueprint.topic.locales.de.name, 'string')
        assert.equal(typeof createPayload.data.blueprint.topic.locales.zh.summary, 'string')
        assert.equal(typeof createPayload.data.blueprint.topic.locales.ru.name, 'string')
        assert.equal(
          typeof createPayload.data.blueprint.stages[0]?.locales.fr.description,
          'string',
        )

        const topicResponse = await fetch(`${origin}/api/topics/${topicId}`)
        assert.equal(topicResponse.status, 200)

        const topicPayload = (await topicResponse.json()) as {
          success: boolean
          data: {
            localization: {
              topic: {
                locales: Record<string, { name: string; summary: string }>
              }
              stages: Array<{
                locales: Record<string, { name: string; description: string }>
              }>
            } | null
          }
        }

        assert.equal(topicPayload.success, true)
        assert.equal(typeof topicPayload.data.localization?.topic.locales.es.name, 'string')
        assert.equal(
          typeof topicPayload.data.localization?.stages[0]?.locales.ja.description,
          'string',
        )
      } finally {
        await new Promise((resolve) => setTimeout(resolve, 500))
        await prisma.systemConfig.deleteMany({
          where: {
            key: {
              startsWith: `topic:${topicId}:`,
            },
          },
        })
        await prisma.topic.delete({
          where: { id: topicId },
        })
      }
    })
  })
})

test('openai-compatible topic generation profiles keep structured JSON generation in single-pass mode', () => {
  const compatibleProfile = __testing.buildTopicGenerationPassProfile(
    { provider: 'openai_compatible' },
    3,
  )
  const openAIProfile = __testing.buildTopicGenerationPassProfile(
    { provider: 'openai' },
    3,
  )

  assert.deepEqual(compatibleProfile, {
    requestJson: true,
    attemptLimit: 1,
  })
  assert.deepEqual(openAIProfile, {
    requestJson: true,
    attemptLimit: 3,
  })
})

test('preview locale repair detects low-diversity compatible preview payloads', () => {
  const shouldRepair = __testing.previewNeedsLocaleRepair(
    {
      nameZh: '科研智能体工作台',
      nameEn: 'Scientific Agent Workbench',
      keywords: [{ zh: '科研智能体', en: 'scientific agents' }],
      summary: 'Scientific Agent Workbench | 科研智能体工作台',
      summaryZh: '追踪科研智能体如何结合规划、记忆与证据。',
      summaryEn: 'Track how scientific agents combine planning, memory, and evidence.',
      recommendedStages: 4,
      focusLabel: 'Scientific Agent Workbench | 科研智能体工作台',
      focusLabelZh: '科研智能体工作台',
      focusLabelEn: 'Scientific Agent Workbench',
      primaryLanguage: 'zh',
      locales: {
        zh: {
          name: '科研智能体工作台',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: '科研智能体工作台',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
        en: {
          name: 'Scientific Agent Workbench',
          summary: 'Track how scientific agents combine planning, memory, and evidence.',
          focusLabel: 'Scientific Agent Workbench',
          description: 'Track how scientific agents combine planning, memory, and evidence.',
        },
        ja: {
          name: 'Scientific Agent Workbench',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: 'Scientific Agent Workbench',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
        ko: {
          name: 'Scientific Agent Workbench',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: 'Scientific Agent Workbench',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
        de: {
          name: 'Scientific Agent Workbench',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: 'Scientific Agent Workbench',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
        fr: {
          name: 'Scientific Agent Workbench',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: 'Scientific Agent Workbench',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
        es: {
          name: 'Scientific Agent Workbench',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: 'Scientific Agent Workbench',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
        ru: {
          name: 'Scientific Agent Workbench',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: 'Scientific Agent Workbench',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
      },
    },
    'zh',
  )

  assert.equal(shouldRepair, true)
})

test('preview locale repair ignores previews that already contain distinct locale copy', () => {
  const shouldRepair = __testing.previewNeedsLocaleRepair(
    {
      nameZh: '科研智能体工作台',
      nameEn: 'Scientific Agent Workbench',
      keywords: [{ zh: '科研智能体', en: 'scientific agents' }],
      summary: 'Scientific Agent Workbench | 科研智能体工作台',
      summaryZh: '追踪科研智能体如何结合规划、记忆与证据。',
      summaryEn: 'Track how scientific agents combine planning, memory, and evidence.',
      recommendedStages: 4,
      focusLabel: 'Scientific Agent Workbench | 科研智能体工作台',
      focusLabelZh: '科研智能体工作台',
      focusLabelEn: 'Scientific Agent Workbench',
      primaryLanguage: 'zh',
      locales: {
        zh: {
          name: '科研智能体工作台',
          summary: '追踪科研智能体如何结合规划、记忆与证据。',
          focusLabel: '科研智能体工作台',
          description: '追踪科研智能体如何结合规划、记忆与证据。',
        },
        en: {
          name: 'Scientific Agent Workbench',
          summary: 'Track how scientific agents combine planning, memory, and evidence.',
          focusLabel: 'Scientific Agent Workbench',
          description: 'Track how scientific agents combine planning, memory, and evidence.',
        },
        ja: {
          name: '科学エージェントの作業台',
          summary: '科学エージェントが計画、記憶、証拠をどう結び付けるかを追跡する。',
          focusLabel: '科学エージェント',
          description: '科学エージェントが計画、記憶、証拠をどう結び付けるかを追跡する。',
        },
        ko: {
          name: '과학 에이전트 워크벤치',
          summary: '과학 에이전트가 계획, 기억, 증거를 어떻게 결합하는지 추적한다.',
          focusLabel: '과학 에이전트',
          description: '과학 에이전트가 계획, 기억, 증거를 어떻게 결합하는지 추적한다.',
        },
        de: {
          name: 'Workbench fuer Wissenschaftsagenten',
          summary: 'Verfolgt, wie wissenschaftliche Agenten Planung, Gedaechtnis und Evidenz verbinden.',
          focusLabel: 'Wissenschaftsagenten',
          description: 'Verfolgt, wie wissenschaftliche Agenten Planung, Gedaechtnis und Evidenz verbinden.',
        },
        fr: {
          name: 'Atelier des agents scientifiques',
          summary: 'Suit comment les agents scientifiques relient planification, memoire et preuves.',
          focusLabel: 'Agents scientifiques',
          description: 'Suit comment les agents scientifiques relient planification, memoire et preuves.',
        },
        es: {
          name: 'Banco de agentes cientificos',
          summary: 'Sigue como los agentes cientificos unen planificacion, memoria y evidencia.',
          focusLabel: 'Agentes cientificos',
          description: 'Sigue como los agentes cientificos unen planificacion, memoria y evidencia.',
        },
        ru: {
          name: 'Nauchnye agenty',
          summary: 'Otslezhivaet, kak nauchnye agenty soedinyayut planirovanie, pamyat i dokazatelstva.',
          focusLabel: 'Nauchnye agenty',
          description: 'Otslezhivaet, kak nauchnye agenty soedinyayut planirovanie, pamyat i dokazatelstva.',
        },
      },
    },
    'zh',
  )

  assert.equal(shouldRepair, false)
})

test('preview fallback descriptions prefer English anchors for third-language locales', () => {
  const description = __testing.pickInputDescription(
    {
      sourceLanguage: 'zh',
      sourceDescription: '追踪多模态科研智能体如何把规划、记忆、证据整合进同一个研究工作台。',
      languageMode: 'zh',
      anchorDescriptions: {},
      descriptionByLanguage: {
        zh: '追踪多模态科研智能体如何把规划、记忆、证据整合进同一个研究工作台。',
        en: 'Track how multimodal scientific agents combine planning, memory, and evidence in one workbench.',
      },
    },
    'de',
  )

  assert.equal(
    description,
    'Track how multimodal scientific agents combine planning, memory, and evidence in one workbench.',
  )
})
