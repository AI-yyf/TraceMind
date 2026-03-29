import type { SkillArtifactChange, SkillContextSnapshot } from '../../../engine/contracts.ts'

function clonePaperEditorialStore(context: SkillContextSnapshot) {
  return structuredClone((context.paperEditorialStore ?? {}) as Record<string, Record<string, unknown>>)
}

function cloneTopicEditorialStore(context: SkillContextSnapshot) {
  return structuredClone((context.topicEditorialStore ?? []) as Array<Record<string, unknown>>)
}

function cloneNodeEditorialStore(context: SkillContextSnapshot) {
  return structuredClone((context.nodeEditorialStore ?? {}) as Record<string, Record<string, unknown>>)
}

export function buildPaperEditorialChange(args: {
  context: SkillContextSnapshot
  paperId: string
  patch: Record<string, unknown>
}): SkillArtifactChange {
  const nextPaperEditorialStore = clonePaperEditorialStore(args.context)
  const previous = nextPaperEditorialStore[args.paperId]
  const previousRecord =
    previous && typeof previous === 'object' && !Array.isArray(previous)
      ? (previous as Record<string, unknown>)
      : {}

  nextPaperEditorialStore[args.paperId] = {
    ...previousRecord,
    ...args.patch,
  }

  return {
    relativePath: 'tracker-content/paper-editorial.json',
    kind: 'json',
    retention: 'canonical',
    description: `Update generated paper editorial store for ${args.paperId}.`,
    nextValue: nextPaperEditorialStore,
  }
}

export function buildTopicEditorialChange(args: {
  context: SkillContextSnapshot
  topicId: string
  patch: Record<string, unknown>
}): SkillArtifactChange {
  const nextTopicEditorialStore = cloneTopicEditorialStore(args.context)
  const topicIndex = nextTopicEditorialStore.findIndex((entry) => entry.id === args.topicId)
  const previous =
    topicIndex >= 0 && nextTopicEditorialStore[topicIndex] && typeof nextTopicEditorialStore[topicIndex] === 'object'
      ? (nextTopicEditorialStore[topicIndex] as Record<string, unknown>)
      : {}
  const previousEntries = Array.isArray(previous.entries)
    ? (previous.entries as Array<Record<string, unknown>>)
    : []
  const patchEntries = Array.isArray(args.patch.entries)
    ? (args.patch.entries as Array<Record<string, unknown>>)
    : []
  const nextValue = {
    ...previous,
    id: args.topicId,
    ...args.patch,
    entries:
      previousEntries.length > 0 || patchEntries.length > 0
        ? [...previousEntries, ...patchEntries].filter(
            (entry, index, collection) =>
              collection.findIndex((candidate) => candidate.paperId === entry.paperId) === index,
          )
        : undefined,
  }

  if (topicIndex >= 0) {
    nextTopicEditorialStore[topicIndex] = nextValue
  } else {
    nextTopicEditorialStore.push(nextValue)
  }

  return {
    relativePath: 'tracker-content/topic-editorial.json',
    kind: 'json',
    retention: 'canonical',
    description: `Update generated topic editorial store for ${args.topicId}.`,
    nextValue: nextTopicEditorialStore,
  }
}

export function buildNodeEditorialChange(args: {
  context: SkillContextSnapshot
  nodeId: string
  patch: Record<string, unknown>
}): SkillArtifactChange {
  const nextNodeEditorialStore = cloneNodeEditorialStore(args.context)
  const previous = nextNodeEditorialStore[args.nodeId]
  const previousRecord =
    previous && typeof previous === 'object' && !Array.isArray(previous)
      ? (previous as Record<string, unknown>)
      : {}

  nextNodeEditorialStore[args.nodeId] = {
    ...previousRecord,
    ...args.patch,
  }

  return {
    relativePath: 'tracker-content/node-editorial.json',
    kind: 'json',
    retention: 'canonical',
    description: `Update generated node editorial store for ${args.nodeId}.`,
    nextValue: nextNodeEditorialStore,
  }
}
