import { executePaperTracker } from '../../skill-packs/research/paper-tracker/executor'

function readArg(flag: string) {
  const entry = process.argv.find((value) => value.startsWith(`${flag}=`))
  return entry ? entry.slice(flag.length + 1) : undefined
}

const topicId = readArg('--topicId') ?? process.argv[2]

if (!topicId) {
  console.error('Usage: npx tsx src/scripts/inspect-paper-tracker.ts --topicId=<topic-id> [--mode=inspect] [--maxCandidates=20] [--windowMonths=3]')
  process.exit(1)
}

const maxCandidates = Number(readArg('--maxCandidates') ?? 20)
const windowMonthsRaw = readArg('--windowMonths')
const windowMonths = windowMonthsRaw ? Number(windowMonthsRaw) : undefined
const stageMode = (readArg('--stageMode') ?? 'current') as 'current' | 'next-stage' | 'recalibrate'
const mode = (readArg('--mode') ?? 'inspect') as 'dry-run' | 'inspect' | 'commit'

const logger = {
  info(message: string, meta?: unknown) {
    console.error('[paper-tracker:info]', message, meta ?? '')
  },
  warn(message: string, meta?: unknown) {
    console.error('[paper-tracker:warn]', message, meta ?? '')
  },
  error(message: string, meta?: unknown) {
    console.error('[paper-tracker:error]', message, meta ?? '')
  },
}

async function main() {
  const result = await executePaperTracker(
    {
      params: {
        topicId,
        stageMode,
        discoverySource: 'external-only',
        maxCandidates: Number.isFinite(maxCandidates) ? maxCandidates : 20,
        mode,
        ...(typeof windowMonths === 'number' && Number.isFinite(windowMonths)
          ? { windowMonths }
          : {}),
      },
      request: {
        skillId: 'paper-tracker',
        input: {},
      },
    },
    { logger, activeTopicIds: [topicId], generatedDataSummary: null } as any,
    null as any,  // artifactManager
  )

  if (!result.success) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(1)
  }

  const data = result.data ?? {}
  console.log(
    JSON.stringify(
      {
        success: result.success,
        discoverySummary: data.discoverySummary ?? null,
        stageWindow: data.stageWindow ?? null,
        stageWindowDecision: data.stageWindowDecision ?? null,
        branchAction: data.branchAction ?? null,
        branchDecisionRationale: data.branchDecisionRationale ?? null,
        recommendations: data.recommendations ?? null,
        candidates: Array.isArray(data.candidates)
          ? data.candidates.map((candidate: any) => ({
              paperId: candidate.paperId,
              title: candidate.title,
              published: candidate.published,
              candidateType: candidate.candidateType,
              confidence: candidate.confidence,
              status: candidate.status,
              why: candidate.why,
              queryHits: candidate.queryHits,
              discoveryChannels: candidate.discoveryChannels,
            }))
          : null,
      },
      null,
      2,
    ),
  )
}

void main()
