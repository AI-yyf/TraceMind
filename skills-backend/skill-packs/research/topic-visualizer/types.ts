export interface TopicVisualizerInput {
  topicId: string
  paperIds?: string[]
  rebuildMode?: 'incremental' | 'full'
}
