import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

function parseArgs(argv) {
  const args = {}
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue
    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = 'true'
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function replaceTokens(template, tokens) {
  return Object.entries(tokens).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, value),
    template,
  )
}

function renderPrompt(job) {
  const policy = job.editorialPolicy ?? job.runtime?.editorialPolicies?.[job.language] ?? job.runtime?.editorialPolicies?.zh ?? null
  return [
    job.template.system,
    '',
    job.template.user,
    '',
    'Generation runtime:',
    JSON.stringify(
      {
        defaultLanguage: job.runtime?.defaultLanguage,
        selfRefinePasses: job.runtime?.selfRefinePasses,
        languageTemperature: job.runtime?.languageTemperature,
        multimodalTemperature: job.runtime?.multimodalTemperature,
        useTopicMemory: job.runtime?.useTopicMemory,
        usePreviousPassOutputs: job.runtime?.usePreviousPassOutputs,
        preferMultimodalEvidence: job.runtime?.preferMultimodalEvidence,
        maxEvidencePerArticle: job.runtime?.maxEvidencePerArticle,
      },
      null,
      2,
    ),
    '',
    'Editorial policy:',
    JSON.stringify(policy, null, 2),
    '',
    'Structured input:',
    JSON.stringify(job.input, null, 2),
    '',
    'Memory context:',
    JSON.stringify(job.memoryContext, null, 2),
    '',
    'Output contract:',
    JSON.stringify(job.outputContract, null, 2),
    '',
    'Important rule: output JSON only.',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  const required = ['config', 'adapter', 'job']
  const missing = required.filter((key) => !args[key])

  if (missing.length > 0) {
    throw new Error(`Missing required args: ${missing.join(', ')}`)
  }

  const configPath = path.resolve(process.cwd(), args.config)
  const jobPath = path.resolve(process.cwd(), args.job)
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  const job = JSON.parse(await fs.readFile(jobPath, 'utf8'))

  const adapter = config.adapters?.[args.adapter]
  if (!adapter?.command) {
    throw new Error(`Adapter not configured: ${args.adapter}`)
  }

  const outputDir = path.resolve(process.cwd(), config.outputDir ?? './external-agents/outputs')
  await fs.mkdir(outputDir, { recursive: true })

  const baseName = path.basename(jobPath, path.extname(jobPath))
  const promptFile = path.join(outputDir, `${baseName}.prompt.txt`)
  const outputFile = path.join(outputDir, `${baseName}.${args.adapter}.json`)
  const reportFile = path.join(outputDir, `${baseName}.${args.adapter}.report.json`)

  await fs.writeFile(promptFile, renderPrompt(job), 'utf8')

  const command = replaceTokens(adapter.command, {
    promptFile,
    outputFile,
    jobFile: jobPath,
  })

  const startedAt = new Date().toISOString()
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => resolve({ code: code ?? 0 }))
  })

  const report = {
    schemaVersion: 'external-agent-run-v1',
    adapter: args.adapter,
    command,
    jobFile: jobPath,
    promptFile,
    outputFile,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.code,
  }

  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8')
  process.stdout.write(`${reportFile}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
