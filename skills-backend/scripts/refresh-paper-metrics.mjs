import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const metricsPath = path.join(repoRoot, 'src', 'data', 'paper-metrics.json')

async function fetchSemanticScholar(arxivId) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/ARXIV:${arxivId}?fields=title,citationCount,url`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'transformer-tracker/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Semantic Scholar request failed: ${response.status}`)
  }

  const payload = await response.json()
  if (typeof payload.citationCount !== 'number') {
    throw new Error('Semantic Scholar response missing citationCount')
  }

  return {
    citationCount: payload.citationCount,
    source: 'Semantic Scholar',
    url: payload.url ?? `https://www.semanticscholar.org/search?q=${encodeURIComponent(payload.title ?? arxivId)}`,
  }
}

async function main() {
  const raw = await fs.readFile(metricsPath, 'utf8')
  const metrics = JSON.parse(raw)
  const today = new Date().toISOString().slice(0, 10)

  for (const arxivId of Object.keys(metrics)) {
    try {
      const latest = await fetchSemanticScholar(arxivId)
      metrics[arxivId] = {
        ...metrics[arxivId],
        ...latest,
        retrievedAt: today,
      }
      console.log(`updated ${arxivId}: ${latest.citationCount}`)
    } catch (error) {
      console.error(`failed ${arxivId}:`, error instanceof Error ? error.message : error)
    }
  }

  await fs.writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
