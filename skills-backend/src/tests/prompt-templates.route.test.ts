import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { createApp } from '../server'

function createConfigRecord(key: string, value: string) {
  return {
    id: `system-config-${key}`,
    key,
    value,
    updatedAt: new Date(),
  }
}

type PromptStudioBundle = {
  templates: Array<{
    id: string
    languageContents: Record<string, { system: string; user: string; notes: string }>
  }>
  productCopies: Array<{
    id: string
    languageContents: Record<string, string>
  }>
  runtime: {
    defaultLanguage: string
    cacheGeneratedOutputs: boolean
    useTopicMemory: boolean
    usePreviousPassOutputs: boolean
    preferMultimodalEvidence: boolean
    maxRetriesPerPass: number
    stageNamingPasses: number
    nodeArticlePasses: number
    paperArticlePasses: number
    selfRefinePasses: number
    researchReportPasses: number
    researchCycleDelayMs: number
    researchStageStallLimit: number
    languageTemperature: number
    multimodalTemperature: number
    maxEvidencePerArticle: number
    contextWindowStages: number
    contextWindowNodes: number
    editorialPolicies: Record<
      string,
      {
        identity: string
        mission: string
        reasoning: string
        style: string
        evidence: string
        industryLens: string
        continuity: string
        refinement: string
      }
    >
  }
  runtimeMeta: {
    key: string
    revision: number
    hash: string
    source: string
    topLevelKeys: string[]
    legacy: boolean
  }
  runtimeHistory: Array<{
    key: string
    revision: number
    hash: string
    source: string
    warnings: string[]
  }>
  externalAgents: {
    rootDir: string
    readmePath: string
    promptGuidePath: string
    superPromptPath: string
    configExamplePath: string
    assets: Array<{
      id: string
      content: string
      path: string
    }>
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

test('GET /api/prompt-templates/studio returns bundle with templates, runtime, and external agent paths', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/prompt-templates/studio`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: PromptStudioBundle
    }

    assert.equal(payload.success, true)
    assert.ok(payload.data.templates.length > 0)
    assert.equal(typeof payload.data.runtime.defaultLanguage, 'string')
    assert.equal(typeof payload.data.runtime.editorialPolicies.zh.identity, 'string')
    assert.equal(payload.data.runtimeMeta.key, 'prompt-studio:runtime:v1')
    assert.ok(payload.data.runtimeMeta.revision >= 0)
    assert.ok(Array.isArray(payload.data.runtimeHistory))
    assert.match(payload.data.externalAgents.rootDir, /external-agents/u)
  })
})

test('GET /api/prompt-templates/runtime-record returns versioned runtime metadata and history', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/prompt-templates/runtime-record`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        runtime: PromptStudioBundle['runtime']
        meta: PromptStudioBundle['runtimeMeta']
        history: PromptStudioBundle['runtimeHistory']
      }
    }

    assert.equal(payload.success, true)
    assert.equal(typeof payload.data.runtime.defaultLanguage, 'string')
    assert.equal(payload.data.meta.key, 'prompt-studio:runtime:v1')
    assert.ok(payload.data.meta.revision >= 0)
    assert.ok(Array.isArray(payload.data.history))
  })
})

test('POST /api/prompt-templates/studio persists edits and can be restored from exported bundle', async () => {
  await withServer(async (origin) => {
    const templateKey = 'prompt-studio:template:v1:topic.nodeCard'
    const runtimeKey = 'prompt-studio:runtime:v1'
    const agentAssetKey = 'prompt-studio:external-agent:v1:promptGuide'
    const [originalTemplateRecord, originalRuntimeRecord] = await Promise.all([
      prisma.system_configs.findUnique({ where: { key: templateKey } }),
      prisma.system_configs.findUnique({ where: { key: runtimeKey } }),
    ])
    const originalAgentAssetRecord = await prisma.system_configs.findUnique({
      where: { key: agentAssetKey },
    })
    const originalPromptGuide = await fs.readFile(
      'F:\\DailyReport-main\\skills-backend\\external-agents\\PROMPT_GUIDE.md',
      'utf8',
    )

    const originalResponse = await fetch(`${origin}/api/prompt-templates/studio`)
    assert.equal(originalResponse.status, 200)
    const originalPayload = (await originalResponse.json()) as {
      success: boolean
      data: PromptStudioBundle
    }
    const original = originalPayload.data

    const targetTemplate = original.templates.find((template) => template.id === 'topic.nodeCard')
    const promptGuideAsset = original.externalAgents.assets.find((asset) => asset.id === 'promptGuide')
    assert.ok(targetTemplate, 'expected built-in topic.nodeCard template')
    assert.ok(promptGuideAsset, 'expected prompt guide asset')

    const patchedSystem = `${targetTemplate!.languageContents.zh.system}\n\n[route-test-marker]`
    const patchedPromptGuide = `${promptGuideAsset!.content}\n\n[route-test-agent-marker]`

    try {
      const saveResponse = await fetch(`${origin}/api/prompt-templates/studio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: [
            {
              id: targetTemplate!.id,
              languageContents: {
                zh: {
                  system: patchedSystem,
                  user: targetTemplate!.languageContents.zh.user,
                  notes: targetTemplate!.languageContents.zh.notes,
                },
              },
            },
          ],
          externalAgentAssets: [
            {
              id: promptGuideAsset!.id,
              content: patchedPromptGuide,
            },
          ],
          runtime: {
            ...original.runtime,
            maxRetriesPerPass: Math.min(6, original.runtime.maxRetriesPerPass + 1),
            selfRefinePasses: Math.min(4, original.runtime.selfRefinePasses + 1),
            researchReportPasses: Math.min(4, original.runtime.researchReportPasses + 1),
            researchCycleDelayMs: Math.min(15000, original.runtime.researchCycleDelayMs + 250),
            researchStageStallLimit: Math.min(6, original.runtime.researchStageStallLimit + 1),
            editorialPolicies: {
              ...original.runtime.editorialPolicies,
              zh: {
                ...original.runtime.editorialPolicies.zh,
                identity: `${original.runtime.editorialPolicies.zh.identity}\n[route-test-policy]`,
              },
            },
          },
        }),
      })

      assert.equal(saveResponse.status, 200)

      const verifyResponse = await fetch(`${origin}/api/prompt-templates/studio`)
      assert.equal(verifyResponse.status, 200)
      const verifyPayload = (await verifyResponse.json()) as {
        success: boolean
        data: PromptStudioBundle
      }

      const savedTemplate = verifyPayload.data.templates.find(
        (template) => template.id === targetTemplate!.id,
      )
      const savedPromptGuide = verifyPayload.data.externalAgents.assets.find(
        (asset) => asset.id === promptGuideAsset!.id,
      )

      assert.equal(savedTemplate?.languageContents.zh.system.includes('[route-test-marker]'), true)
      assert.equal(savedPromptGuide?.content.includes('[route-test-agent-marker]'), true)
      assert.equal(
        verifyPayload.data.runtime.maxRetriesPerPass,
        Math.min(6, original.runtime.maxRetriesPerPass + 1),
      )
      assert.equal(
        verifyPayload.data.runtime.selfRefinePasses,
        Math.min(4, original.runtime.selfRefinePasses + 1),
      )
      assert.equal(
        verifyPayload.data.runtime.researchReportPasses,
        Math.min(4, original.runtime.researchReportPasses + 1),
      )
      assert.equal(
        verifyPayload.data.runtime.researchCycleDelayMs,
        Math.min(15000, original.runtime.researchCycleDelayMs + 250),
      )
      assert.equal(
        verifyPayload.data.runtime.researchStageStallLimit,
        Math.min(6, original.runtime.researchStageStallLimit + 1),
      )
      assert.equal(
        verifyPayload.data.runtime.editorialPolicies.zh.identity.includes('[route-test-policy]'),
        true,
      )
      const promptGuideOnDisk = await fs.readFile(
        'F:\\DailyReport-main\\skills-backend\\external-agents\\PROMPT_GUIDE.md',
        'utf8',
      )
      assert.equal(promptGuideOnDisk.includes('[route-test-agent-marker]'), true)
    } finally {
      if (originalTemplateRecord) {
        await prisma.system_configs.upsert({
          where: { key: templateKey },
          update: { value: originalTemplateRecord.value, updatedAt: originalTemplateRecord.updatedAt },
          create: createConfigRecord(templateKey, originalTemplateRecord.value),
        })
      } else {
        await prisma.system_configs.deleteMany({
          where: { key: templateKey },
        })
      }

      if (originalRuntimeRecord) {
        await prisma.system_configs.upsert({
          where: { key: runtimeKey },
          update: { value: originalRuntimeRecord.value, updatedAt: originalRuntimeRecord.updatedAt },
          create: createConfigRecord(runtimeKey, originalRuntimeRecord.value),
        })
      } else {
        await prisma.system_configs.deleteMany({
          where: { key: runtimeKey },
        })
      }

      if (originalAgentAssetRecord) {
        await prisma.system_configs.upsert({
          where: { key: agentAssetKey },
          update: { value: originalAgentAssetRecord.value, updatedAt: originalAgentAssetRecord.updatedAt },
          create: createConfigRecord(agentAssetKey, originalAgentAssetRecord.value),
        })
      } else {
        await prisma.system_configs.deleteMany({
          where: { key: agentAssetKey },
        })
      }

      await fs.writeFile(
        'F:\\DailyReport-main\\skills-backend\\external-agents\\PROMPT_GUIDE.md',
        originalPromptGuide,
        'utf8',
      )
    }
  })
})

test('POST /api/prompt-templates/reset preserves other non-default language overrides', async () => {
  await withServer(async (origin) => {
    const templateKey = 'prompt-studio:template:v1:topic.nodeCard'
    const copyKey = 'prompt-studio:copy:v1:assistant.title'
    const [originalTemplateRecord, originalCopyRecord] = await Promise.all([
      prisma.system_configs.findUnique({ where: { key: templateKey } }),
      prisma.system_configs.findUnique({ where: { key: copyKey } }),
    ])

    try {
      const saveResponse = await fetch(`${origin}/api/prompt-templates/studio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: [
            {
              id: 'topic.nodeCard',
              languageContents: {
                fr: {
                  system: '[reset-fr-template]',
                  user: '[reset-fr-template-user]',
                  notes: '[reset-fr-template-notes]',
                },
                ru: {
                  system: '[reset-ru-template]',
                  user: '[reset-ru-template-user]',
                  notes: '[reset-ru-template-notes]',
                },
              },
            },
          ],
          productCopies: [
            {
              id: 'assistant.title',
              languageContents: {
                fr: '[reset-fr-copy]',
                ru: '[reset-ru-copy]',
              },
            },
          ],
        }),
      })

      assert.equal(saveResponse.status, 200)

      const [resetTemplateResponse, resetCopyResponse] = await Promise.all([
        fetch(`${origin}/api/prompt-templates/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: 'topic.nodeCard', language: 'fr' }),
        }),
        fetch(`${origin}/api/prompt-templates/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productCopyId: 'assistant.title', language: 'fr' }),
        }),
      ])

      assert.equal(resetTemplateResponse.status, 200)
      assert.equal(resetCopyResponse.status, 200)

      const verifyResponse = await fetch(`${origin}/api/prompt-templates/studio`)
      assert.equal(verifyResponse.status, 200)
      const verifyPayload = (await verifyResponse.json()) as {
        success: boolean
        data: PromptStudioBundle
      }

      const savedTemplate = verifyPayload.data.templates.find(
        (template) => template.id === 'topic.nodeCard',
      )
      const savedCopy = verifyPayload.data.productCopies.find(
        (copy: PromptStudioBundle['productCopies'][number]) => copy.id === 'assistant.title',
      )

      assert.equal(savedTemplate?.languageContents.fr.system.includes('[reset-fr-template]'), false)
      assert.equal(savedTemplate?.languageContents.ru.system.includes('[reset-ru-template]'), true)
      assert.equal(savedCopy?.languageContents.fr.includes('[reset-fr-copy]'), false)
      assert.equal(savedCopy?.languageContents.ru.includes('[reset-ru-copy]'), true)
    } finally {
      if (originalTemplateRecord) {
        await prisma.system_configs.upsert({
          where: { key: templateKey },
          update: { value: originalTemplateRecord.value, updatedAt: originalTemplateRecord.updatedAt },
          create: createConfigRecord(templateKey, originalTemplateRecord.value),
        })
      } else {
        await prisma.system_configs.deleteMany({
          where: { key: templateKey },
        })
      }

      if (originalCopyRecord) {
        await prisma.system_configs.upsert({
          where: { key: copyKey },
          update: { value: originalCopyRecord.value, updatedAt: originalCopyRecord.updatedAt },
          create: createConfigRecord(copyKey, originalCopyRecord.value),
        })
      } else {
        await prisma.system_configs.deleteMany({
          where: { key: copyKey },
        })
      }
    }
  })
})

test('POST /api/prompt-templates/external-agents/job returns a topic-grounded scaffold package', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/prompt-templates/external-agents/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: 'topic.chat',
        subjectType: 'topic',
        topicId: 'topic-1',
        outputContract: {
          type: 'json-object',
          required: ['answer'],
        },
      }),
    })

    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        schemaVersion: string
        language: string
        template: {
          id: string
          slot: string
        }
        modelTarget: {
          slot: string
          apiKeyStatus: 'configured' | 'missing'
        }
        subject: {
          type: string
          id: string | null
          topicId: string | null
        }
        scaffold: {
          assets: Array<{
            id: string
            content: string
          }>
          workflow: string[]
        }
        memoryContext: {
          pipeline: {
            recentHistory: unknown[]
          }
          sessionMemory: {
            summary: {
              currentFocus: string
            }
          }
        }
        outputContract: {
          required: string[]
        }
        savedPath?: string
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.schemaVersion, 'external-agent-job-v2')
    assert.equal(payload.data.template.id, 'topic.chat')
    assert.equal(payload.data.template.slot, 'language')
    assert.equal(payload.data.modelTarget.slot, 'language')
    assert.equal(['configured', 'missing'].includes(payload.data.modelTarget.apiKeyStatus), true)
    assert.equal(payload.data.subject.type, 'topic')
    assert.equal(payload.data.subject.id, 'topic-1')
    assert.equal(payload.data.subject.topicId, 'topic-1')
    assert.ok(Array.isArray(payload.data.memoryContext.pipeline.recentHistory))
    assert.equal(typeof payload.data.memoryContext.sessionMemory.summary.currentFocus, 'string')
    assert.equal(payload.data.outputContract.required[0], 'answer')
    assert.ok(payload.data.scaffold.assets.some((asset) => asset.id === 'promptGuide'))
    assert.ok(payload.data.scaffold.workflow.length >= 3)
    assert.equal(payload.data.savedPath, undefined)
  })
})
