import { contentGenesisSkill } from './content-genesis-v2/skill.ts'
import { orchestratorSkill } from './orchestrator/skill.ts'
import { paperTrackerSkill } from './paper-tracker/skill.ts'
import { topicVisualizerSkill } from './topic-visualizer/skill.ts'

import type { SkillDefinition, SkillId } from '../../engine/contracts.ts'

const researchSkills = [
  paperTrackerSkill,
  contentGenesisSkill,
  topicVisualizerSkill,
  orchestratorSkill,
] satisfies SkillDefinition[]

const skillMap = new Map<SkillId, SkillDefinition>(researchSkills.map((skill) => [skill.manifest.id, skill]))

export { contentGenesisSkill, orchestratorSkill, paperTrackerSkill, topicVisualizerSkill }

export function listResearchSkills() {
  return [...researchSkills]
}

export function getResearchSkill(skillId: SkillId) {
  const skill = skillMap.get(skillId)
  if (!skill) {
    throw new Error(`Unknown research skill id: ${skillId}`)
  }
  return skill
}
