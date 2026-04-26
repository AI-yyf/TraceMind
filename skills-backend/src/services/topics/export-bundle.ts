import {
  getNodeViewModel,
  type NodeViewModel,
} from './alpha-reader'
import { getTopicViewModel, type TopicViewModel, type TopicStageEditorial } from './alpha-topic'
import {
  buildResearchPipelineContext,
  loadResearchPipelineState,
} from './research-pipeline'
import { loadTopicResearchReport, type ResearchRunReport } from './research-report'
import {
  syncTopicResearchWorldSnapshot,
  type TopicResearchWorld,
} from './research-world'
import {
  collectTopicSessionMemoryContext,
  type TopicSessionMemoryContext,
} from './topic-session-memory'
import {
  loadTopicGuidanceLedger,
  type TopicGuidanceLedgerState,
} from './topic-guidance-ledger'

type PipelineContextSummary = ReturnType<typeof buildResearchPipelineContext>

export interface TopicExportStageDossier {
  stageIndex: number
  title: string
  titleEn: string
  description: string
  branchLabel: string
  branchColor: string
  yearLabel: string
  dateLabel: string
  timeLabel: string
  stageThesis: string
  editorial: TopicStageEditorial
  nodeCount: number
  nodeIds: string[]
  pipeline: PipelineContextSummary
}

export interface TopicExportBundle {
  schemaVersion: 'topic-export-bundle-v2'
  exportedAt: string
  topic: TopicViewModel
  report: ResearchRunReport | null
  world: TopicResearchWorld
  guidance: TopicGuidanceLedgerState
  pipeline: {
    updatedAt: string | null
    overview: PipelineContextSummary
  }
  sessionMemory: TopicSessionMemoryContext
  stageDossiers: TopicExportStageDossier[]
  nodeDossiers: NodeViewModel[]
}

export interface TopicExportBundleBatch {
  schemaVersion: 'topic-export-batch-v2'
  exportedAt: string
  topicCount: number
  bundles: TopicExportBundle[]
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function buildStageDossiers(topic: TopicViewModel, historyLimit = 6) {
  return async () => {
    const pipelineState = await loadResearchPipelineState(topic.topicId)
    const timelineByStage = new Map(
      topic.timeline.stages.map((stage) => [stage.stageIndex, stage] as const),
    )

    const stageDossiers: TopicExportStageDossier[] = topic.stages.map((stage) => {
      const timelineStage = timelineByStage.get(stage.stageIndex)
      const nodeIds = stage.nodes.map((node) => node.nodeId)

      return {
        stageIndex: stage.stageIndex,
        title: stage.title,
        titleEn: stage.titleEn,
        description: stage.description,
        branchLabel: stage.branchLabel,
        branchColor: stage.branchColor,
        yearLabel: timelineStage?.yearLabel ?? '',
        dateLabel: timelineStage?.dateLabel ?? '',
        timeLabel: timelineStage?.timeLabel ?? '',
        stageThesis: timelineStage?.stageThesis ?? '',
        editorial: stage.editorial,
        nodeCount: nodeIds.length,
        nodeIds,
        pipeline: buildResearchPipelineContext(pipelineState, {
          stageIndex: stage.stageIndex,
          paperIds: uniqueStrings(stage.nodes.flatMap((node) => node.paperIds)),
          historyLimit,
        }),
      }
    })

    return {
      state: pipelineState,
      stageDossiers,
      overview: buildResearchPipelineContext(pipelineState, { historyLimit: 8 }),
    }
  }
}

export async function getTopicExportBundle(topicId: string): Promise<TopicExportBundle> {
  const topic = await getTopicViewModel(topicId)
  const orderedNodeIds = uniqueStrings(topic.stages.flatMap((stage) => stage.nodes.map((node) => node.nodeId)))

  const [{ stageDossiers, overview }, report, sessionMemory, world, guidance, nodeDossiers] = await Promise.all([
    buildStageDossiers(topic)(),
    loadTopicResearchReport(topicId),
    collectTopicSessionMemoryContext(topicId, { recentLimit: 8 }),
    syncTopicResearchWorldSnapshot(topicId),
    loadTopicGuidanceLedger(topicId),
    Promise.all(orderedNodeIds.map((nodeId) => getNodeViewModel(nodeId))),
  ])

  return {
    schemaVersion: 'topic-export-bundle-v2',
    exportedAt: new Date().toISOString(),
    topic,
    report,
    world,
    guidance,
    pipeline: {
      updatedAt: overview.updatedAt,
      overview,
    },
    sessionMemory,
    stageDossiers,
    nodeDossiers,
  }
}

export async function getTopicExportBundleBatch(topicIds: string[]): Promise<TopicExportBundleBatch> {
  const orderedTopicIds = uniqueStrings(topicIds)
  const bundles = await Promise.all(orderedTopicIds.map((topicId) => getTopicExportBundle(topicId)))

  return {
    schemaVersion: 'topic-export-batch-v2',
    exportedAt: new Date().toISOString(),
    topicCount: bundles.length,
    bundles,
  }
}
