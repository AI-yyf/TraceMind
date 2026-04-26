import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_RESEARCH_ARTIFACT_REBUILD_LIMIT,
  DEFAULT_RESEARCH_STAGE_PAPER_LIMIT,
  getBuiltInPromptDefinitions,
  getGenerationRuntimeConfig,
  getPromptStudioBundle,
  listPromptLanguages,
  PROMPT_TEMPLATE_IDS,
  renderPromptVariables,
} from '../services/generation/prompt-registry'

test('prompt registry exposes the expected built-in template ids', () => {
  const definitions = getBuiltInPromptDefinitions()
  const ids = new Set(definitions.map((item) => item.id))

  Object.values(PROMPT_TEMPLATE_IDS).forEach((id) => {
    assert.equal(ids.has(id), true, `missing template id: ${id}`)
  })
})

test('prompt registry exposes multilingual defaults and variable rendering', () => {
  const languages = listPromptLanguages()
  const codes = languages.map((item) => item.code)

  assert.deepEqual(codes, ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru'])
  assert.equal(
    renderPromptVariables('topic={topic} / date={date}', {
      topic: 'Pathogen Timeline',
      date: '2026-03-31',
    }),
    'topic=Pathogen Timeline / date=2026-03-31',
  )
})

test('generation runtime exposes a default expert charter and refinement controls', async () => {
  const runtime = await getGenerationRuntimeConfig()

  assert.equal(typeof runtime.editorialPolicies.zh.identity, 'string')
  assert.equal(runtime.editorialPolicies.zh.identity.length > 0, true)
  assert.equal(runtime.selfRefinePasses >= 0, true)
  assert.equal(runtime.selfRefinePasses >= 2, true)
  assert.equal(runtime.nodeArticlePasses >= 5, true)
  assert.equal(runtime.researchOrchestrationPasses >= 4, true)
  assert.equal(runtime.languageTemperature >= 0, true)
  assert.equal(runtime.multimodalTemperature >= 0, true)
  assert.equal(runtime.researchReportPasses >= 1, true)
  assert.equal(runtime.researchCycleDelayMs >= 250, true)
  assert.equal(runtime.researchStageStallLimit >= 1, true)
  assert.equal(DEFAULT_RESEARCH_STAGE_PAPER_LIMIT, 20)
  assert.equal(DEFAULT_RESEARCH_ARTIFACT_REBUILD_LIMIT, 20)
  assert.equal(runtime.researchStagePaperLimit >= 1, true)
  assert.equal(runtime.researchArtifactRebuildLimit >= 1, true)
  assert.equal(runtime.topicSessionMemoryRecallLimit >= 1, true)
  assert.equal(runtime.topicSessionMemoryRecallLookbackLimit >= runtime.topicSessionMemoryRecallLimit, true)
  assert.equal(runtime.topicSessionMemoryRecallRecencyBias >= 0, true)
})

test('prompt studio bundle exposes editable external agent assets', async () => {
  const bundle = await getPromptStudioBundle()

  assert.equal(bundle.externalAgents.assets.length >= 4, true)
  assert.equal(
    bundle.externalAgents.assets.some((asset) => asset.id === 'superPrompt'),
    true,
  )
  assert.equal(typeof bundle.externalAgents.superPromptPath, 'string')
})
