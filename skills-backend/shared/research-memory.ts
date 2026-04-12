/**
 * Research memory helpers used by both the legacy skill executors and the
 * newer workflow compiler/runtime.
 */

import { prisma } from './db'

type JsonRecord = Record<string, unknown>

export interface DecisionMemoryFile {
  schemaVersion: number
  entries: JsonRecord[]
}

export interface ExecutionMemoryFile {
  schemaVersion: number
  skills: Record<string, JsonRecord>
}

interface DiscoveryRecord {
  paperId: string
  title: string
  confidence: number
  stageIndex: number
  discoveredAt: string
}

interface ContentGenerationRecord {
  summary: string
  narrative: string
  evidence: string
  generatedAt: string
  coverageScore: number
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asRecordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
}

export function normalizeDecisionMemoryFile(value: unknown): DecisionMemoryFile {
  const record = isRecord(value) ? value : {}
  const schemaVersion =
    typeof record.schemaVersion === 'number' && Number.isFinite(record.schemaVersion)
      ? Math.max(1, Math.trunc(record.schemaVersion))
      : 1

  return {
    schemaVersion,
    entries: asRecordArray(record.entries),
  }
}

export function normalizeExecutionMemoryFile(value: unknown): ExecutionMemoryFile {
  const record = isRecord(value) ? value : {}
  const rawSkills = isRecord(record.skills) ? record.skills : {}
  const skills = Object.fromEntries(
    Object.entries(rawSkills).map(([skillId, payload]) => [
      skillId,
      isRecord(payload) ? payload : {},
    ]),
  ) as Record<string, JsonRecord>

  const schemaVersion =
    typeof record.schemaVersion === 'number' && Number.isFinite(record.schemaVersion)
      ? Math.max(1, Math.trunc(record.schemaVersion))
      : 1

  return {
    schemaVersion,
    skills,
  }
}

export function appendDecisionMemoryEntry(
  memory: unknown,
  entry: JsonRecord,
): DecisionMemoryFile {
  const normalized = normalizeDecisionMemoryFile(memory)
  return {
    ...normalized,
    entries: [...normalized.entries, entry],
  }
}

export function mergeExecutionMemoryPatch(args: {
  memory: unknown
  skillId: string
  patch: JsonRecord
}): ExecutionMemoryFile {
  const normalized = normalizeExecutionMemoryFile(args.memory)
  return {
    ...normalized,
    skills: {
      ...normalized.skills,
      [args.skillId]: {
        ...(normalized.skills[args.skillId] ?? {}),
        ...args.patch,
      },
    },
  }
}

export class ResearchMemory {
  async addDiscoveryBatch(topicId: string, discoveries: DiscoveryRecord[]): Promise<void> {
    try {
      for (const discovery of discoveries) {
        await prisma.system_configs.upsert({
          where: { key: `discovery:${topicId}:${discovery.paperId}` },
          update: {
            updatedAt: new Date(),
            value: JSON.stringify(discovery),
          },
          create: {
            id: crypto.randomUUID(),
            updatedAt: new Date(),
            key: `discovery:${topicId}:${discovery.paperId}`,
            value: JSON.stringify(discovery),
          },
        })
      }
    } catch (error) {
      console.error('Failed to save discovery batch:', error)
    }
  }

  async addContentGeneration(paperId: string, content: ContentGenerationRecord): Promise<void> {
    try {
      await prisma.system_configs.upsert({
        where: { key: `content:${paperId}` },
        update: {
          updatedAt: new Date(),
          value: JSON.stringify(content),
        },
        create: {
          id: crypto.randomUUID(),
          updatedAt: new Date(),
          key: `content:${paperId}`,
          value: JSON.stringify(content),
        },
      })
    } catch (error) {
      console.error('Failed to save content generation:', error)
    }
  }

  async getDiscoveryHistory(topicId: string): Promise<DiscoveryRecord[]> {
    try {
      const records = await prisma.system_configs.findMany({
        where: {
          key: {
            startsWith: `discovery:${topicId}:`,
          },
        },
      })

      return records.map((record: { value: string }) => JSON.parse(record.value) as DiscoveryRecord)
    } catch (error) {
      console.error('Failed to get discovery history:', error)
      return []
    }
  }

  async getContentGeneration(paperId: string): Promise<ContentGenerationRecord | null> {
    try {
      const record = await prisma.system_configs.findUnique({
        where: { key: `content:${paperId}` },
      })

      return record ? (JSON.parse(record.value) as ContentGenerationRecord) : null
    } catch (error) {
      console.error('Failed to get content generation:', error)
      return null
    }
  }
}

export const researchMemory = new ResearchMemory()
