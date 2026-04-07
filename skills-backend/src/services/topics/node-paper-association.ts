type AssociationPaperFigure = {
  id?: string | null
  imagePath?: string | null
  caption?: string | null
}

export type AssociationPaperLike = {
  id: string
  title: string
  titleZh?: string | null
  titleEn?: string | null
  summary?: string | null
  explanation?: string | null
  coverPath?: string | null
  figures?: AssociationPaperFigure[]
  published: Date
}

export type AssociationNodeLike = {
  primaryPaperId: string | null
  nodeLabel: string
  nodeSubtitle?: string | null
  nodeSummary: string
  nodeExplanation?: string | null
  primaryPaper: {
    title: string
    titleZh?: string | null
    titleEn?: string | null
  }
  papers: Array<{
    paperId: string | null
  }>
}

type RelationConcept = {
  id:
    | 'end-to-end'
    | 'world-model'
    | 'dynamics'
    | 'unified'
    | 'generative'
    | 'multimodal'
    | 'language'
  aliases: string[]
  patterns: RegExp[]
  bonus: number
}

export type RelatedPaperScore = {
  score: number
  keywordScore: number
  conceptScore: number
  assetScore: number
  matchCount: number
  strongMatchCount: number
  titleMatchCount: number
  conceptMatches: string[]
}

const RELATED_PAPER_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'using',
  'based',
  'through',
  'autonomous',
  'driving',
  'vehicle',
  'vehicles',
  'study',
  'analysis',
  'system',
  'framework',
  'data',
  'dataset',
  'datasets',
  'results',
  'result',
  'problem',
  'problems',
  'task',
  'tasks',
  'approach',
  'approaches',
  'paper',
  'papers',
  'behavior',
  'behaviour',
  'large',
  'scale',
  'traffic',
  'research',
  'topic',
  'stage',
  'method',
  'methods',
  '\u95ee\u9898',
  '\u7814\u7a76',
  '\u65b9\u6cd5',
  '\u9636\u6bb5',
  '\u4e3b\u9898',
  '\u7cfb\u7edf',
  '\u6846\u67b6',
  '\u81ea\u52a8\u9a7e\u9a76',
])

const RELATION_CONCEPTS: RelationConcept[] = [
  {
    id: 'end-to-end',
    aliases: ['end to end', 'end-to-end', '\u7aef\u5230\u7aef'],
    patterns: [/\u7aef\u5230\u7aef/iu, /\bend to end\b/iu, /\bend-to-end\b/iu],
    bonus: 4,
  },
  {
    id: 'world-model',
    aliases: ['world model', 'latent world', 'rssm', 'dreamer', '\u4e16\u754c\u6a21\u578b'],
    patterns: [
      /\u4e16\u754c\u6a21\u578b/iu,
      /\bworld models?\b/iu,
      /\blatent world\b/iu,
      /\brssm\b/iu,
      /\bdreamer\b/iu,
    ],
    bonus: 8,
  },
  {
    id: 'dynamics',
    aliases: ['dynamics', 'kinematics', 'flow based', '\u52a8\u529b\u5b66', '\u8fd0\u52a8\u5b66'],
    patterns: [
      /\u52a8\u529b\u5b66/iu,
      /\u8fd0\u52a8\u5b66/iu,
      /\bdynamics?\b/iu,
      /\bkinematics?\b/iu,
      /\bflow based\b/iu,
      /\bflow-based\b/iu,
      /\btrajectory\b/iu,
    ],
    bonus: 4,
  },
  {
    id: 'unified',
    aliases: ['unified', 'single stage', 'single-stage', 'uniad', '\u7edf\u4e00', '\u4e00\u4f53\u5316'],
    patterns: [
      /\u7edf\u4e00/iu,
      /\u4e00\u4f53\u5316/iu,
      /\bunified\b/iu,
      /\bsingle stage\b/iu,
      /\bsingle-stage\b/iu,
      /\buniad\b/iu,
    ],
    bonus: 5,
  },
  {
    id: 'generative',
    aliases: ['generative', 'generation', 'diffusion', '\u751f\u6210\u5f0f'],
    patterns: [
      /\u751f\u6210\u5f0f/iu,
      /\bgenerative\b/iu,
      /\bgeneration\b/iu,
      /\bdiffusion\b/iu,
      /\bvideo vae\b/iu,
    ],
    bonus: 6,
  },
  {
    id: 'multimodal',
    aliases: ['multimodal', 'multi camera', 'lidar', '\u591a\u6a21\u6001'],
    patterns: [
      /\u591a\u6a21\u6001/iu,
      /\bmultimodal\b/iu,
      /\bmulti camera\b/iu,
      /\bmulti-camera\b/iu,
      /\blidar\b/iu,
      /\bvision language\b/iu,
      /\bmllm\b/iu,
    ],
    bonus: 6,
  },
  {
    id: 'language',
    aliases: ['language model', 'natural language', 'instruction', 'llm', '\u8bed\u8a00', '\u6307\u4ee4'],
    patterns: [
      /\u8bed\u8a00/iu,
      /\u6307\u4ee4/iu,
      /\bnatural language\b/iu,
      /\blanguage model\b/iu,
      /\blanguage-enhanced\b/iu,
      /\binstruction\b/iu,
      /\bllm\b/iu,
    ],
    bonus: 6,
  },
]

const ASSOCIATION_PROMPT_LEAK_PATTERNS = [
  /\bthe user wants\b/iu,
  /\bkey requirements?\b/iu,
  /\bstructure plan\b/iu,
  /\bsummary context\b/iu,
  /\breference paper\b/iu,
  /\brelated papers? to mention\b/iu,
  /\btone\b/iu,
  /\b500[\s-]*800\s*word\b/iu,
  /\bcritical judgment\b/iu,
  /\bevidence awareness\b/iu,
]

function normalizeRelationText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{Script=Han}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function shouldIgnoreAssociationField(value: string | null | undefined) {
  const normalized = normalizeRelationText(value)
  if (!normalized) return true
  return ASSOCIATION_PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(normalized))
}

function conceptLooksNegated(text: string, concept: RelationConcept) {
  return concept.aliases.some((alias) => {
    const normalizedAlias = normalizeRelationText(alias)
    if (!normalizedAlias) return false

    return (
      text.includes(`without ${normalizedAlias}`) ||
      text.includes(`lack ${normalizedAlias}`) ||
      text.includes(`lacks ${normalizedAlias}`) ||
      text.includes(`non ${normalizedAlias}`) ||
      text.includes(`not ${normalizedAlias}`)
    )
  })
}

function uniqueNormalized(values: string[], limit = values.length) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = normalizeRelationText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function relationTokenLooksNoisy(token: string) {
  return (
    /^\d+$/u.test(token) ||
    /^(?:node|paper|stage)$/u.test(token) ||
    /^(?:node|paper|stage)\d+$/u.test(token)
  )
}

function detectRelationConcepts(values: Array<string | null | undefined>) {
  const normalized = values.map((value) => normalizeRelationText(value)).filter(Boolean)
  const source = normalized.join(' ')

  return RELATION_CONCEPTS.filter((concept) =>
    concept.patterns.some((pattern) => pattern.test(source)) && !conceptLooksNegated(source, concept),
  )
}

export function collectTopicRelationKeywords(
  values: Array<string | null | undefined>,
  limit = 24,
) {
  const concepts = detectRelationConcepts(values)
  const conceptAliases = concepts.flatMap((concept) => concept.aliases)
  const phraseTokens: string[] = []
  const latinTokens: string[] = []
  const hanTokens: string[] = []

  for (const value of values) {
    const normalized = normalizeRelationText(value)
    if (!normalized) continue

    const matchedHan = normalized.match(/[\p{Script=Han}]{2,12}/gu) ?? []
    for (const token of matchedHan) {
      if (RELATED_PAPER_STOPWORDS.has(token)) continue
      hanTokens.push(token)
    }

    const matchedLatin = normalized
      .split(/\s+/u)
      .filter(
        (token) =>
          token.length >= 4 &&
          !RELATED_PAPER_STOPWORDS.has(token) &&
          !relationTokenLooksNoisy(token),
      )

    for (let index = 0; index < matchedLatin.length; index += 1) {
      const token = matchedLatin[index]
      latinTokens.push(token)

      const nextToken = matchedLatin[index + 1]
      if (!nextToken || relationTokenLooksNoisy(nextToken)) continue
      phraseTokens.push(`${token} ${nextToken}`)
    }
  }

  return uniqueNormalized(
    [...conceptAliases, ...phraseTokens, ...latinTokens, ...hanTokens],
    limit,
  )
}

function topicRelationKeywordWeight(keyword: string) {
  if (/[\p{Script=Han}]/u.test(keyword)) {
    return keyword.length >= 4 ? 4 : 3
  }

  if (keyword.includes(' ')) return 4
  if (keyword.length >= 9) return 3
  if (keyword.length >= 6) return 2
  return 1
}

function paperTitleHaystack(paper: AssociationPaperLike) {
  return normalizeRelationText([paper.titleZh, paper.titleEn, paper.title].filter(Boolean).join(' '))
}

function paperContentHaystack(paper: AssociationPaperLike) {
  return normalizeRelationText(
    [
      paper.titleZh,
      paper.titleEn,
      paper.title,
      shouldIgnoreAssociationField(paper.summary) ? '' : paper.summary,
      shouldIgnoreAssociationField(paper.explanation) ? '' : paper.explanation,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

export function scoreRelatedPaperAgainstNode(args: {
  paper: AssociationPaperLike
  keywords: string[]
  referenceValues: Array<string | null | undefined>
}): RelatedPaperScore {
  const { paper, keywords, referenceValues } = args
  const titleHaystack = paperTitleHaystack(paper)
  const haystack = paperContentHaystack(paper)

  if (!haystack) {
    return {
      score: 0,
      keywordScore: 0,
      conceptScore: 0,
      assetScore: 0,
      matchCount: 0,
      strongMatchCount: 0,
      titleMatchCount: 0,
      conceptMatches: [],
    }
  }

  let keywordScore = 0
  let matchCount = 0
  let strongMatchCount = 0
  let titleMatchCount = 0

  for (const keyword of keywords) {
    if (!keyword) continue

    const inTitle = titleHaystack.includes(keyword)
    const inContent = inTitle || haystack.includes(keyword)
    if (!inContent) continue

    const weight = topicRelationKeywordWeight(keyword) + (inTitle ? 2 : 0)
    keywordScore += weight
    matchCount += 1
    if (inTitle) {
      titleMatchCount += 1
    }
    if (weight >= 4 || inTitle || keyword.includes(' ')) {
      strongMatchCount += 1
    }
  }

  const referenceConcepts = detectRelationConcepts(referenceValues)
  const paperConcepts = new Set(detectRelationConcepts([
    paper.titleZh,
    paper.titleEn,
    paper.title,
    paper.summary,
    paper.explanation,
  ]).map((concept) => concept.id))
  const conceptMatches = referenceConcepts
    .filter((concept) => paperConcepts.has(concept.id))
    .map((concept) => concept.id)
  const conceptScore = referenceConcepts.reduce(
    (score, concept) => (paperConcepts.has(concept.id) ? score + concept.bonus : score),
    0,
  )

  if (conceptMatches.length > 0) {
    matchCount += conceptMatches.length
    strongMatchCount += conceptMatches.length
  }

  const figureCount = paper.figures?.length ?? 0
  const assetScore =
    (figureCount > 0 ? 2 : 0) +
    (figureCount >= 4 ? 1 : 0) +
    (paper.coverPath ? 1 : 0)

  return {
    score: keywordScore + conceptScore + assetScore,
    keywordScore,
    conceptScore,
    assetScore,
    matchCount,
    strongMatchCount,
    titleMatchCount,
    conceptMatches,
  }
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === 'string' && Boolean(value.trim()),
      ),
    ),
  )
}

function collectMentionedPaperIds(values: Array<string | null | undefined>) {
  const matches = new Set<string>()

  for (const value of values) {
    if (!value) continue

    for (const token of value.matchAll(/\bpaper-[a-z0-9-]+\b/giu)) {
      const paperId = (token[0] ?? '').toLowerCase()
      if (paperId) {
        matches.add(paperId)
      }
    }
  }

  return Array.from(matches)
}

export function collectNodeRelatedPaperIds<TPaper extends AssociationPaperLike>(args: {
  node: AssociationNodeLike
  stageTitle?: string | null
  papers: TPaper[]
  allowedPaperIds?: Iterable<string> | null
}) {
  const allowedPaperIds = args.allowedPaperIds
    ? new Set(
        Array.from(args.allowedPaperIds).filter(
          (paperId): paperId is string => typeof paperId === 'string' && paperId.trim().length > 0,
        ),
      )
    : null
  const directlyMentionedPaperIds = collectMentionedPaperIds([
    args.node.nodeLabel,
    args.node.nodeSubtitle,
    args.node.nodeSummary,
    args.node.nodeExplanation,
  ])
  const linkedIds = uniqueIds([
    args.node.primaryPaperId,
    ...args.node.papers.map((item) => item.paperId),
    ...directlyMentionedPaperIds,
  ]).filter((paperId) => !allowedPaperIds || allowedPaperIds.has(paperId))
  const scopedPapers = allowedPaperIds
    ? args.papers.filter((paper) => allowedPaperIds.has(paper.id))
    : args.papers

  const referenceValues = [
    args.node.nodeLabel,
    args.node.nodeSubtitle,
    args.node.nodeSummary,
    args.node.nodeExplanation,
    args.node.primaryPaper.titleZh,
    args.node.primaryPaper.titleEn,
    args.node.primaryPaper.title,
    args.stageTitle,
  ]
  const keywords = collectTopicRelationKeywords(referenceValues)

  if (keywords.length === 0) return linkedIds

  const primaryPaper = scopedPapers.find((paper) => paper.id === args.node.primaryPaperId) ?? null
  const primaryLooksThin =
    linkedIds.length <= 1 &&
    ((primaryPaper?.figures?.length ?? 0) === 0) &&
    !primaryPaper?.coverPath

  const scoredSupplementals = scopedPapers
    .filter((paper) => !linkedIds.includes(paper.id))
    .map((paper) => ({
      paperId: paper.id,
      publishedAt: paper.published.getTime(),
      relation: scoreRelatedPaperAgainstNode({
        paper,
        keywords,
        referenceValues,
      }),
    }))
    .sort((left, right) => {
      if (right.relation.score !== left.relation.score) {
        return right.relation.score - left.relation.score
      }
      if (right.relation.conceptScore !== left.relation.conceptScore) {
        return right.relation.conceptScore - left.relation.conceptScore
      }
      if (right.relation.keywordScore !== left.relation.keywordScore) {
        return right.relation.keywordScore - left.relation.keywordScore
      }
      return right.publishedAt - left.publishedAt
    })

  const strongSupplementalIds = scoredSupplementals
    .filter(
      (paper) =>
        paper.relation.conceptScore >= 5 ||
        ((paper.relation.keywordScore >= 7 || paper.relation.titleMatchCount >= 1) &&
          (paper.relation.conceptScore > 0 ||
            paper.relation.assetScore > 0 ||
            paper.relation.titleMatchCount > 0)) ||
        (paper.relation.matchCount >= 3 &&
          paper.relation.strongMatchCount >= 2 &&
          (paper.relation.conceptScore > 0 || paper.relation.assetScore > 0)),
    )
    .slice(0, primaryLooksThin ? 5 : 4)
    .map((paper) => paper.paperId)

  const broadenedVisualIds =
    primaryLooksThin || linkedIds.length <= 1
      ? scoredSupplementals
          .filter(
            (paper) =>
              paper.relation.assetScore >= 2 &&
              (paper.relation.conceptScore >= 4 ||
                paper.relation.keywordScore >= 4 ||
                paper.relation.titleMatchCount >= 1),
          )
          .slice(0, 3)
          .map((paper) => paper.paperId)
      : []

  const relevanceFallbackIds =
    linkedIds.length <= 1
      ? scoredSupplementals
          .filter(
            (paper) =>
              paper.relation.score >= 8 &&
              (paper.relation.strongMatchCount >= 1 || paper.relation.matchCount >= 2) &&
              (paper.relation.conceptScore > 0 ||
                paper.relation.assetScore > 0 ||
                paper.relation.titleMatchCount > 0),
          )
          .slice(0, 3)
          .map((paper) => paper.paperId)
      : []

  return uniqueIds([
    ...linkedIds,
    ...strongSupplementalIds,
    ...broadenedVisualIds,
    ...relevanceFallbackIds,
  ]).slice(0, primaryLooksThin ? 6 : 5)
}
