import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runSkillDefinition } from '../engine/runner.ts'
import { contentGenesisSkill, orchestratorSkill, paperTrackerSkill } from '../skill-packs/research/index.ts'
import { writeCompiledTopics } from '../topic-config/compile-topics.ts'

import type { SkillStorageMode } from '../engine/contracts.ts'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..')
const generatedRoot = path.join(repoRoot, 'generated-data', 'app-data')
const workflowRoot = path.join(generatedRoot, 'workflow')

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function parseFlag(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  if (inline) {
    return inline.slice(name.length + 3)
  }

  const index = args.findIndex((arg) => arg === `--${name}`)
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1]
  }

  return undefined
}

function parseStorageMode(args: string[], fallback: SkillStorageMode): SkillStorageMode {
  const value = parseFlag(args, 'storageMode')
  return value === 'canonical-only' || value === 'debug' || value === 'dry-run' ? value : fallback
}

function parseNumericFlag(args: string[], name: string) {
  const value = parseFlag(args, name)
  return value && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : undefined
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2))
}

async function runDiscover(topicId: string | undefined, flags: string[]) {
  if (!topicId) {
    throw new Error('discover requires a topic id.')
  }

  const result = await runSkillDefinition(paperTrackerSkill, {
    skillId: 'paper-tracker',
    input: {
      topicId,
      maxCandidates: parseNumericFlag(flags, 'maxCandidates'),
      windowMonths: parseNumericFlag(flags, 'windowMonths'),
      providerId: parseFlag(flags, 'providerId'),
      model: parseFlag(flags, 'model'),
      temperature: parseNumericFlag(flags, 'temperature'),
      maxTokens: parseNumericFlag(flags, 'maxTokens'),
      mode: parseFlag(flags, 'mode') ?? 'dry-run',
    },
    storageMode: parseStorageMode(flags, 'dry-run'),
  })

  print({
    command: 'discover',
    topicId,
    storageMode: result.storageMode,
    summary: result.summary,
    selectedCandidate: result.output.selectedCandidate ?? null,
    recommendations: result.output.recommendations ?? [],
    persistedArtifacts: result.persistedArtifacts,
  })
}

async function runApply(topicId: string | undefined, flags: string[]) {
  if (!topicId) {
    throw new Error('apply requires a topic id.')
  }

  const result = await runSkillDefinition(orchestratorSkill, {
    skillId: 'orchestrator',
    input: {
      topicId,
      workflowMode: parseFlag(flags, 'workflowMode') ?? 'full-cycle',
      maxIterations: parseNumericFlag(flags, 'maxIterations') ?? 1,
      paperId: parseFlag(flags, 'paperId'),
      providerId: parseFlag(flags, 'providerId'),
      model: parseFlag(flags, 'model'),
      temperature: parseNumericFlag(flags, 'temperature'),
      maxTokens: parseNumericFlag(flags, 'maxTokens'),
    },
    storageMode: parseStorageMode(flags, 'canonical-only'),
  })

  print({
    command: 'apply',
    topicId,
    storageMode: result.storageMode,
    summary: result.summary,
    output: result.output,
    persistedArtifacts: result.persistedArtifacts,
  })
}

async function runContent(topicId: string | undefined, paperId: string | undefined, flags: string[]) {
  if (!topicId || !paperId) {
    throw new Error('content requires both topicId and paperId.')
  }

  const result = await runSkillDefinition(contentGenesisSkill, {
    skillId: 'content-genesis-v2',
    input: {
      topicId,
      paperId,
      coverageStrict: parseFlag(flags, 'coverageStrict') === 'true',
      contentMode: parseFlag(flags, 'contentMode') ?? 'editorial',
      providerId: parseFlag(flags, 'providerId'),
      model: parseFlag(flags, 'model'),
      temperature: parseNumericFlag(flags, 'temperature'),
      maxTokens: parseNumericFlag(flags, 'maxTokens'),
    },
    storageMode: parseStorageMode(flags, 'canonical-only'),
  })

  print({
    command: 'content',
    topicId,
    paperId,
    storageMode: result.storageMode,
    summary: result.summary,
    coverageReport: result.output.coverageReport ?? null,
    persistedArtifacts: result.persistedArtifacts,
  })
}

function runStatus() {
  const topicCatalog = readJson<{ topics: Array<Record<string, unknown>> }>(
    path.join(workflowRoot, 'topic-catalog.json'),
    { topics: [] },
  )
  const topicMemory = readJson<Record<string, Record<string, unknown>>>(
    path.join(workflowRoot, 'topic-memory.json'),
    {},
  )
  const paperCatalog = readJson<Record<string, Record<string, unknown>>>(
    path.join(generatedRoot, 'paper-catalog.json'),
    {},
  )
  const paperEditorial = readJson<Record<string, Record<string, unknown>>>(
    path.join(generatedRoot, 'tracker-content', 'paper-editorial.json'),
    {},
  )

  print({
    command: 'status',
    paperCount: Object.keys(paperCatalog).length,
    generatedEditorialCount: Object.keys(paperEditorial).length,
    topicCount: topicCatalog.topics.length,
    topics: topicCatalog.topics.map((topic) => {
      const topicId = String(topic.id ?? '')
      const memory = topicMemory[topicId] ?? {}
      const publishedMainlinePaperIds = Array.isArray(memory.publishedMainlinePaperIds)
        ? memory.publishedMainlinePaperIds
        : []
      const publishedBranchPaperIds = Array.isArray(memory.publishedBranchPaperIds)
        ? memory.publishedBranchPaperIds
        : []
      const candidatePaperIds = Array.isArray(memory.candidatePaperIds) ? memory.candidatePaperIds : []

      return {
        topicId,
        nameZh: topic.nameZh,
        publishedMainlineCount: publishedMainlinePaperIds.length,
        publishedBranchCount: publishedBranchPaperIds.length,
        candidateCount: candidatePaperIds.length,
        lastBuiltAt: memory.lastBuiltAt ?? null,
      }
    }),
  })
}

async function main() {
  writeCompiledTopics()

  const [command = 'status', arg1, arg2, ...flags] = process.argv.slice(2)

  if (command === 'discover') {
    await runDiscover(arg1, [arg2, ...flags].filter((item): item is string => Boolean(item)))
    return
  }

  if (command === 'apply') {
    await runApply(arg1, [arg2, ...flags].filter((item): item is string => Boolean(item)))
    return
  }

  if (command === 'content') {
    await runContent(arg1, arg2, flags)
    return
  }

  if (command === 'status') {
    runStatus()
    return
  }

  throw new Error(`Unknown tracker command: ${command}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
