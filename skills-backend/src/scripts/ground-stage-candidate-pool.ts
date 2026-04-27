import 'dotenv/config'

import { groundStageCandidatePoolEntries } from '../services/stage-candidate-pool'

function readArg(flag: string) {
  const direct = process.argv.find((value) => value.startsWith(`${flag}=`))
  if (direct) return direct.slice(flag.length + 1)
  const index = process.argv.indexOf(flag)
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1]
  }
  return undefined
}

async function main() {
  const topicId = readArg('--topicId')
  const stageIndexRaw = readArg('--stageIndex')
  if (!topicId || !stageIndexRaw) {
    throw new Error(
      'Usage: node --import tsx src/scripts/ground-stage-candidate-pool.ts --topicId=<topic-id> --stageIndex=<stage-index> [--limit=50] [--force=true] [--statuses=admitted,candidate]',
    )
  }

  const stageIndex = Number.parseInt(stageIndexRaw, 10)
  if (!Number.isFinite(stageIndex) || stageIndex <= 0) {
    throw new Error(`Invalid stageIndex: ${stageIndexRaw}`)
  }

  const limitRaw = readArg('--limit')
  const forceRaw = readArg('--force')
  const statusesRaw = readArg('--statuses')

  const result = await groundStageCandidatePoolEntries({
    topicId,
    stageIndex,
    limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
    force: forceRaw === '1' || forceRaw === 'true',
    statuses: statusesRaw
      ? statusesRaw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean) as Array<'admitted' | 'candidate' | 'rejected'>
      : undefined,
  })

  console.log('[ground-stage-candidate-pool] completed')
  console.log(JSON.stringify(result, null, 2))
}

void main().catch((error) => {
  console.error('[ground-stage-candidate-pool] failed', error)
  process.exitCode = 1
})
