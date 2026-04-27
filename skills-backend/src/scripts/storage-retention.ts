import 'dotenv/config'

import { runStorageRetentionSweep } from '../services/storage-retention'

async function main() {
  const summary = await runStorageRetentionSweep()
  console.log('[storage-retention] completed')
  console.log(JSON.stringify(summary, null, 2))
}

void main().catch((error) => {
  console.error('[storage-retention] failed', error)
  process.exitCode = 1
})
