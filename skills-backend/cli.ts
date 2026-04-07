import { buildPlanForSkillDefinition, runSkillDefinition } from './engine/runner'
import { getResearchSkill, listResearchSkills } from './skill-packs/research'
import { writeCompiledTopics, writeResetOriginTopics } from './topic-config/compile-topics'

import type { AgentTarget, SkillExecutionMode, SkillId, SkillStorageMode } from './engine/contracts'

const reservedFlags = new Set(['agent', 'mode', 'storageMode'])

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
    if (reservedFlags.has(arg.slice(2))) return acc

    const next = args[index + 1]
    const [flagName, inlineValue] = arg.slice(2).split('=')
    if (reservedFlags.has(flagName)) return acc

    const rawValue =
      inlineValue !== undefined ? inlineValue : next && !next.startsWith('--') ? next : 'true'
    acc[flagName] = parseScalar(flagName, rawValue)
    return acc
  }, {})
}

function parseAgentTarget(value: string | undefined): AgentTarget | undefined {
  if (value === 'codex' || value === 'claude-code' || value === 'generic') {
    return value
  }
  return undefined
}

function parseExecutionMode(value: string | undefined): SkillExecutionMode | undefined {
  if (value === 'agent-prompt' || value === 'json-contract' || value === 'local-script') {
    return value
  }
  return undefined
}

function parseStorageMode(value: string | undefined): SkillStorageMode | undefined {
  if (value === 'canonical-only' || value === 'debug' || value === 'dry-run') {
    return value
  }
  return undefined
}

async function main() {
  const [command = 'skill:list', subject, jsonInput, ...flags] = process.argv.slice(2)

  if (command === 'topic:compile') {
    const compiled = writeCompiledTopics()
    console.log(
      JSON.stringify(
        {
          ok: true,
          topicCount: compiled.compiled?.topicCatalog.topics.length ?? 0,
          activeTopicCount: compiled.compiled?.activeTopics.length ?? 0,
          capabilityCount: compiled.compiled?.capabilityLibrary.length ?? 0,
        },
        null,
        2,
      ),
    )
    return
  }

  if (command === 'topic:reset-origin') {
    // 检查强制标志
    const force = flags.includes('--force')
    const dryRun = flags.includes('--dry-run')

    if (!force) {
      console.error('⚠️  危险操作确认')
      console.error('这将清空所有研究数据并回到起源态，包括：')
      console.error('  - 所有已发现的节点')
      console.error('  - 所有生成的内容')
      console.error('  - 所有决策历史')
      console.error('')
      console.error('如果确定要执行，请添加 --force 标志')
      console.error('或者使用 --dry-run 进行试运行')
      process.exitCode = 1
      return
    }

    console.log('🔄 正在重置到起源态...')
    if (dryRun) {
      console.log('（试运行模式 - 不会实际删除数据）')
    }

    const result = writeResetOriginTopics({ dryRun })

    console.log(
      JSON.stringify(
        {
          ok: result.success,
          topicCount: result.compiled?.topicCatalog.topics.length ?? 0,
          activeTopicCount: result.compiled?.activeTopics.length ?? 0,
          capabilityCount: result.compiled?.capabilityLibrary.length ?? 0,
          reset: true,
          dryRun,
          warnings: result.warnings,
          errors: result.errors,
        },
        null,
        2,
      ),
    )
    return
  }

  if (command === 'skill:list' || command === 'list') {
    console.log(JSON.stringify(listResearchSkills().map((skill) => skill.manifest), null, 2))
    return
  }

  if (!subject) {
    throw new Error('Missing skill id.')
  }

  const skillId = subject as SkillId
  const skill = getResearchSkill(skillId)
  const agentTarget = parseAgentTarget(parseFlag(flags, 'agent'))
  const mode = parseExecutionMode(parseFlag(flags, 'mode'))
  const storageMode = parseStorageMode(parseFlag(flags, 'storageMode'))
  const input =
    jsonInput && !jsonInput.startsWith('--')
      ? parseJsonInput(jsonInput)
      : parseInputFromFlags(jsonInput ? [jsonInput, ...flags] : flags)

  if (command === 'skill:inspect' || command === 'inspect') {
    console.log(
      JSON.stringify(
        buildPlanForSkillDefinition(skill, {
          skillId,
          input,
          agentTarget,
          mode,
          storageMode,
        }),
        null,
        2,
      ),
    )
    return
  }

  if (command === 'skill:run' || command === 'run') {
    console.log(
      JSON.stringify(
        await runSkillDefinition(skill, {
          skillId,
          input,
          agentTarget,
          mode,
          storageMode,
        }),
        null,
        2,
      ),
    )
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
