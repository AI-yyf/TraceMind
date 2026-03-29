import { buildPlanForSkillDefinition, runSkillDefinition } from '../engine/runner.ts'
import { getResearchSkill, listResearchSkills } from '../skill-packs/research/index.ts'

import type { SkillExecutionRequest, SkillId } from './contracts.ts'

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
