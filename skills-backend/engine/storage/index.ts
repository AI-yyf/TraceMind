import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SkillArtifactChange, SkillStorageMode } from '../contracts.ts'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..', '..')
const generatedRoot = path.join(repoRoot, 'generated-data', 'app-data')
const tmpRoot = path.join(repoRoot, 'tmp', 'skill-runs')

const allowedCanonicalPaths = [
  'paper-catalog.json',
  'paper-assets.json',
  'paper-metrics.json',
  'tracker-content/paper-editorial.json',
  'tracker-content/node-editorial.json',
  'tracker-content/topic-editorial.json',
  'workflow/topic-catalog.json',
  'workflow/topic-memory.json',
  'workflow/topic-display.json',
  'workflow/capability-library.json',
  'workflow/active-topics.json',
  'workflow/decision-memory.json',
  'workflow/execution-memory.json',
]

function ensureDir(directory: string) {
  fs.mkdirSync(directory, { recursive: true })
}

function isAllowedCanonicalPath(relativePath: string) {
  return allowedCanonicalPaths.includes(relativePath)
}

function writeArtifact(filePath: string, kind: SkillArtifactChange['kind'], value: unknown) {
  ensureDir(path.dirname(filePath))
  const tempPath = `${filePath}.${process.pid}.tmp`

  if (kind === 'json') {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    fs.renameSync(tempPath, filePath)
    return
  }

  if (typeof value !== 'string') {
    throw new Error(`Artifact ${filePath} must be a string for ${kind} writes.`)
  }

  fs.writeFileSync(tempPath, value, 'utf8')
  fs.renameSync(tempPath, filePath)
}

export function persistArtifactChanges(args: {
  runId: string
  storageMode: SkillStorageMode
  artifactChanges: SkillArtifactChange[]
}) {
  const persisted: string[] = []
  const debugRoot = path.join(tmpRoot, new Date().toISOString().slice(0, 10), args.runId)

  for (const change of args.artifactChanges) {
    if (change.retention === 'canonical') {
      if (args.storageMode === 'dry-run') {
        continue
      }

      if (!isAllowedCanonicalPath(change.relativePath)) {
        throw new Error(`Canonical write is not allowed for ${change.relativePath}.`)
      }

      const absolutePath = path.join(generatedRoot, change.relativePath)
      writeArtifact(absolutePath, change.kind, change.nextValue)
      persisted.push(change.relativePath)
      continue
    }

    if (args.storageMode !== 'debug') {
      continue
    }

    const fileName = change.relativePath.replace(/[\\/]/g, '__')
    const extension =
      change.kind === 'json' ? '.json' : change.kind === 'markdown' ? '.md' : change.kind === 'typescript' ? '.ts' : '.txt'
    const absolutePath = path.join(debugRoot, `${fileName}${extension}`)
    writeArtifact(absolutePath, change.kind, change.nextValue)
    persisted.push(path.relative(repoRoot, absolutePath))
  }

  return persisted
}
