import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const sourceRoot = path.join(repoRoot, 'topic-config')
const targetRoot = path.join(repoRoot, 'dist', 'topic-config')

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(sourcePath, targetPath)
}

function copyJsonTree(sourceDir, targetDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      copyJsonTree(sourcePath, targetPath)
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      copyFile(sourcePath, targetPath)
    }
  }
}

copyJsonTree(sourceRoot, targetRoot)

// Also copy the runtime CJS to dist so relative requires work
const runtimeCjsSource = path.join(repoRoot, 'runtime-assets', 'deep-article-generator.runtime.cjs')
const runtimeCjsTarget = path.join(repoRoot, 'dist', 'src', 'services', 'topics', 'deep-article-generator.runtime.cjs')
if (fs.existsSync(runtimeCjsSource)) {
  fs.mkdirSync(path.dirname(runtimeCjsTarget), { recursive: true })
  fs.copyFileSync(runtimeCjsSource, runtimeCjsTarget)
  console.log('Copied runtime CJS to dist/')
}
