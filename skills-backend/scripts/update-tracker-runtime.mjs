import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const rootDir = process.cwd()
const generatedDataDir = path.join(rootDir, 'generated-data')
const appDataDir = path.join(generatedDataDir, 'app-data')
const configPath = path.join(appDataDir, 'workflow', 'topic-catalog.json')
const activeTopicsPath = path.join(appDataDir, 'workflow', 'active-topics.json')
const capabilityPath = path.join(appDataDir, 'workflow', 'capability-library.json')
const tmpDir = path.join(generatedDataDir, 'tmp', 'tracker-runtime')
const publicPaperDir = path.join(generatedDataDir, 'public', 'papers')
const catalogPath = path.join(appDataDir, 'paper-catalog.json')
const metricsPath = path.join(appDataDir, 'paper-metrics.json')
const assetsPath = path.join(appDataDir, 'paper-assets.json')
const memoryPath = path.join(appDataDir, 'workflow', 'topic-memory.json')

const config = readJson(configPath, { topics: [] })
const activeEntries = readJson(activeTopicsPath, [])
const capabilityLibrary = readJson(capabilityPath, [])
const existingMemory = readJson(memoryPath, {})

const activeTopicIds = new Set(
  (activeEntries ?? []).filter((entry) => entry?.status === 'active').map((entry) => entry.topicId),
)

fs.mkdirSync(tmpDir, { recursive: true })
fs.mkdirSync(publicPaperDir, { recursive: true })
fs.mkdirSync(path.dirname(memoryPath), { recursive: true })

const forceFigures = process.argv.includes('--force-figures')

const uniquePapers = new Map()
for (const topic of config.topics ?? []) {
  for (const paper of topic.papers ?? []) {
    if (!uniquePapers.has(paper.id)) {
      uniquePapers.set(paper.id, paper.version)
    }
  }
}

const arxivEntries = await fetchArxivEntries(Array.from(uniquePapers.entries()))
const metrics = {}
const assets = {}
const catalog = {}

for (const [paperId, version] of uniquePapers.entries()) {
  const entry = arxivEntries[paperId]
  if (!entry) continue

  catalog[paperId] = entry

  const citationCount = await fetchCitationCount(entry.title, paperId)
  metrics[paperId] = {
    citationCount,
    source: 'OpenAlex',
    retrievedAt: new Date().toISOString().slice(0, 10),
  }

  assets[paperId] = await ensurePaperAssets(paperId, version)
}

const memory = {}
for (const topic of config.topics ?? []) {
  const previous = existingMemory[topic.id] ?? {}

  if (!activeTopicIds.has(topic.id) && previous.topicId) {
    memory[topic.id] = {
      ...previous,
      lastBuiltAt: previous.lastBuiltAt ?? new Date().toISOString(),
    }
    continue
  }

  memory[topic.id] = normalizeTopicMemory(topic, previous, config.topics ?? [], capabilityLibrary, catalog)
}

writeJson(catalogPath, catalog)
writeJson(metricsPath, metrics)
writeJson(assetsPath, assets)
writeJson(memoryPath, memory)

console.log(`Wrote ${path.relative(rootDir, catalogPath)}`)
console.log(`Wrote ${path.relative(rootDir, metricsPath)}`)
console.log(`Wrote ${path.relative(rootDir, assetsPath)}`)
console.log(`Wrote ${path.relative(rootDir, memoryPath)}`)

function normalizeTopicMemory(topic, rawMemory, allTopics, capabilityLibrary, catalog) {
  const isV2 = rawMemory.schemaVersion === 2 && Array.isArray(rawMemory.problemNodes)
  if (isV2) {
    return {
      schemaVersion: 2,
      topicId: topic.id,
      originAudit: normalizeOriginAudit(topic, rawMemory.originAudit ?? {}, catalog),
      publishedMainlinePaperIds: asStringArray(rawMemory.publishedMainlinePaperIds, [
        topic.originPaperId,
      ]),
      publishedBranchPaperIds: asStringArray(rawMemory.publishedBranchPaperIds, []),
      candidatePaperIds: asStringArray(
        rawMemory.candidatePaperIds,
        topic.papers.filter((paper) => paper.status !== 'published').map((paper) => paper.id),
      ),
      seedPaperIds: asStringArray(
        rawMemory.seedPaperIds,
        topic.papers.filter((paper) => paper.status === 'seeded').map((paper) => paper.id),
      ),
      queryTags: asStringArray(rawMemory.queryTags, topic.queryTags ?? []),
      capabilityRefs: asStringArray(
        rawMemory.capabilityRefs,
        inferTopicCapabilities(topic.problemPreference ?? [], capabilityLibrary),
      ),
      bootstrapWindowDays: asNumber(rawMemory.bootstrapWindowDays, topic.bootstrapWindowDays ?? 30),
      expansionHistory: asExpansionHistory(rawMemory.expansionHistory, topic),
      problemNodes: asProblemNodes(rawMemory.problemNodes),
      branchTree: asBranchNodes(rawMemory.branchTree),
      recommendationQueue: asRecommendationQueue(rawMemory.recommendationQueue),
      decisionLog: asDecisionLog(rawMemory.decisionLog),
      lastBuiltAt: new Date().toISOString(),
      lastRewrittenAt: rawMemory.lastRewrittenAt ?? rawMemory.lastBuiltAt ?? new Date().toISOString(),
    }
  }

  return migrateLegacyMemory(topic, rawMemory, allTopics, capabilityLibrary, catalog)
}

function migrateLegacyMemory(topic, rawMemory, allTopics, capabilityLibrary, catalog) {
  const legacyProblemGraph = rawMemory.problemGraph ?? {}
  const publishedMainlinePaperIds = asStringArray(rawMemory.publishedPaperIds, [topic.originPaperId])
  const seedPaperIds = asStringArray(
    rawMemory.seedPaperIds,
    topic.papers.filter((paper) => paper.status === 'seeded').map((paper) => paper.id),
  )

  const problemNodes = Object.entries(legacyProblemGraph).flatMap(([parentPaperId, problems], groupIndex) =>
    (problems ?? []).map((problem, index) => {
      const question = asString(problem.question, '待补全问题')
      const problemTags = asStringArray(problem.problemTags, [])
      const requiredCapabilities = inferRequiredCapabilities(
        problemTags.concat(topic.problemPreference ?? []),
        capabilityLibrary,
      )
      const nextCandidates = asStringArray(problem.nextCandidates, [])
      const selectedNextPaperId = asString(problem.selectedNextPaperId, nextCandidates[0] ?? '')
      const problemId = asString(problem.id, `${topic.id}-problem-${groupIndex + 1}-${index + 1}`)

      return {
        id: problemId,
        stageTitle: question,
        stageDigest: asString(
          problem.whyThisPaperSolvesWhichProblem,
          '这一阶段的候选论文将围绕当前问题继续展开。',
        ),
        question,
        problemConstraints: inferProblemConstraints(question, problemTags),
        requiredCapabilities,
        parentPaperId,
        parentProblemNodeId: null,
        directCandidates: nextCandidates.map((paperId, candidateIndex) =>
          buildCandidate({
            paperId,
            candidateType: 'direct',
            supportedProblemIds: [problemId],
            supportedCapabilityIds: requiredCapabilities,
            whyThisCouldWork:
              paperId === selectedNextPaperId
                ? asString(
                    problem.whyThisPaperSolvesWhichProblem,
                    '它是当前问题最直接的承接候选。',
                  )
                : `它与“${question}”共享关键能力需求，因此保留为同题候选。`,
            requiredAssumptions: buildAssumptions(requiredCapabilities, capabilityLibrary),
            expectedFailureModes: buildFailureModes(requiredCapabilities, capabilityLibrary),
            noveltyVsMainline:
              candidateIndex === 0 ? '当前最直接的续写路径。' : '作为备选路径保留，用于和主干方案对照。',
            selectionScore: paperId === selectedNextPaperId ? 0.92 : Math.max(0.58, 0.78 - candidateIndex * 0.08),
            status: paperId === selectedNextPaperId ? 'selected' : 'watch',
            sourceTopicId: topic.id,
          }),
        ),
        transferCandidates: [],
        rejectedTransferCandidates: [],
        activeBranchIds: nextCandidates.map((paperId) => `branch:${problemId}:${paperId}`),
        resolutionStatus: nextCandidates.length > 0 ? 'branched' : 'open',
        confidence: 0.72,
      }
    }),
  )

  const problemNodesWithTransfers = problemNodes.map((problemNode) => ({
    ...problemNode,
    transferCandidates: inferTransferCandidates(problemNode, topic, allTopics, capabilityLibrary),
  }))

  const branchTree = problemNodesWithTransfers.flatMap((problemNode) =>
    [...problemNode.directCandidates, ...problemNode.transferCandidates].map((candidate) =>
      buildBranchNode(problemNode, candidate),
    ),
  )

  const selectedProblemIds = asStringArray(rawMemory.nextRecommendation?.derivedFromProblemIds, [
    problemNodesWithTransfers[0]?.id ?? '',
  ])
  const selectedPaperId = asString(
    rawMemory.nextRecommendation?.paperId,
    problemNodesWithTransfers[0]?.directCandidates[0]?.paperId ?? '',
  )

  return {
    schemaVersion: 2,
    topicId: topic.id,
    originAudit: normalizeOriginAudit(topic, rawMemory.originAudit ?? {}, catalog),
    publishedMainlinePaperIds,
    publishedBranchPaperIds: [],
    candidatePaperIds: seedPaperIds
      .concat(
        problemNodesWithTransfers.flatMap((problemNode) =>
          problemNode.transferCandidates.map((candidate) => candidate.paperId),
        ),
      )
      .filter((paperId, index, collection) => collection.indexOf(paperId) === index),
    seedPaperIds,
    queryTags: asStringArray(rawMemory.queryTags, topic.queryTags ?? []),
    capabilityRefs: inferTopicCapabilities(topic.problemPreference ?? [], capabilityLibrary),
    bootstrapWindowDays: asNumber(rawMemory.bootstrapWindowDays, topic.bootstrapWindowDays ?? 30),
    expansionHistory: asExpansionHistory(rawMemory.expansionHistory, topic),
    problemNodes: problemNodesWithTransfers,
    branchTree,
    recommendationQueue: buildRecommendationQueue(
      problemNodesWithTransfers,
      selectedProblemIds[0] ?? '',
      selectedPaperId,
    ),
    decisionLog: [
      {
        id: `${topic.id}-migration-origin`,
        timestamp: new Date().toISOString(),
        action: 'migrate-origin-audit',
        summary: '源头审计迁移到 topic-memory v2。',
        affectedProblemIds: [],
        affectedPaperIds: [topic.originPaperId],
        rationale: '沿用既有源头审计结果，并把主题治理从 skill 侧拆出。',
      },
      {
        id: `${topic.id}-migration-problems`,
        timestamp: new Date().toISOString(),
        action: 'migrate-problem-graph',
        summary: '旧 problemGraph 已迁移为问题节点、候选与分支树。',
        affectedProblemIds: problemNodesWithTransfers.map((problemNode) => problemNode.id),
        affectedPaperIds: seedPaperIds,
        rationale: '把单线推荐迁移为问题树、候选分支与推荐队列。',
      },
    ],
    lastBuiltAt: new Date().toISOString(),
    lastRewrittenAt: rawMemory.lastBuiltAt ?? new Date().toISOString(),
  }
}

function normalizeOriginAudit(topic, rawOriginAudit, catalog) {
  return {
    passed: rawOriginAudit.passed === false ? false : true,
    originPaperId: rawOriginAudit.originPaperId ?? topic.originPaperId,
    originConfirmedAt: rawOriginAudit.originConfirmedAt ?? topic.originConfirmedAt,
    originConfirmationMode: 'earliest-representative',
    originQuestionDefinition:
      rawOriginAudit.originQuestionDefinition ?? topic.originQuestionDefinition,
    originWhyThisCounts: rawOriginAudit.originWhyThisCounts ?? topic.originWhyThisCounts,
    earlierRejectedCandidates:
      rawOriginAudit.earlierRejectedCandidates ?? topic.earlierRejectedCandidates ?? [],
    checkedWindow:
      rawOriginAudit.checkedWindow ??
      inferCheckedWindow(topic.originPaperId, catalog[topic.originPaperId]?.published ?? ''),
  }
}

function inferTopicCapabilities(problemPreference, capabilityLibrary) {
  const matched = new Set()
  for (const keyword of problemPreference) {
    const normalizedKeyword = String(keyword).toLowerCase()
    for (const capability of capabilityLibrary) {
      if (
        (capability.applicabilitySignals ?? []).some(
          (signal) =>
            normalizedKeyword.includes(String(signal).toLowerCase()) ||
            String(signal).toLowerCase().includes(normalizedKeyword),
        )
      ) {
        matched.add(capability.id)
      }
    }
  }
  return Array.from(matched)
}

function inferRequiredCapabilities(signals, capabilityLibrary) {
  const matched = new Set()
  for (const signal of signals) {
    const normalizedSignal = String(signal).toLowerCase()
    for (const capability of capabilityLibrary) {
      if (
        (capability.applicabilitySignals ?? []).some(
          (item) =>
            normalizedSignal.includes(String(item).toLowerCase()) ||
            String(item).toLowerCase().includes(normalizedSignal),
        )
      ) {
        matched.add(capability.id)
      }
    }
  }
  return Array.from(matched)
}

function inferProblemConstraints(question, tags) {
  const constraints = [`当前问题围绕“${question}”展开，后续方法不能脱离既有主题主线。`]
  constraints.push(
    ...tags
      .slice(0, 2)
      .map((tag) => `候选方法至少要回应“${tag}”这一机制要求，而不是只改善表面指标。`),
  )
  return constraints
}

function buildAssumptions(capabilityIds, capabilityLibrary) {
  return capabilityIds.slice(0, 2).map((capabilityId) => {
    const capability = capabilityLibrary.find((item) => item.id === capabilityId)
    return capability
      ? `当前主题能够满足“${capability.name}”迁移所需的数据、状态或反馈条件。`
      : '当前主题具备支持该候选迁移的最小训练与评估条件。'
  })
}

function buildFailureModes(capabilityIds, capabilityLibrary) {
  return capabilityIds.slice(0, 2).map((capabilityId) => {
    const capability = capabilityLibrary.find((item) => item.id === capabilityId)
    return capability
      ? `若 ${capability.name} 依赖的假设在当前主题里不成立，这条路径可能只改善局部环节。`
      : '候选机制可能只对表面指标有效，而不能真正消解问题本体。'
  })
}

function inferTransferCandidates(problemNode, topic, allTopics, capabilityLibrary) {
  const requiredCapabilities = problemNode.requiredCapabilities ?? []
  if (requiredCapabilities.length === 0) return []

  const currentTopicPaperIds = new Set((topic.papers ?? []).map((paper) => paper.id))
  const scoredCandidates = allTopics
    .filter((candidateTopic) => candidateTopic.id !== topic.id)
    .flatMap((candidateTopic) =>
      (candidateTopic.papers ?? []).map((paper) => {
        const otherCapabilities = inferTopicCapabilities(
          candidateTopic.problemPreference ?? [],
          capabilityLibrary,
        )
        const shared = otherCapabilities.filter((capabilityId) =>
          requiredCapabilities.includes(capabilityId),
        )
        return {
          paper,
          candidateTopic,
          shared,
          score: shared.length / Math.max(requiredCapabilities.length, 1),
        }
      }),
    )
    .filter(({ paper, shared }) => shared.length > 0 && !currentTopicPaperIds.has(paper.id))
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)

  return scoredCandidates.map(({ paper, candidateTopic, shared, score }) =>
    buildCandidate({
      paperId: paper.id,
      candidateType: 'transfer',
      supportedProblemIds: [problemNode.id],
      supportedCapabilityIds: shared,
      whyThisCouldWork: `${candidateTopic.nameZh} 主题中的这篇论文并非为当前问题而写，但它在 ${shared
        .map((capabilityId) => capabilityLibrary.find((item) => item.id === capabilityId)?.name ?? capabilityId)
        .join('、')} 上提供了可迁移机制。`,
      requiredAssumptions: buildAssumptions(shared, capabilityLibrary),
      expectedFailureModes: buildFailureModes(shared, capabilityLibrary),
      noveltyVsMainline: `它来自 ${candidateTopic.nameZh} 主题，因此更适合作为迁移路径而非默认主干。`,
      selectionScore: Number(Math.min(0.86, 0.45 + score * 0.4).toFixed(2)),
      status: 'watch',
      sourceTopicId: candidateTopic.id,
    }),
  )
}

function buildCandidate(candidate) {
  return candidate
}

function buildBranchNode(problemNode, candidate) {
  return {
    id: `branch:${problemNode.id}:${candidate.paperId}`,
    rootProblemNodeId: problemNode.id,
    label: candidate.candidateType === 'direct' ? '主干候选分支' : '迁移候选分支',
    branchType: candidate.candidateType,
    paperPath: [candidate.paperId],
    status: candidate.status === 'selected' ? 'branch_active' : 'candidate',
    summary: candidate.whyThisCouldWork,
    promotionPolicy: '当候选论文完成正式长文深写后，可晋级为主时间线或已成形分支。',
    mergeBackPolicy: '通过后续汇流章节解释该分支是否重写主干或保持并行路径。',
    supersededBy: null,
    rewriteImpact:
      candidate.candidateType === 'direct'
        ? '优先影响主时间线的下一阶段排序。'
        : '作为迁移路径挑战当前主线的单一路径假设。',
  }
}

function buildRecommendationQueue(problemNodes, selectedProblemId, selectedPaperId) {
  return problemNodes
    .flatMap((problemNode) => {
      const candidates = [...(problemNode.directCandidates ?? []), ...(problemNode.transferCandidates ?? [])]
      return candidates
        .filter((candidate) => candidate.status !== 'rejected')
        .map((candidate) => ({
          paperId: candidate.paperId,
          derivedFromProblemIds: [problemNode.id],
          candidateType: candidate.candidateType,
          why: candidate.whyThisCouldWork,
          confidence: candidate.selectionScore,
          status:
            candidate.paperId === selectedPaperId && problemNode.id === selectedProblemId
              ? 'selected'
              : candidate.status === 'selected'
                ? 'queued'
                : 'deferred',
        }))
    })
    .sort((left, right) => right.confidence - left.confidence)
}

function asString(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value, fallback) {
  return typeof value === 'number' ? value : fallback
}

function asStringArray(value, fallback) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : fallback
}

function asExpansionHistory(value, topic) {
  if (Array.isArray(value)) return value
  return [
    {
      fromPaperId: topic.originPaperId,
      windowDays: topic.bootstrapWindowDays ?? 30,
      reason: topic.expansionNote ?? '',
    },
  ]
}

function asProblemNodes(value) {
  return Array.isArray(value) ? value : []
}

function asBranchNodes(value) {
  return Array.isArray(value) ? value : []
}

function asRecommendationQueue(value) {
  return Array.isArray(value) ? value : []
}

function asDecisionLog(value) {
  return Array.isArray(value) ? value : []
}

async function fetchArxivEntries(papers) {
  const result = {}
  const batches = []
  for (let index = 0; index < papers.length; index += 10) {
    batches.push(papers.slice(index, index + 10))
  }

  for (const batch of batches) {
    const ids = batch.map(([paperId]) => paperId).join(',')
    const url = `https://export.arxiv.org/api/query?id_list=${ids}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'codex-tracker/2.0' },
    })

    if (!response.ok) {
      throw new Error(`failed to fetch arXiv metadata: ${response.status}`)
    }

    const xml = await response.text()
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1])

    for (const entry of entries) {
      const idMatch = entry.match(/<id>http:\/\/arxiv.org\/abs\/([^<]+)<\/id>/)
      const idWithVersion = idMatch?.[1] ?? ''
      const paperId = idWithVersion.split('v')[0]
      result[paperId] = {
        id: paperId,
        version: idWithVersion.replace(`${paperId}`, '') || '',
        title: normalizeWhitespace(matchTag(entry, 'title')),
        summary: normalizeWhitespace(matchTag(entry, 'summary')),
        published: matchTag(entry, 'published'),
        authors: [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((item) => item[1]),
        arxivUrl: `https://arxiv.org/abs/${paperId}`,
        pdfUrl: `https://arxiv.org/pdf/${paperId}.pdf`,
      }
    }
  }

  return result
}

async function fetchCitationCount(title, paperId) {
  const queryUrl = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=8`
  const response = await fetch(queryUrl, {
    headers: { 'User-Agent': 'codex-tracker/2.0' },
  })

  if (!response.ok) return null

  const json = await response.json()
  const normalizedTarget = normalizeTitle(title)
  const ranked = (json.results ?? [])
    .map((item) => {
      const candidateTitle = normalizeTitle(item.title ?? '')
      const doi = item.doi ?? ''
      let score = 0

      if (candidateTitle === normalizedTarget) score += 100
      if (candidateTitle.includes(normalizedTarget) || normalizedTarget.includes(candidateTitle)) score += 25
      if (doi.toLowerCase().includes(paperId.toLowerCase())) score += 60

      return {
        score,
        citedByCount: item.cited_by_count ?? null,
      }
    })
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.citedByCount ?? null
}

async function ensurePaperAssets(paperId, version) {
  const paperDir = path.join(publicPaperDir, paperId)
  const manifestPath = path.join(paperDir, 'manifest.json')
  const existingManifest = fs.existsSync(manifestPath) ? readJson(manifestPath, null) : null

  if (!forceFigures && existingManifest?.coverSource) {
    return existingManifest
  }

  fs.rmSync(paperDir, { recursive: true, force: true })
  fs.mkdirSync(paperDir, { recursive: true })

  const tarPath = path.join(tmpDir, `${paperId}.tar.gz`)
  const extractDir = path.join(tmpDir, paperId)
  const pdfPath = path.join(tmpDir, `${paperId}.pdf`)
  fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })

  const figureCandidates = []

  try {
    const response = await fetch(`https://arxiv.org/e-print/${paperId}${version}`, {
      headers: { 'User-Agent': 'codex-tracker/2.0' },
    })

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(tarPath, buffer)
      await untar(tarPath, extractDir)

      const sourceFiles = []
      walkFiles(extractDir, (filePath) => {
        if (/\.(png|jpg|jpeg|svg|pdf)$/i.test(filePath)) {
          sourceFiles.push(filePath)
        }
      })

      for (const filePath of sourceFiles) {
        const extension = path.extname(filePath).toLowerCase()
        const baseName = sanitizeFilename(path.basename(filePath, extension))
        const targetPath = path.join(
          paperDir,
          extension === '.pdf' ? `${baseName}.png` : `${baseName}${extension}`,
        )

        if (extension === '.pdf') {
          await renderPdfAsset(filePath, targetPath, 'page')
          figureCandidates.push(buildFigureCandidate(paperId, path.basename(targetPath), 'source-pdf-figure'))
          continue
        }

        fs.copyFileSync(filePath, targetPath)
        figureCandidates.push(
          buildFigureCandidate(
            paperId,
            path.basename(targetPath),
            extension === '.svg' ? 'source-vector' : 'source-raster',
          ),
        )
      }
    }
  } catch (error) {
    console.warn(`Source extraction failed for ${paperId}:`, error instanceof Error ? error.message : String(error))
  }

  let bestSourceScore = figureCandidates.reduce((best, item) => Math.max(best, item.score), Number.NEGATIVE_INFINITY)
  if (!Number.isFinite(bestSourceScore)) bestSourceScore = Number.NEGATIVE_INFINITY

  const shouldGeneratePdfFallback = figureCandidates.length === 0 || bestSourceScore < 12
  if (shouldGeneratePdfFallback) {
    await downloadBinary(`https://arxiv.org/pdf/${paperId}.pdf`, pdfPath)
    const fallbackName = 'pdf-fallback-cover.png'
    const fallbackPath = path.join(paperDir, fallbackName)
    const renderMode = await renderPdfAsset(pdfPath, fallbackPath, 'auto-cover')
    figureCandidates.push(
      buildFigureCandidate(
        paperId,
        fallbackName,
        renderMode === 'embedded-image' ? 'paper-pdf-embedded' : 'paper-pdf-page-fallback',
      ),
    )
  }

  figureCandidates.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
  const coverCandidate = figureCandidates[0] ?? null
  const manifest = {
    coverPath: coverCandidate?.path ?? null,
    figurePaths: figureCandidates.slice(0, 6).map((item) => item.path),
    coverSource: coverCandidate?.source ?? null,
    extractedAt: new Date().toISOString(),
    figureCount: figureCandidates.length,
  }

  writeJson(manifestPath, manifest)
  return manifest
}

function buildFigureCandidate(paperId, filename, source) {
  return {
    name: filename,
    path: `/papers/${paperId}/${filename}`,
    source,
    score: scoreFigure(filename, source),
  }
}

async function downloadBinary(url, filePath) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'codex-tracker/2.0' },
  })

  if (!response.ok) {
    throw new Error(`failed to download ${url}: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(filePath, buffer)
}

function walkFiles(dirPath, visit) {
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      walkFiles(fullPath, visit)
    } else {
      visit(fullPath)
    }
  }
}

function scoreFigure(filename, source) {
  const lowered = filename.toLowerCase()
  let score = 0

  for (const goodWord of [
    'architecture',
    'framework',
    'pipeline',
    'overview',
    'overall',
    'system',
    'algorithm',
    'method',
    'teaser',
    'intro',
    'diagram',
    'model',
    'block',
  ]) {
    if (lowered.includes(goodWord)) score += 16
  }

  for (const mediumWord of ['fig1', 'main', 'arch', 'overview-2', 'structure']) {
    if (lowered.includes(mediumWord)) score += 8
  }

  for (const badWord of [
    'logo',
    'appendix',
    'failure',
    'ablation',
    'qual',
    'table',
    'preview',
    'sample',
    'task',
    'dataset',
    'result',
    'barplot',
  ]) {
    if (lowered.includes(badWord)) score -= 14
  }

  if (source === 'paper-pdf-embedded') score += 12
  if (source === 'paper-pdf-page-fallback') score += 6
  if (source === 'source-pdf-figure') score += 8
  if (/\.(png|jpg|jpeg)$/i.test(filename)) score += 2
  if (lowered.includes('pdf-fallback')) score -= 1

  return score
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function untar(sourcePath, targetDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', sourcePath, '-C', targetDir])
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`tar exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

function renderPdfAsset(inputPath, outputPath, mode = 'page') {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [
      path.join(rootDir, 'skills-backend', 'scripts', 'render_pdf_cover.py'),
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--mode',
      mode,
    ])

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || 'page-render')
        return
      }
      reject(new Error(`render_pdf_cover.py exited with code ${code}: ${stderr}`))
    })
    child.on('error', reject)
  })
}

function inferCheckedWindow(originPaperId, published) {
  const year = published ? published.slice(0, 4) : ''
  if (originPaperId === '1604.07316') {
    return { beforeOriginFrom: '2015-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  if (originPaperId === '1706.03762') {
    return { beforeOriginFrom: '2014-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  if (originPaperId === '1803.08554') {
    return { beforeOriginFrom: '2002-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  if (originPaperId === '2204.01691' || originPaperId === '2210.03629') {
    return { beforeOriginFrom: '2021-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  return { beforeOriginFrom: `${year || '2010'}-01-01`, beforeOriginTo: published.slice(0, 10) }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function matchTag(text, tagName) {
  return text.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`))?.[1] ?? ''
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
