import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function readArg(flag: string) {
  const entry = process.argv.find((value) => value.startsWith(`${flag}=`))
  return entry ? entry.slice(flag.length + 1) : undefined
}

function normalizePdfUrl(rawUrl: string | null | undefined) {
  const value = rawUrl?.trim() ?? ''
  if (!value) return ''

  const arxivDoiMatch = value.match(
    /^https?:\/\/doi\.org\/10\.48550\/arxiv\.([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivDoiMatch) {
    return `https://arxiv.org/pdf/${arxivDoiMatch[1]}.pdf`
  }

  const arxivAbsMatch = value.match(
    /^https?:\/\/arxiv\.org\/abs\/([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivAbsMatch) {
    return `https://arxiv.org/pdf/${arxivAbsMatch[1]}.pdf`
  }

  const arxivPdfMatch = value.match(
    /^https?:\/\/arxiv\.org\/pdf\/([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivPdfMatch) {
    return value.endsWith('.pdf') ? value : `${value}.pdf`
  }

  return value
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  limit: number,
  iteratee: (value: TInput, index: number) => Promise<TOutput>,
) {
  if (values.length === 0) return [] as TOutput[]

  const results = new Array<TOutput>(values.length)
  const concurrency = Math.max(1, Math.min(limit, values.length))
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await iteratee(values[currentIndex], currentIndex)
      }
    }),
  )

  return results
}

async function main() {
  const topicId = readArg('--topicId') ?? process.argv[2]
  if (!topicId) {
    console.error(
      'Usage: node --import tsx src/scripts/extract-topic-pdfs.ts --topicId=<topic-id> [--origin=http://127.0.0.1:3303] [--force=true] [--limit=20] [--concurrency=2]',
    )
    process.exit(1)
  }

  const origin = (readArg('--origin') ?? 'http://127.0.0.1:3303').replace(/\/+$/u, '')
  const force = /^true$/iu.test(readArg('--force') ?? 'false')
  const limit = Math.max(1, Number.parseInt(readArg('--limit') ?? '100', 10) || 100)
  const concurrency = Math.max(1, Math.min(4, Number.parseInt(readArg('--concurrency') ?? '2', 10) || 2))

  const topic = await prisma.topics.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      nameZh: true,
    },
  })

  if (!topic) {
    throw new Error(`Topic not found: ${topicId}`)
  }

  // Query papers separately since papers relation may not be nested in topics
  const papers = await prisma.papers.findMany({
    where: { topicId },
    orderBy: { published: 'asc' },
    select: {
      id: true,
      title: true,
      titleZh: true,
      arxivUrl: true,
      pdfUrl: true,
      figures: { select: { id: true } },
      tables: { select: { id: true } },
      formulas: { select: { id: true } },
      paper_sections: { select: { id: true } },
    },
  })

  const queue = papers
    .map((paper) => {
      const pdfUrl = normalizePdfUrl(paper.pdfUrl || paper.arxivUrl)
      const extractedCount =
        paper.figures.length + paper.tables.length + paper.formulas.length + paper.paper_sections.length
      return {
        ...paper,
        pdfUrl,
        extractedCount,
      }
    })
    .filter((paper) => paper.pdfUrl)
    .filter((paper) => force || paper.extractedCount === 0)
    .slice(0, limit)

  const results = await mapWithConcurrency(queue, concurrency, async (paper) => {
    const response = await fetch(`${origin}/api/pdf/extract-from-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        paperId: paper.id,
        paperTitle: paper.titleZh || paper.title,
        pdfUrl: paper.pdfUrl,
      }),
    })

    const body = await response.text()
    if (!response.ok) {
      return {
        paperId: paper.id,
        title: paper.titleZh || paper.title,
        ok: false,
        status: response.status,
        error: body.slice(0, 400),
      }
    }

    let parsed: any = null
    try {
      parsed = JSON.parse(body)
    } catch {
      parsed = null
    }

    return {
      paperId: paper.id,
      title: paper.titleZh || paper.title,
      ok: true,
      status: response.status,
      figureCount: parsed?.data?.figureCount ?? 0,
      tableCount: parsed?.data?.tableCount ?? 0,
      formulaCount: parsed?.data?.formulaCount ?? 0,
    }
  })

  const succeeded = results.filter((result) => result.ok)
  const failed = results.filter((result) => !result.ok)

  console.log(
    JSON.stringify(
      {
        success: failed.length === 0,
        topicId: topic.id,
        topicTitle: topic.nameZh,
        attempted: results.length,
        succeeded: succeeded.length,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  )

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

void main()
  .catch((error) => {
    console.error('[extract-topic-pdfs] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
