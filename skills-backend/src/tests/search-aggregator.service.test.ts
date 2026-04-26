import assert from 'node:assert/strict'
import test from 'node:test'

import { SearchAggregator } from '../services/search/search-aggregator'
import type { SemanticScholarPaper } from '../services/search/semantic-scholar'
import type { SearchResult } from '../../skill-packs/research/paper-tracker/discovery-engine'

function buildSemanticScholarPaper(
  overrides: Partial<SemanticScholarPaper> = {},
): SemanticScholarPaper {
  return {
    paperId: 's2-paper',
    title: 'Long-Horizon Research Agents',
    abstract: 'A paper about sustained research orchestration.',
    authors: [{ name: 'Ada Lovelace' }],
    year: 2025,
    citationCount: 48,
    referenceCount: 20,
    influentialCitationCount: 7,
    venue: 'NeurIPS',
    fieldsOfStudy: ['Artificial Intelligence'],
    publicationTypes: ['Conference'],
    externalIds: {
      ArXiv: '2501.00001',
      DOI: '10.1000/test-doi',
    },
    openAccessPdf: {
      url: 'https://example.com/s2.pdf',
      status: 'GREEN',
    },
    ...overrides,
  }
}

function buildSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    paperId: '2501.00001',
    title: 'Long-Horizon Research Agents',
    abstract: 'An arXiv preprint about sustained research orchestration.',
    published: '2025-01-10T00:00:00.000Z',
    authors: ['Ada Lovelace'],
    relevanceScore: 0.95,
    matchedQueryIds: ['q-1'],
    source: 'arxiv',
    pdfUrl: 'https://arxiv.org/pdf/2501.00001.pdf',
    categories: ['cs.AI'],
    citationCount: 12,
    ...overrides,
  }
}

test('SearchAggregator deduplicates cross-source papers and merges evidence', async () => {
  const aggregator = new SearchAggregator()

  const result = await aggregator.aggregateResults(
    [buildSemanticScholarPaper()],
    [buildSearchResult()],
    [],
  )

  assert.equal(result.stats.totalInput, 2)
  assert.equal(result.stats.totalAfterDedup, 1)
  assert.equal(result.stats.duplicateMatches, 1)
  assert.equal(result.papers.length, 1)
  assert.deepEqual(result.papers[0]?.sources.sort(), ['arxiv', 'semantic-scholar'])
  assert.equal(result.papers[0]?.citationCount, 48)
  assert.equal(result.papers[0]?.arxivId, '2501.00001')
  assert.equal(result.papers[0]?.doi, '10.1000/test-doi')
  assert.ok((result.papers[0]?.duplicateIds?.length ?? 0) >= 1)
})

test('SearchAggregator filters low-quality results while keeping strong candidates', async () => {
  const aggregator = new SearchAggregator({
    minCitations: 10,
    minQualityScore: 15,
    enableBroadCandidateAdmission: false,
  })

  const result = await aggregator.aggregateResults(
    [
      buildSemanticScholarPaper({
        paperId: 'strong-paper',
        title: 'Strong Research Agents',
        externalIds: { DOI: '10.1000/strong-doi' },
        citationCount: 120,
        influentialCitationCount: 18,
        year: new Date().getFullYear(),
      }),
      buildSemanticScholarPaper({
        paperId: 'weak-paper',
        title: 'Weak Research Agents',
        externalIds: { DOI: '10.1000/weak-doi' },
        citationCount: 0,
        influentialCitationCount: 0,
        venue: 'Workshop',
        year: 2017,
      }),
    ],
    [],
    [],
  )

  assert.equal(result.papers.length, 1)
  assert.equal(result.papers[0]?.paperId, 'strong-paper')
  assert.equal(result.filteredPapers.length, 1)
  assert.equal(result.filteredPapers[0]?.paperId, 'weak-paper')
  assert.equal(result.stats.totalAfterQualityFilter, 1)
})

test('SearchAggregator keeps recent accessible papers as broad duration-stage candidates', async () => {
  const aggregator = new SearchAggregator({
    minCitations: 50,
    minQualityScore: 80,
  })

  const result = await aggregator.aggregateResults(
    [],
    [
      buildSearchResult({
        paperId: '2601.00042',
        title: 'Fresh but Useful Long Duration Research Scaffolds',
        abstract: 'A recent preprint with direct relevance to sustained research orchestration.',
        published: `${new Date().getFullYear()}-01-10T00:00:00.000Z`,
        citationCount: 0,
        pdfUrl: 'https://arxiv.org/pdf/2601.00042.pdf',
      }),
    ],
    [],
  )

  assert.equal(result.papers.length, 1)
  assert.equal(result.papers[0]?.paperId, '2601.00042')
  assert.equal(result.filteredPapers.length, 0)
})
