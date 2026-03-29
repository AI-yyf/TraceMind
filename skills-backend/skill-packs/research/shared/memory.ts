import type { SkillArtifactChange, SkillContextSnapshot } from '../../../engine/contracts.ts'
import {
  appendDecisionMemoryEntry,
  mergeExecutionMemoryPatch,
} from '../../../shared/research-memory.ts'

export function buildExecutionMemoryChange(args: {
  context: SkillContextSnapshot
  skillId: string
  patch: Record<string, unknown>
}): SkillArtifactChange {
  const nextExecutionMemory = mergeExecutionMemoryPatch({
    memory: args.context.executionMemory,
    skillId: args.skillId,
    patch: args.patch,
  })

  return {
    relativePath: 'workflow/execution-memory.json',
    kind: 'json',
    retention: 'canonical',
    description: `Update execution memory for ${args.skillId}.`,
    nextValue: nextExecutionMemory,
  }
}

export function buildDecisionMemoryChange(args: {
  context: SkillContextSnapshot
  entry: Record<string, unknown>
}): SkillArtifactChange {
  const nextDecisionMemory = appendDecisionMemoryEntry(args.context.decisionMemory, args.entry)

  return {
    relativePath: 'workflow/decision-memory.json',
    kind: 'json',
    retention: 'canonical',
    description: 'Append a structured decision-memory entry.',
    nextValue: nextDecisionMemory,
  }
}
