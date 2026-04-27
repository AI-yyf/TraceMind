import 'dotenv/config'

import { purgeSyntheticTopics } from '../services/topics/topic-visibility'

async function main() {
  const result = await purgeSyntheticTopics()
  console.log('[purge-synthetic-topics] completed')
  console.log(JSON.stringify(result, null, 2))
}

void main().catch((error) => {
  console.error('[purge-synthetic-topics] failed', error)
  process.exitCode = 1
})
