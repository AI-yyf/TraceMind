import type { ModelSlot, OmniTask, ResearchRoleId, TaskRouteTarget, CategoryId } from './types'

export type ResearchRoleDefinition = {
  id: ResearchRoleId
  label: string
  description: string
  preferredSlot: ModelSlot
  defaultTasks: OmniTask[]
  defaultCategory?: CategoryId
}

export const RESEARCH_ROLE_DEFINITIONS: ResearchRoleDefinition[] = [
  {
    id: 'workbench_chat',
    label: 'Workbench Chat',
    description: 'Grounded sidebar conversation, follow-up questions, and current-topic discussion.',
    preferredSlot: 'language',
    defaultTasks: ['general_chat', 'topic_chat', 'topic_chat_vision'],
    defaultCategory: 'unspecified-low',
  },
  {
    id: 'topic_architect',
    label: 'Topic Architect',
    description: 'Topic creation, structure planning, stage naming, and map-level synthesis.',
    preferredSlot: 'language',
    defaultTasks: ['topic_summary'],
    defaultCategory: 'deep',
  },
  {
    id: 'research_judge',
    label: 'Research Judge',
    description: 'Thesis formation, agenda setting, contradiction tracking, and research memory compaction.',
    preferredSlot: 'language',
    defaultTasks: [],
    defaultCategory: 'ultrabrain',
  },
  {
    id: 'node_writer',
    label: 'Node Writer',
    description: 'Continuous node-level article flow, synthesis, and explanatory framing.',
    preferredSlot: 'language',
    defaultTasks: [],
    defaultCategory: 'writing',
  },
  {
    id: 'paper_writer',
    label: 'Paper Writer',
    description: 'Paper story rendering, method explanation, and contribution framing.',
    preferredSlot: 'language',
    defaultTasks: [],
    defaultCategory: 'writing',
  },
  {
    id: 'critic',
    label: 'Critic',
    description: 'Reviewer-style critique, objections, blind spots, and counterarguments.',
    preferredSlot: 'language',
    defaultTasks: [],
    defaultCategory: 'deep',
  },
  {
    id: 'localizer',
    label: 'Localizer',
    description: 'Multilingual rewriting, language patches, and interface-facing localization work.',
    preferredSlot: 'language',
    defaultTasks: [],
    defaultCategory: 'quick',
  },
  {
    id: 'vision_reader',
    label: 'Vision Reader',
    description: 'PDF, figure, table, formula, and evidence parsing with multimodal grounding.',
    preferredSlot: 'multimodal',
    defaultTasks: [
      'document_parse',
      'figure_analysis',
      'formula_recognition',
      'table_extraction',
      'evidence_explainer',
    ],
    defaultCategory: 'visual-engineering',
  },
]

export const RESEARCH_ROLE_IDS = RESEARCH_ROLE_DEFINITIONS.map((role) => role.id)

const RESEARCH_ROLE_MAP = new Map(RESEARCH_ROLE_DEFINITIONS.map((role) => [role.id, role] as const))

export function getResearchRoleDefinition(role: ResearchRoleId) {
  return RESEARCH_ROLE_MAP.get(role) ?? null
}

export const DEFAULT_TASK_ROUTING: Record<OmniTask, TaskRouteTarget> = {
  general_chat: 'workbench_chat',
  topic_chat: 'workbench_chat',
  topic_chat_vision: 'workbench_chat',
  topic_summary: 'topic_architect',
  document_parse: 'vision_reader',
  figure_analysis: 'vision_reader',
  formula_recognition: 'vision_reader',
  table_extraction: 'vision_reader',
  evidence_explainer: 'vision_reader',
}

export function isResearchRoleId(value: string): value is ResearchRoleId {
  return RESEARCH_ROLE_MAP.has(value as ResearchRoleId)
}

export function preferredSlotForRole(role: ResearchRoleId) {
  return getResearchRoleDefinition(role)?.preferredSlot ?? 'language'
}

export function resolveTaskRouteTarget(task: OmniTask, override?: TaskRouteTarget | null) {
  return override ?? DEFAULT_TASK_ROUTING[task]
}

export function allTaskRouteTargets(): TaskRouteTarget[] {
  return ['language', 'multimodal', ...RESEARCH_ROLE_IDS]
}

export function inferResearchRoleForTemplate(templateId: string): ResearchRoleId {
  if (templateId === 'topic.chat') return 'workbench_chat'
  if (
    templateId === 'topic.preview' ||
    templateId === 'topic.blueprintCore' ||
    templateId === 'topic.blueprint' ||
    templateId === 'topic.hero'
  ) {
    return 'topic_architect'
  }
  if (
    templateId === 'topic.localization' ||
    templateId === 'topic.localePatch'
  ) {
    return 'localizer'
  }
  if (
    templateId === 'topic.stageTimeline' ||
    templateId === 'topic.researchOrchestration' ||
    templateId === 'topic.researchReport' ||
    templateId === 'topic.closing' ||
    templateId === 'topic.sessionMemory'
  ) {
    return 'research_judge'
  }
  if (
    templateId === 'topic.nodeCard' ||
    templateId === 'article.node' ||
    templateId === 'article.crossPaper'
  ) {
    return 'node_writer'
  }
  if (templateId === 'article.paper') {
    return 'paper_writer'
  }
  if (templateId === 'article.reviewer') {
    return 'critic'
  }
  if (templateId === 'article.evidence' || templateId === 'visual.brief' || templateId === 'visual.nodeCover') {
    return 'vision_reader'
  }

  return 'research_judge'
}

/**
 * 获取 Role 的默认 Category
 */
export function getDefaultCategoryForRole(role: ResearchRoleId): CategoryId | undefined {
  return getResearchRoleDefinition(role)?.defaultCategory
}

/**
 * 根据 OmniTask 推断合适的 Category
 */
export function inferCategoryForTask(task: OmniTask): CategoryId {
  switch (task) {
    case 'general_chat':
      return 'unspecified-low'
    case 'topic_chat':
      return 'unspecified-low'
    case 'topic_chat_vision':
      return 'visual-engineering'
    case 'topic_summary':
      return 'deep'
    case 'document_parse':
      return 'visual-engineering'
    case 'figure_analysis':
      return 'visual-engineering'
    case 'formula_recognition':
      return 'visual-engineering'
    case 'table_extraction':
      return 'quick'
    case 'evidence_explainer':
      return 'deep'
    default:
      return 'unspecified-low'
  }
}
