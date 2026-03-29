export type OrchestratorWorkflowMode =
  | 'discover-only'
  | 'content-only'
  | 'visualize-only'
  | 'full-cycle'
  | 'rebuild'

export interface OrchestratorStepResult {
  id: string
  skillId: string
  status: 'completed' | 'skipped' | 'failed'
  summary: string
  persistedArtifacts: string[]
}
