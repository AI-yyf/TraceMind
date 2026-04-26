import 'dotenv/config'

import { prisma } from '../lib/prisma'
import { clearResearchSessionsByTopic } from '../lib/redis'
import { clearTopicRuntimeState } from '../services/topics/runtime-reset'

function parseArgs() {
  const args = process.argv.slice(2)
  const topicIdArg = args.find((arg) => arg.startsWith('--topic-id='))
  return {
    topicId: topicIdArg ? topicIdArg.slice('--topic-id='.length).trim() || null : null,
    clearSessions: !args.includes('--keep-sessions'),
    clearRuntimeState: !args.includes('--keep-runtime-state'),
  }
}

async function main() {
  const options = parseArgs()
  const result = await clearTopicRuntimeState(
    prisma as unknown as Parameters<typeof clearTopicRuntimeState>[0],
    options,
  )
  const clearedResearchSessionCache = options.clearSessions
    ? await clearResearchSessionsByTopic(options.topicId)
    : 0

  console.log(
    JSON.stringify(
      {
        success: true,
        ...result,
        clearedResearchSessionCache,
      },
      null,
      2,
    ),
  )
}

void main()
  .catch((error) => {
    console.error('[clear-topic-runtime] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
