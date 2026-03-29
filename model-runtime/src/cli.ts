import { buildSkillExecutionPlan, listSkillManifests } from '../../skills-backend/runtime/skill-runner.ts'
import { writeCompiledTopics } from '../../skills-backend/topic-config/compile-topics.ts'
import { ModelRuntimeClient, isRuntimeProviderId } from './runtime/client.ts'

import type { AgentTarget, SkillId } from '../../skills-backend/runtime/contracts.ts'

const reservedFlags = new Set(['provider', 'agent', 'model', 'temperature', 'maxTokens', 'storageMode'])

function parseJsonInput(value: string | undefined) {
  if (!value) return {}
  return JSON.parse(value) as Record<string, unknown>
}

function parseFlag(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  if (inline) {
    return inline.slice(name.length + 3)
  }

  const index = args.findIndex((arg) => arg === `--${name}`)
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1]
  }

  return undefined
}

function parseAgentTarget(value: string | undefined): AgentTarget | undefined {
  if (value === 'codex' || value === 'claude-code' || value === 'generic') {
    return value
  }
  return undefined
}

function parseScalar(flagName: string, value: string) {
  const normalizedFlag = flagName.toLowerCase()
  if (normalizedFlag.endsWith('id')) return value
  if (normalizedFlag.endsWith('ids')) {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  if (value.includes(',')) return value.split(',').map((item) => item.trim()).filter(Boolean)
  return value
}

function parseInputFromFlags(args: string[]) {
  return args.reduce<Record<string, unknown>>((acc, arg, index) => {
    if (!arg.startsWith('--')) return acc
    const [flagName, inlineValue] = arg.slice(2).split('=')
    if (reservedFlags.has(flagName)) return acc

    const next = args[index + 1]
    const rawValue =
      inlineValue !== undefined ? inlineValue : next && !next.startsWith('--') ? next : 'true'
    acc[flagName] = parseScalar(flagName, rawValue)
    return acc
  }, {})
}

async function main() {
  const [command = 'list', subject, jsonInput, ...flags] = process.argv.slice(2)
  const runtime = new ModelRuntimeClient()

  if (command === 'topic:compile') {
    const compiled = writeCompiledTopics()
    console.log(
      JSON.stringify(
        {
          ok: true,
          topicCount: compiled.topicCatalog.topics.length,
          activeTopicCount: compiled.activeTopics.length,
          capabilityCount: compiled.capabilityLibrary.length,
        },
        null,
        2,
      ),
    )
    return
  }

  if (command === 'list' || command === 'runtime:list') {
    console.log(JSON.stringify({ skills: listSkillManifests(), providers: runtime.listProviders() }, null, 2))
    return
  }

  if (command === 'providers' || command === 'runtime:providers') {
    console.log(JSON.stringify(runtime.listProviders(), null, 2))
    return
  }

  if (!subject) {
    throw new Error('Missing skill id.')
  }

  const providerFlag = parseFlag(flags, 'provider')
  const providerId = providerFlag && isRuntimeProviderId(providerFlag) ? providerFlag : undefined
  const agentTarget = parseAgentTarget(parseFlag(flags, 'agent'))
  const input =
    jsonInput && !jsonInput.startsWith('--')
      ? parseJsonInput(jsonInput)
      : parseInputFromFlags(jsonInput ? [jsonInput, ...flags] : flags)
  const skillId = subject as SkillId

  if (command === 'inspect' || command === 'runtime:inspect' || command === 'skill:inspect') {
    console.log(
      JSON.stringify(
        buildSkillExecutionPlan({
          skillId,
          input,
          agentTarget,
          storageMode: parseFlag(flags, 'storageMode') as 'canonical-only' | 'debug' | 'dry-run' | undefined,
        }),
        null,
        2,
      ),
    )
    return
  }

  if (command === 'prompt' || command === 'runtime:prompt') {
    const result = await runtime.runSkill({
      skillId,
      input,
      providerId: 'agent-skill',
      agentTarget,
      storageMode: parseFlag(flags, 'storageMode') as 'canonical-only' | 'debug' | 'dry-run' | undefined,
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'run' || command === 'runtime:run' || command === 'skill:run') {
    const result = await runtime.runSkill({
      skillId,
      input,
      providerId: providerId ?? 'agent-skill',
      agentTarget,
      storageMode: parseFlag(flags, 'storageMode') as 'canonical-only' | 'debug' | 'dry-run' | undefined,
      model: parseFlag(flags, 'model'),
      temperature: parseFlag(flags, 'temperature') ? Number(parseFlag(flags, 'temperature')) : undefined,
      maxTokens: parseFlag(flags, 'maxTokens') ? Number(parseFlag(flags, 'maxTokens')) : undefined,
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
