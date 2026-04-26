import 'dotenv/config'

import { prisma } from '../lib/prisma'
import { clearResearchSessionsByTopic } from '../lib/redis'
import { omniGateway } from '../services/omni/gateway'
import {
  getModelCapabilitySummary,
  saveUserModelConfig,
} from '../services/omni/config-store'
import {
  buildConfigureOmniUserModelConfig,
  parseConfigureOmniCliArgs,
} from '../services/omni/cli-config'
import { clearTopicRuntimeState } from '../services/topics/runtime-reset'

function hasFlag(args: string[], name: string) {
  return args.includes(`--${name}`)
}

async function main() {
  const args = process.argv.slice(2)
  const options = parseConfigureOmniCliArgs(args)
  const skipValidation = hasFlag(args, 'skip-validation')
  const scopedTopicId = null
  const userId = options.userId

  const runtimeReset = await clearTopicRuntimeState(
    prisma as unknown as Parameters<typeof clearTopicRuntimeState>[0],
    {
      topicId: scopedTopicId,
      clearSessions: true,
      clearRuntimeState: true,
      ensureCanonicalTopics: true,
      pruneLegacyTopics: true,
    },
  )
  const clearedResearchSessionCache = await clearResearchSessionsByTopic(scopedTopicId)

  const savedConfig = await saveUserModelConfig(buildConfigureOmniUserModelConfig(options), userId)
  const capabilitySummary = await getModelCapabilitySummary(userId)

  const validation = skipValidation
    ? {
        language: null,
        multimodal: null,
      }
    : {
        language: await omniGateway.validateSlot('language', userId),
        multimodal: await omniGateway.validateSlot('multimodal', userId),
      }

  console.log(
    JSON.stringify(
      {
        success: true,
        runtimeReset,
        clearedResearchSessionCache,
        apiKeySource: options.apiKeyEnv ? `env:${options.apiKeyEnv}` : 'inline-arg',
        modelConfig: savedConfig,
        slots: capabilitySummary.slots,
        roles: capabilitySummary.roles,
        validation,
      },
      null,
      2,
    ),
  )
}

void main()
  .catch((error) => {
    console.error('[prepare-suzhi-runtime] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
