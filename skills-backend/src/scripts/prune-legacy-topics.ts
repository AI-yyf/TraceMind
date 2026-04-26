import { prisma } from '../lib/prisma'
import { pruneLegacySeedTopics } from '../services/topics/topic-config-sync'

async function main() {
  const requestedTopicIds = process.argv.slice(2).map((topicId) => topicId.trim()).filter(Boolean)
  const deletedTopicIds =
    requestedTopicIds.length > 0
      ? await pruneLegacySeedTopics(requestedTopicIds)
      : await pruneLegacySeedTopics()

  console.log(
    JSON.stringify(
      {
        success: true,
        deletedTopicIds,
      },
      null,
      2,
    ),
  )
}

void main()
  .catch((error) => {
    console.error('[prune-legacy-topics] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
