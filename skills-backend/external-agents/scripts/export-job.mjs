import fs from 'node:fs/promises'
import path from 'node:path'

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

async function readJsonFile(filePath) {
  if (!filePath) return null
  const absolute = path.resolve(process.cwd(), filePath)
  const text = await fs.readFile(absolute, 'utf8')
  return JSON.parse(text)
}

async function main() {
  const args = parseArgs(process.argv)
  const required = ['api-base', 'template', 'topic-id', 'subject-type', 'subject-id', 'out']
  const missing = required.filter((key) => !args[key])

  if (missing.length > 0) {
    throw new Error(`Missing required args: ${missing.join(', ')}`)
  }

  const language = args.language ?? 'zh'
  const studioResponse = await fetch(`${args['api-base'].replace(/\/+$/u, '')}/api/prompt-templates/studio`)
  if (!studioResponse.ok) {
    throw new Error(`Failed to load prompt studio bundle: ${studioResponse.status}`)
  }

  const studioPayload = await studioResponse.json()
  const bundle = studioPayload.data ?? studioPayload
  const template = bundle.templates.find((item) => item.id === args.template)
  if (!template) {
    throw new Error(`Template not found: ${args.template}`)
  }

  const languageContent = template.languageContents[language] ?? template.languageContents.zh
  const editorialPolicy = bundle.runtime?.editorialPolicies?.[language] ?? bundle.runtime?.editorialPolicies?.zh ?? null
  const outputContract =
    (await readJsonFile(args['output-contract'])) ??
    JSON.parse('{"status":"fill-output-contract-file-for-stricter-validation"}')

  const job = {
    schemaVersion: 'external-agent-job-v1',
    generatedAt: new Date().toISOString(),
    topicId: args['topic-id'],
    subjectType: args['subject-type'],
    subjectId: args['subject-id'],
    templateId: template.id,
    language,
    runtime: bundle.runtime,
    editorialPolicy,
    template: {
      id: template.id,
      family: template.family,
      slot: template.slot,
      system: languageContent.system,
      user: languageContent.user,
      notes: languageContent.notes,
    },
    input: (await readJsonFile(args['input-json'])) ?? {},
    memoryContext: (await readJsonFile(args['memory-json'])) ?? null,
    outputContract,
    externalGuide: bundle.externalAgents.promptGuidePath,
  }

  const outPath = path.resolve(process.cwd(), args.out)
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, JSON.stringify(job, null, 2), 'utf8')

  process.stdout.write(`${outPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
