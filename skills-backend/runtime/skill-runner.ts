import { buildPlanForSkillDefinition, runSkillDefinition } from '../engine/runner'
import { getResearchSkill, listResearchSkills } from '../skill-packs/research'

import type { SkillExecutionRequest, SkillId } from './contracts'

export function listSkillManifests() {
  return listResearchSkills().map((skill) => skill.manifest)
}

export function getSkillManifest(skillId: SkillId) {
  return getResearchSkill(skillId).manifest
}

export function buildSkillExecutionPlan(request: SkillExecutionRequest) {
  return buildPlanForSkillDefinition(getResearchSkill(request.skillId), request)
}

export async function runRuntimeSkill(request: SkillExecutionRequest) {
  return runSkillDefinition(getResearchSkill(request.skillId), request)
}

export function getSkillDefinition(skillId: SkillId) {
  return getResearchSkill(skillId)
}
