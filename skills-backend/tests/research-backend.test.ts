import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { runSkillDefinition } from '../engine/runner.ts'
import { persistArtifactChanges } from '../engine/storage/index.ts'
import {
  contentGenesisSkill,
  orchestratorSkill,
  paperTrackerSkill,
  topicVisualizerSkill,
} from '../skill-packs/research/index.ts'
import {
  normalizeBranchRegistry,
  normalizePaperRelations,
  normalizeStageLedger,
} from '../shared/research-graph.ts'
import { normalizeDecisionMemoryFile, normalizeExecutionMemoryFile } from '../shared/research-memory.ts'
import { writeCompiledTopics } from '../topic-config/compile-topics.ts'
import { ModelRuntimeClient } from '../../model-runtime/src/runtime/client.ts'

type MockPaper = {
  paperId: string
  workId: string
  title: string
  published: string
  authors: string[]
  abstract: string
  citationCount: number
  relatedWorkIds?: string[]
  referencedWorkIds?: string[]
  citedByWorkIds?: string[]
}

const ORIGIN_PAPER_ID = '2210.03629'
const STAGE_ONE_SELECTED_PAPER_ID = '2303.11366'
const STAGE_ONE_DEFERRED_PAPER_ID = '2303.17760'
const STAGE_TWO_SELECTED_PAPER_ID = '2308.08155'

const MOCK_PAPERS: Record<string, MockPaper> = {
  [ORIGIN_PAPER_ID]: {
    paperId: ORIGIN_PAPER_ID,
    workId: 'W221003629',
    title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
    published: '2022-10-06T00:00:00.000Z',
    authors: ['Shunyu Yao', 'Jeffrey Zhao', 'Dian Yu'],
    abstract:
      'ReAct interleaves reasoning traces and actions so language agents can query environments, inspect feedback, and continue deliberation with grounded observations.',
    citationCount: 320,
    relatedWorkIds: ['W230311366', 'W230317760'],
    citedByWorkIds: ['W230311366', 'W230317760'],
  },
  [STAGE_ONE_SELECTED_PAPER_ID]: {
    paperId: STAGE_ONE_SELECTED_PAPER_ID,
    workId: 'W230311366',
    title: 'Reflexion: Language Agents with Verbal Reinforcement Learning',
    published: '2023-03-21T00:00:00.000Z',
    authors: ['Noah Shinn', 'Federico Cassano', 'Ashwin Gopinath'],
    abstract:
      'Reflexion teaches language agents to critique prior attempts, store verbal lessons, and use those lessons to improve tool-using decision loops over repeated trials.',
    citationCount: 260,
    relatedWorkIds: ['W230808155'],
    citedByWorkIds: ['W230808155'],
  },
  [STAGE_ONE_DEFERRED_PAPER_ID]: {
    paperId: STAGE_ONE_DEFERRED_PAPER_ID,
    workId: 'W230317760',
    title: 'CAMEL: Communicative Agents for Mind Exploration of Large Language Model Society',
    published: '2023-03-30T00:00:00.000Z',
    authors: ['Guohao Li', 'Yuhan Wang', 'Boshi Wang'],
    abstract:
      'CAMEL studies role-playing language agents, showing how collaboration protocols can be shaped into reusable multi-agent communication traces.',
    citationCount: 190,
    relatedWorkIds: ['W230808155'],
    citedByWorkIds: ['W230808155'],
  },
  [STAGE_TWO_SELECTED_PAPER_ID]: {
    paperId: STAGE_TWO_SELECTED_PAPER_ID,
    workId: 'W230808155',
    title: 'AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation',
    published: '2023-08-16T00:00:00.000Z',
    authors: ['Qingyun Wu', 'Gagan Bansal', 'Jeffrey Zhao'],
    abstract:
      'AutoGen packages multi-agent conversation patterns, tool orchestration, and reusable workflows into a developer-facing framework for LLM systems.',
    citationCount: 410,
  },
}

const MOCK_PAPERS_BY_WORK_ID = new Map(
  Object.values(MOCK_PAPERS).map((paper) => [paper.workId, paper] as const),
)

function buildOpenAIChatResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 900,
        total_tokens: 2100,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}

function buildJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function buildXmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/atom+xml',
    },
  })
}

function extractRequestUrl(input: string | URL | Request) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function extractOpenAIUserText(init?: RequestInit) {
  const payload = JSON.parse(String(init?.body ?? '{}')) as {
    messages?: Array<{ role?: string; content?: Array<{ text?: string }> }>
  }
  const userMessage = (payload.messages ?? []).find((message) => message.role === 'user')
  return {
    payload,
    userText: Array.isArray(userMessage?.content)
      ? userMessage.content.map((part) => part.text ?? '').join('\n')
      : '',
  }
}

function extractJsonObjectText(value: string) {
  const fenced = value.match(/```json\s*([\s\S]*?)```/iu)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const objectStart = value.indexOf('{')
  const objectEnd = value.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    return value.slice(objectStart, objectEnd + 1)
  }

  throw new Error('Expected prompt to contain a JSON object payload.')
}

function parsePromptContext<T>(userText: string) {
  return JSON.parse(extractJsonObjectText(userText)) as T
}

function buildArxivFeed(paperIds: string[]) {
  const entries = paperIds
    .map((paperId) => MOCK_PAPERS[paperId])
    .filter((paper): paper is MockPaper => Boolean(paper))
    .map(
      (paper) => `
  <entry>
    <id>http://arxiv.org/abs/${paper.paperId}v1</id>
    <published>${paper.published}</published>
    <updated>${paper.published}</updated>
    <title>${paper.title}</title>
    <summary>${paper.abstract}</summary>
    ${paper.authors.map((author) => `<author><name>${author}</name></author>`).join('')}
  </entry>`,
    )
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    entries,
    '</feed>',
  ].join('\n')
}

function buildOpenAlexWork(paper: MockPaper) {
  return {
    id: paper.workId,
    title: paper.title,
    publication_date: paper.published.slice(0, 10),
    publication_year: Number(paper.published.slice(0, 4)),
    authorships: paper.authors.map((author) => ({
      author: {
        display_name: author,
      },
    })),
    abstract_inverted_index: paper.abstract.split(/\s+/).reduce<Record<string, number[]>>((accumulator, word, index) => {
      const normalized = word.replace(/[^a-zA-Z0-9-]/g, '')
      if (!normalized) return accumulator
      accumulator[normalized] = [...(accumulator[normalized] ?? []), index]
      return accumulator
    }, {}),
    primary_location: {
      landing_page_url: `https://arxiv.org/abs/${paper.paperId}`,
      pdf_url: `https://arxiv.org/pdf/${paper.paperId}.pdf`,
    },
    ids: {
      arxiv: `https://arxiv.org/abs/${paper.paperId}`,
    },
    cited_by_count: paper.citationCount,
    related_works: paper.relatedWorkIds ?? [],
    referenced_works: paper.referencedWorkIds ?? [],
    cited_by_api_url: `https://api.openalex.org/works?filter=cites:${paper.workId}`,
    locations: [
      {
        landing_page_url: `https://arxiv.org/abs/${paper.paperId}`,
      },
    ],
  }
}

function normalizeSearchQuery(value: string | null) {
  return decodeURIComponent(value ?? '')
    .replace(/\+/g, ' ')
    .toLowerCase()
    .trim()
}

function buildSearchResults(searchQuery: string) {
  const normalized = normalizeSearchQuery(searchQuery)
  if (normalized.includes('react')) {
    return [buildOpenAlexWork(MOCK_PAPERS[ORIGIN_PAPER_ID])]
  }
  if (normalized.includes('reflexion')) {
    return [buildOpenAlexWork(MOCK_PAPERS[STAGE_ONE_SELECTED_PAPER_ID])]
  }
  if (normalized.includes('camel')) {
    return [buildOpenAlexWork(MOCK_PAPERS[STAGE_ONE_DEFERRED_PAPER_ID])]
  }
  if (normalized.includes('autogen')) {
    return [buildOpenAlexWork(MOCK_PAPERS[STAGE_TWO_SELECTED_PAPER_ID])]
  }

  return [
    buildOpenAlexWork(MOCK_PAPERS[STAGE_ONE_SELECTED_PAPER_ID]),
    buildOpenAlexWork(MOCK_PAPERS[STAGE_ONE_DEFERRED_PAPER_ID]),
    buildOpenAlexWork(MOCK_PAPERS[STAGE_TWO_SELECTED_PAPER_ID]),
  ]
}

function buildCitedByResults(workId: string) {
  const paper = MOCK_PAPERS_BY_WORK_ID.get(workId)
  return (paper?.citedByWorkIds ?? [])
    .map((candidateWorkId) => MOCK_PAPERS_BY_WORK_ID.get(candidateWorkId))
    .filter((candidate): candidate is MockPaper => Boolean(candidate))
    .map(buildOpenAlexWork)
}

function pickPreferredPaperId(candidatePaperIds: string[]) {
  if (candidatePaperIds.includes(STAGE_ONE_SELECTED_PAPER_ID)) return STAGE_ONE_SELECTED_PAPER_ID
  if (candidatePaperIds.includes(STAGE_TWO_SELECTED_PAPER_ID)) return STAGE_TWO_SELECTED_PAPER_ID
  if (candidatePaperIds.includes(STAGE_ONE_DEFERRED_PAPER_ID)) return STAGE_ONE_DEFERRED_PAPER_ID
  return candidatePaperIds[0] ?? null
}

function buildTrackerDiscoveryContent(userText: string) {
  const context = parsePromptContext<{
    anchorPaper?: { paperId?: string }
    targetStageIndex?: number
  }>(userText)
  const anchorPaperId = context.anchorPaper?.paperId ?? ORIGIN_PAPER_ID
  const stageIndex = typeof context.targetStageIndex === 'number' ? context.targetStageIndex : 1

  return JSON.stringify({
    summary: `已围绕锚点论文 ${anchorPaperId} 生成第 ${stageIndex} 阶段的外部搜索查询包。`,
    queries: [
      {
        query: 'language agent reflection tool use',
        rationale: '围绕当前分支继续发现能推进推理、工具调用和反馈闭环的论文。',
        targetProblemIds: ['agent:origin-problem'],
        focus: 'problem',
      },
      {
        query: 'multi-agent collaboration framework',
        rationale: '检查是否已经出现新的协作式分支。',
        targetProblemIds: ['agent:origin-problem'],
        focus: 'method',
      },
      {
        query: 'agent citation trajectory',
        rationale: '补召回引用传递与研究脉络。',
        targetProblemIds: ['agent:origin-problem'],
        focus: 'citation',
      },
      {
        query: 'agent merge workflow',
        rationale: '检查是否存在潜在合流节点。',
        targetProblemIds: ['agent:origin-problem'],
        focus: 'merge',
      },
    ],
  })
}

function buildTrackerAdmissionContent(userText: string) {
  const context = parsePromptContext<{
    candidateShortlist?: Array<{ paperId?: string }>
  }>(userText)
  const shortlist = Array.isArray(context.candidateShortlist) ? context.candidateShortlist : []

  return JSON.stringify({
    candidates: shortlist.map((candidate) => {
      const paperId = String(candidate.paperId ?? '')
      const confidence =
        paperId === STAGE_TWO_SELECTED_PAPER_ID
          ? 0.91
          : paperId === STAGE_ONE_SELECTED_PAPER_ID
            ? 0.88
            : paperId === STAGE_ONE_DEFERRED_PAPER_ID
              ? 0.74
              : 0.61

      return {
        paperId,
        admitted: true,
        candidateType: paperId === STAGE_ONE_DEFERRED_PAPER_ID ? 'branch' : 'direct',
        citeIntent: paperId === STAGE_ONE_DEFERRED_PAPER_ID ? 'background' : 'supporting',
        branchAction: paperId === STAGE_ONE_DEFERRED_PAPER_ID ? 'watch' : 'stay',
        confidence,
        why:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '这篇论文把多智能体协作真正包装成可复用的工作流层，适合作为下一阶段节点。'
            : paperId === STAGE_ONE_SELECTED_PAPER_ID
              ? '这篇论文把反思记忆正式接到 Agent 主线里，是当前起源论文后的自然下一跳。'
              : '这篇论文值得保留为并行分支观察，但当前更适合作为次选。',
        supportedProblemIds: ['agent:origin-problem'],
        supportedCapabilityIds:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? ['multi-agent-coordination', 'tool-use-learning']
            : ['reflective-memory', 'tool-use-learning'],
        mergeTargetBranchIds: [],
        problemImpact:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '把单体 agent 的循环进一步扩展到可编排的多智能体协作。'
            : '把 agent 的错误反馈显式写回后续决策循环。',
        methodInheritance:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '继承了 ReAct 的行动闭环，同时把会话编排做成框架层。'
            : '继承了 ReAct 的行动闭环，并补上可复用的反思记忆。',
        mergeLikelihood: '当前无需触发合流。',
        rejectWhy: '',
        memorySignal:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '历史上这类工作更容易稳定进入编排层主线。'
            : '历史上这类工作通常是 ReAct 之后最自然的补强方向。',
      }
    }),
  })
}

function buildTrackerFinalDecisionContent(userText: string) {
  const context = parsePromptContext<{
    stageWindow?: { selectedWindowMonths?: number }
    candidateShortlist?: Array<{ paperId?: string }>
  }>(userText)
  const shortlist = Array.isArray(context.candidateShortlist) ? context.candidateShortlist : []
  const candidatePaperIds = shortlist
    .map((candidate) => String(candidate.paperId ?? ''))
    .filter(Boolean)
  const selectedPaperId = pickPreferredPaperId(candidatePaperIds)
  const deferredPaperIds = candidatePaperIds.filter((paperId) => paperId !== selectedPaperId)

  return JSON.stringify({
    selectedPaperId,
    selectedWindowMonths:
      typeof context.stageWindow?.selectedWindowMonths === 'number'
        ? context.stageWindow.selectedWindowMonths
        : 5,
    branchAction: selectedPaperId ? 'stay' : 'no-candidate',
    decisionSummary: selectedPaperId
      ? `本轮选择 ${selectedPaperId} 作为当前分支的下一阶段论文，因为它能独立解释这条线的新增推进。`
      : '当前没有形成可提交的下一阶段。',
    branchDecisionRationale: selectedPaperId
      ? `${selectedPaperId} 既延续了当前分支的问题线，又能单独说明它为什么是下一跳。`
      : '当前窗口内没有足够稳定的候选。',
    deferredPaperIds,
    mergeTargetBranchIds: [],
    resolvedProblemIds: ['agent:origin-problem'],
    nextProblem: selectedPaperId
      ? {
          label:
            selectedPaperId === STAGE_TWO_SELECTED_PAPER_ID ? '多智能体工作流编排' : '反思记忆如何进入主线',
          question:
            selectedPaperId === STAGE_TWO_SELECTED_PAPER_ID
              ? '如何把单体 agent 的推理闭环扩展成可复用的多智能体协作工作流？'
              : '如何把错误反馈、复盘和经验写回 agent 的下一轮决策？',
          tags:
            selectedPaperId === STAGE_TWO_SELECTED_PAPER_ID
              ? ['多智能体协作', '工作流编排']
              : ['反思记忆', '自我校准'],
          priorityScore: selectedPaperId === STAGE_TWO_SELECTED_PAPER_ID ? 0.78 : 0.84,
        }
      : undefined,
    methodSignal: selectedPaperId
      ? {
          label:
            selectedPaperId === STAGE_TWO_SELECTED_PAPER_ID ? '会话编排框架化' : '反思式反馈回写',
          summary:
            selectedPaperId === STAGE_TWO_SELECTED_PAPER_ID
              ? '把多智能体协作包装成可编排的应用框架。'
              : '把复盘结果显式写回后续决策循环。',
        }
      : undefined,
    qualitySignal: selectedPaperId
      ? {
          label: '阶段推进质量确认',
          assessment:
            selectedPaperId === STAGE_TWO_SELECTED_PAPER_ID
              ? '这篇论文能清楚解释单体 agent 如何扩展到多智能体编排。'
              : '这篇论文能清楚解释 ReAct 之后为什么需要反思记忆。',
          score: 0.86,
        }
      : undefined,
    splitBranchLabel: '',
  })
}

function extractPaperIdFromPrompt(userText: string) {
  const match = userText.match(/\b\d{4}\.\d{5}\b/)
  return match?.[0] ?? STAGE_ONE_SELECTED_PAPER_ID
}

function buildEditorialPayload(paperId: string) {
  const paper = MOCK_PAPERS[paperId] ?? MOCK_PAPERS[STAGE_ONE_SELECTED_PAPER_ID]
  const branchTheme =
    paperId === STAGE_TWO_SELECTED_PAPER_ID
      ? '多智能体编排如何成为 agent 主线的下一阶段'
      : '反思记忆如何进入 agent 主线'

  return {
    titleZh: `${paper.title.split(':')[0]}：${branchTheme}`,
    highlight: `${paper.title.split(':')[0]} 真正重要的地方，不是再做一个能力演示，而是把当前分支往前推进了一整步。`,
    cardDigest: `${paper.title.split(':')[0]} 把当前主题里最关键的问题继续往前推了，并且留下了清晰的后续追踪入口。`,
    timelineDigest: `${paper.title.split(':')[0]} 让这条研究线从起源论文进入了新的阶段。`,
    openingStandfirst:
      paperId === STAGE_TWO_SELECTED_PAPER_ID
        ? '在这一阶段之前，研究重点还是单体 agent 如何更稳地推理和行动；到了这篇论文，重点开始转向多智能体如何被真正组织起来。'
        : '在这一阶段之前，研究重点仍然停留在 agent 如何边想边做；到了这篇论文，重点开始转向失败经验如何被系统地写回下一轮决策。',
    coverCaption: `本轮内容围绕《${paper.title}》展开，重点解释它为什么会成为当前分支的下一阶段节点。`,
    sections: [
      {
        id: 'context',
        sourceSectionTitle: '1. Context',
        editorialTitle: '它为什么会在这个时间点出现',
        paragraphs: [
          `${paper.title.split(':')[0]} 出现时，前一阶段已经把语言模型从“只会回答”推进到了“能够行动”。接下来真正的问题，是如何把这些行动经验变成下一轮判断的输入。`,
          '所以这篇论文的重要性，不在于多做了几个实验，而在于它给当前分支补上了一个此前缺失的结构环节。',
        ],
      },
      {
        id: 'method',
        sourceSectionTitle: '2. Method',
        editorialTitle: '它到底补上了哪块结构',
        paragraphs: [
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '这篇工作把多智能体协作从概念层落到了工作流层，让“谁来做、何时接力、结果怎么回流”第一次有了更稳定的组织方式。'
            : '这篇工作把失败后的复盘和文字化经验真正纳入 agent 回路，让错误不再只是一次性的损耗，而是下一轮决策的输入。',
          '换句话说，它推进的不是局部技巧，而是整条分支接下来还能否继续演化的骨架问题。',
        ],
      },
      {
        id: 'stage',
        sourceSectionTitle: '3. Stage Impact',
        editorialTitle: '它为什么能算作下一阶段',
        paragraphs: [
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '因为它已经不再只是优化单个 agent，而是开始回答多个 agent 如何稳定协作，这和上一阶段相比是一个明确的结构跃迁。'
            : '因为它已经不再只是延长推理轨迹，而是开始回答经验如何回写，这和起源论文相比是一个明确的新问题。',
          '这也是它能够被判定为当前分支自然下一跳的根本原因。',
        ],
      },
      {
        id: 'outlook',
        sourceSectionTitle: '4. Outlook',
        editorialTitle: '它把后续追踪带向哪里',
        paragraphs: [
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '接下来更值得继续追踪的，不是有没有更多 agent，而是这些 agent 的协作边界、工具调用权限和记忆共享如何进一步制度化。'
            : '接下来更值得继续追踪的，不是如何写更长的反思文本，而是这些反思如何与工具调用、规划和协作进一步耦合。',
          '因此，这篇论文不是终点，而是下一段时间线真正开始展开的入口。',
        ],
      },
    ],
    closingHandoff: [
      paperId === STAGE_TWO_SELECTED_PAPER_ID
        ? '下一篇论文需要继续回答：多智能体工作流如何进一步产品化和工程化。'
        : '下一篇论文需要继续回答：反思记忆如何与更复杂的协作结构连接起来。',
      '后续追踪应继续围绕“它推进了哪条问题线、解决了哪个结构缺口”来判断，而不是只看热度。',
    ],
    problemsOut: [
      {
        id: `${paper.paperId}-followup-1`,
        question:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? '多智能体协作里的记忆、权限与工具调用边界该如何统一？'
            : '反思记忆如何从补丁式机制升级为可泛化的核心能力？',
        whyItMatters: '这决定了当前分支接下来是继续主线推进，还是开始出现新的分叉。',
        tags:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? ['多智能体协作', '工作流']
            : ['反思记忆', '自我校准'],
        problemConstraints: ['不能只停留在自然语言描述层', '必须能重新进入下一轮决策'],
        requiredCapabilities:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? ['multi-agent-coordination']
            : ['reflective-memory'],
        potentialTransferDirections:
          paperId === STAGE_TWO_SELECTED_PAPER_ID
            ? ['开发者工具', '自动化编排']
            : ['工具调用学习', '长期记忆'],
      },
    ],
  }
}

function createResearchBackendMockFetch() {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = extractRequestUrl(input)

    if (url.includes('export.arxiv.org/api/query')) {
      return buildXmlResponse(
        buildArxivFeed([
          STAGE_ONE_SELECTED_PAPER_ID,
          STAGE_ONE_DEFERRED_PAPER_ID,
          STAGE_TWO_SELECTED_PAPER_ID,
        ]),
      )
    }

    if (url.includes('api.openalex.org/works?search=')) {
      const parsedUrl = new URL(url)
      return buildJsonResponse({
        results: buildSearchResults(parsedUrl.searchParams.get('search')),
      })
    }

    if (url.includes('api.openalex.org/works?filter=cites:')) {
      const parsedUrl = new URL(url)
      const filterValue = parsedUrl.searchParams.get('filter') ?? ''
      const citedWorkId = filterValue.split(':').pop() ?? ''
      return buildJsonResponse({
        results: buildCitedByResults(citedWorkId),
      })
    }

    if (url.includes('api.openalex.org/works/')) {
      const decodedId = decodeURIComponent(url.split('/works/')[1]?.split('?')[0] ?? '')
      const workId = decodedId.split('/').pop() ?? decodedId
      const paper = MOCK_PAPERS_BY_WORK_ID.get(workId)
      assert.ok(paper, `expected mock OpenAlex work for ${workId}`)
      return buildJsonResponse(buildOpenAlexWork(paper))
    }

    const { payload, userText } = extractOpenAIUserText(init)
    assert.ok(
      Array.isArray(payload.messages) && payload.messages.length >= 2,
      'direct LLM execution should send at least system and user messages',
    )

    if (userText.includes('paper-tracker')) {
      if (userText.includes('candidateShortlist') && userText.includes('selectedPaperId')) {
        return buildOpenAIChatResponse(buildTrackerFinalDecisionContent(userText))
      }
      if (userText.includes('candidateShortlist')) {
        return buildOpenAIChatResponse(buildTrackerAdmissionContent(userText))
      }
      return buildOpenAIChatResponse(buildTrackerDiscoveryContent(userText))
    }

    return buildOpenAIChatResponse(JSON.stringify(buildEditorialPayload(extractPaperIdFromPrompt(userText))))
  }) as typeof fetch
}

async function withMockedDirectProvider<T>(task: () => Promise<T>) {
  const previousFetch = globalThis.fetch
  const previousOpenAIKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-openai-key'
  globalThis.fetch = createResearchBackendMockFetch()

  try {
    return await task()
  } finally {
    globalThis.fetch = previousFetch
    if (previousOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = previousOpenAIKey
    }
  }
}

async function main() {
  const workflowRoot = path.join(process.cwd(), 'generated-data', 'app-data', 'workflow')
  const trackerContentRoot = path.join(process.cwd(), 'generated-data', 'app-data', 'tracker-content')
  const decisionMemoryFile = path.join(workflowRoot, 'decision-memory.json')
  const executionMemoryFile = path.join(workflowRoot, 'execution-memory.json')

  try {
    const compiled = writeCompiledTopics()
    assert.equal(compiled.topicCatalog.topics.length, 5, 'topic compile should keep only five topics')
    assert.equal(Object.keys(compiled.paperCatalog).length, 5, 'topic compile should keep only five origin papers')
    assert.deepEqual(compiled.paperEditorial, {}, 'topic compile should clear prior paper editorials')
    assert.deepEqual(compiled.topicEditorial, [], 'topic compile should clear prior topic editorials')
    assert.ok(Array.isArray(compiled.topicDisplay.topics), 'topic compile should produce the topic display projection')
    assert.ok(compiled.capabilityLibrary.length > 0, 'topic compile should produce the capability library')
    assert.deepEqual(
      fs
        .readdirSync(trackerContentRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(),
      ['paper-editorial.json', 'topic-editorial.json'],
      'topic compile should keep tracker-content canonical-only',
    )

    const compiledAgentMemory = compiled.topicMemory.agent as Record<string, unknown>
    assert.ok(compiledAgentMemory.timelineContext, 'topic compile should initialize timelineContext')
    assert.deepEqual(compiledAgentMemory.stageLedger, [], 'topic compile should reset stageLedger')
    assert.deepEqual(compiledAgentMemory.candidatePaperIds, [], 'topic compile should not preload candidates')
    assert.deepEqual(
      compiledAgentMemory.publishedMainlinePaperIds,
      [ORIGIN_PAPER_ID],
      'topic compile should keep only the origin paper on the mainline',
    )
    assert.ok(Array.isArray(compiledAgentMemory.branchRegistry), 'topic compile should create branchRegistry skeletons')
    assert.ok(Array.isArray(compiledAgentMemory.paperRelations), 'topic compile should create paperRelations skeletons')
    assert.equal(
      (compiledAgentMemory.paperRelations as Array<Record<string, unknown>>)[0]?.primaryBranchId,
      'branch:agent:origin',
      'origin-only compile should align paper relations with the canonical origin branch id',
    )

    const compiledAgentDisplay = compiled.topicDisplay.topics.find(
      (topic) => topic.topicId === 'agent',
    ) as Record<string, unknown> | undefined
    assert.ok(compiledAgentDisplay, 'topic compile should create an agent topic display entry')
    assert.match(
      String(((compiledAgentDisplay.hero as Record<string, unknown>)?.subtitle ?? '')),
      /[\u4e00-\u9fff]/,
      'topic display hero subtitle should be Chinese-first',
    )
    assert.ok(
      Array.isArray((compiledAgentDisplay.stageColumns as unknown[]) ?? []),
      'topic display should expose stageColumns even in origin-only mode',
    )

    await assert.rejects(
      () =>
        runSkillDefinition(paperTrackerSkill, {
          skillId: 'paper-tracker',
          input: {},
          storageMode: 'dry-run',
        }),
      /Invalid input/,
      'paper-tracker should reject missing topicId',
    )

    await assert.rejects(
      () =>
        runSkillDefinition(paperTrackerSkill, {
          skillId: 'paper-tracker',
          input: {
            topicId: 'agent',
            providerId: 'agent-skill' as unknown as 'openai-compatible',
          },
          storageMode: 'dry-run',
        }),
      /agent-skill/,
      'paper-tracker should reject agent-skill for direct research decisions',
    )

    await assert.rejects(
      () =>
        runSkillDefinition(paperTrackerSkill, {
          skillId: 'paper-tracker',
          input: {
            topicId: 'agent',
            providerId: 'openai-compatible',
            stageMode: 'rebuild' as unknown as 'next-stage',
          },
          storageMode: 'dry-run',
        }),
      /stageMode=next-stage/,
      'paper-tracker should reject unsupported stage modes',
    )

    await assert.rejects(
      () =>
        runSkillDefinition(paperTrackerSkill, {
          skillId: 'paper-tracker',
          input: {
            topicId: 'agent',
            providerId: 'openai-compatible',
            discoverySource: 'local-cache' as unknown as 'external-only',
          },
          storageMode: 'dry-run',
        }),
      /external-only/,
      'paper-tracker should reject non-external discovery sources',
    )

    const { trackerRunA, trackerRunB, trackerPersisted } = await withMockedDirectProvider(async () => {
      const trackerRunA = await runSkillDefinition(paperTrackerSkill, {
        skillId: 'paper-tracker',
        input: {
          topicId: 'agent',
          providerId: 'openai-compatible',
        },
        storageMode: 'dry-run',
      })

      const trackerRunB = await runSkillDefinition(paperTrackerSkill, {
        skillId: 'paper-tracker',
        input: {
          topicId: 'agent',
          providerId: 'openai-compatible',
        },
        storageMode: 'dry-run',
      })

      const trackerPersisted = await runSkillDefinition(paperTrackerSkill, {
        skillId: 'paper-tracker',
        input: {
          topicId: 'agent',
          providerId: 'openai-compatible',
        },
        storageMode: 'canonical-only',
      })

      return {
        trackerRunA,
        trackerRunB,
        trackerPersisted,
      }
    })

    const trackerCandidatesA = (trackerRunA.output.candidates as Array<{ paperId: string }>).map(
      (item) => item.paperId,
    )
    const trackerCandidatesB = (trackerRunB.output.candidates as Array<{ paperId: string }>).map(
      (item) => item.paperId,
    )
    assert.deepEqual(trackerCandidatesA, trackerCandidatesB, 'paper-tracker dry-run should be idempotent')
    assert.equal(trackerRunA.persistedArtifacts.length, 0, 'paper-tracker dry-run should not persist canonical artifacts')
    assert.deepEqual(
      trackerCandidatesA,
      [STAGE_ONE_SELECTED_PAPER_ID, STAGE_ONE_DEFERRED_PAPER_ID],
      'paper-tracker should scope the first stage to externally discovered candidates only',
    )

    const selectedCandidateA = trackerRunA.output.selectedCandidate as { paperId?: string } | null
    assert.equal(
      selectedCandidateA?.paperId,
      STAGE_ONE_SELECTED_PAPER_ID,
      'paper-tracker should let the LLM select the stage-1 paper from the admitted shortlist',
    )
    assert.equal(
      (trackerRunA.output.discoverySummary as { source?: string }).source,
      'external-only',
      'paper-tracker should report external-only discovery',
    )
    assert.equal(
      (trackerRunA.output.stageWindowDecision as { finalWindowMonths?: number }).finalWindowMonths,
      6,
      'paper-tracker should choose the bounded 6-month window for the first stage',
    )
    assert.ok(
      ((trackerRunA.output.timelineContextPatch as Record<string, unknown>)?.problemSpace as Record<string, unknown>) ??
        ((trackerRunA.output.timelineContextPatch as Record<string, unknown>)?.branchSpace as Record<string, unknown>),
      'paper-tracker should emit a timelineContext patch',
    )

    assert.ok(
      trackerPersisted.persistedArtifacts.includes('workflow/topic-memory.json'),
      'paper-tracker canonical run should update topic-memory',
    )
    assert.ok(
      trackerPersisted.persistedArtifacts.includes('paper-catalog.json'),
      'paper-tracker canonical run should persist the retained candidate papers',
    )

    const selectedBranch = trackerPersisted.output.selectedBranch as { branchId: string; stageIndex: number }
    assert.equal(selectedBranch.branchId, 'branch:agent:origin', 'paper-tracker should advance the canonical origin branch first')

    await assert.rejects(
      () =>
        runSkillDefinition(contentGenesisSkill, {
          skillId: 'content-genesis-v2',
          input: {
            topicId: 'agent',
            paperId: STAGE_ONE_SELECTED_PAPER_ID,
            branchId: selectedBranch.branchId,
            stageIndex: selectedBranch.stageIndex,
          },
          storageMode: 'dry-run',
        }),
      /OPENAI_API_KEY|ANTHROPIC_API_KEY|LLM/,
      'content-genesis should require a direct LLM provider instead of silently falling back',
    )

    const contentRun = await withMockedDirectProvider(async () =>
      runSkillDefinition(contentGenesisSkill, {
        skillId: 'content-genesis-v2',
        input: {
          topicId: 'agent',
          paperId: STAGE_ONE_SELECTED_PAPER_ID,
          branchId: selectedBranch.branchId,
          stageIndex: selectedBranch.stageIndex,
          providerId: 'openai-compatible',
        },
        storageMode: 'dry-run',
      }),
    )

    const coverageReport = contentRun.output.coverageReport as {
      coveredAssets: string[]
      uncoveredAssets: string[]
      coverageScore: number
    }
    assert.ok(Array.isArray(coverageReport.coveredAssets), 'content-genesis should return coveredAssets')
    assert.ok(Array.isArray(coverageReport.uncoveredAssets), 'content-genesis should return uncoveredAssets')
    assert.ok(
      typeof coverageReport.coverageScore === 'number' && coverageReport.coverageScore > 0,
      'content-genesis should return a numeric coverage score',
    )

    const paperEditorial = contentRun.output.paperEditorial as {
      closingHandoff: string[]
      highlight: string
      cardDigest: string
      openingStandfirst: string
      sections: Array<{ sourceSectionTitle: string; editorialTitle: string; paragraphs: string[] }>
    }
    assert.match(paperEditorial.highlight, /[\u4e00-\u9fff]/, 'content-genesis highlight should be Chinese-first')
    assert.match(paperEditorial.cardDigest, /[\u4e00-\u9fff]/, 'content-genesis cardDigest should be Chinese-first')
    assert.match(
      paperEditorial.openingStandfirst,
      /[\u4e00-\u9fff]/,
      'content-genesis openingStandfirst should be Chinese-first',
    )
    assert.ok(
      paperEditorial.closingHandoff.some((line) => /[\u4e00-\u9fff]/.test(line)),
      'content-genesis should preserve Chinese follow-up handoff lines',
    )
    assert.ok(
      paperEditorial.sections.every(
        (section) =>
          typeof section.sourceSectionTitle === 'string' &&
          section.sourceSectionTitle.length > 0 &&
          /[\u4e00-\u9fff]/.test(section.editorialTitle) &&
          section.paragraphs.some((paragraph) => /[\u4e00-\u9fff]/.test(paragraph)),
      ),
      'content-genesis sections should stay structured and Chinese-first',
    )

    const contextUpdateProposal = contentRun.output.contextUpdateProposal as {
      problemSpace?: { nodes?: unknown[] }
      branchSpace?: { branches?: unknown[] }
      qualitySpace?: { signals?: unknown[] }
    }
    assert.ok(
      Array.isArray(contextUpdateProposal.problemSpace?.nodes),
      'content-genesis should emit structured problem-space updates',
    )
    assert.ok(
      Array.isArray(contextUpdateProposal.branchSpace?.branches),
      'content-genesis should emit structured branch-space updates',
    )
    assert.ok(
      Array.isArray(contextUpdateProposal.qualitySpace?.signals),
      'content-genesis should emit structured quality-space updates',
    )

    const visualizerRun = await runSkillDefinition(topicVisualizerSkill, {
      skillId: 'topic-visualizer',
      input: {
        topicId: 'agent',
      },
      storageMode: 'dry-run',
    })
    const visualizerOutput = visualizerRun.output as {
      mergeEvents: unknown[]
      activeBranches: unknown[]
      stageWindows: unknown[]
      topicDisplayPatch: {
        stageColumns: Array<{ branchCards: unknown[] }>
        branchPalette: unknown[]
      }
    }
    assert.ok(Array.isArray(visualizerOutput.mergeEvents), 'topic-visualizer should expose merge events')
    assert.ok(Array.isArray(visualizerOutput.activeBranches), 'topic-visualizer should expose active branches')
    assert.ok(Array.isArray(visualizerOutput.stageWindows), 'topic-visualizer should expose stage windows')
    assert.equal(
      visualizerOutput.topicDisplayPatch.stageColumns.length,
      1,
      'topic-visualizer should project the first discovered stage into one stage column',
    )
    assert.ok(
      visualizerOutput.topicDisplayPatch.stageColumns[0]?.branchCards.length > 0,
      'topic-visualizer should project branch cards for the active stage',
    )
    assert.ok(
      Array.isArray(visualizerOutput.topicDisplayPatch.branchPalette),
      'topic-visualizer should project a stable branch palette for the frontend',
    )

    const runtime = new ModelRuntimeClient()
    const agentEnvelope = await runtime.runSkill({
      skillId: 'orchestrator',
      input: {
        topicId: 'agent',
        workflowMode: 'full-cycle',
      },
      providerId: 'agent-skill',
      agentTarget: 'codex',
      storageMode: 'dry-run',
    })

    assert.equal(agentEnvelope.providerId, 'agent-skill', 'runtime should build an agent skill envelope')
    assert.equal(agentEnvelope.connectorId, 'codex', 'runtime should preserve the codex agent adapter target')
    assert.equal(
      agentEnvelope.packet.skillManifest.id,
      'orchestrator',
      'agent packet should expose the orchestrator manifest',
    )
    assert.ok(agentEnvelope.packet.allowedArtifacts.length > 0, 'agent packet should list allowed artifacts')

    const debugPersisted = persistArtifactChanges({
      runId: `test-${Date.now()}`,
      storageMode: 'debug',
      artifactChanges: [
        {
          relativePath: 'debug-snapshot',
          kind: 'json',
          retention: 'ephemeral',
          description: 'temporary debug artifact from test',
          nextValue: {
            ok: true,
          },
        },
      ],
    })

    assert.equal(debugPersisted.length, 1, 'debug storage should persist ephemeral artifacts')
    assert.ok(debugPersisted[0].includes('tmp'), 'debug storage should write under tmp/skill-runs')

    const normalizedDecisionMemory = normalizeDecisionMemoryFile({
      schemaVersion: 99,
      entries: [
        {
          id: 'dup-entry',
          topicId: 'agent',
          skillId: 'paper-tracker',
          timestamp: '2026-01-01T00:00:00.000Z',
          summary: 'first version',
        },
        {
          id: 'dup-entry',
          topicId: 'agent',
          skillId: 'paper-tracker',
          timestamp: '2026-01-02T00:00:00.000Z',
          summary: 'second version',
          affectedPaperIds: [STAGE_TWO_SELECTED_PAPER_ID, STAGE_TWO_SELECTED_PAPER_ID],
        },
        'invalid-entry',
      ],
    })
    assert.equal(normalizedDecisionMemory.entries.length, 1, 'decision memory normalization should dedupe entries by id')
    assert.deepEqual(
      normalizedDecisionMemory.entries[0].affectedPaperIds,
      [STAGE_TWO_SELECTED_PAPER_ID],
      'decision memory normalization should dedupe affected paper ids',
    )

    const normalizedExecutionMemory = normalizeExecutionMemoryFile({
      schemaVersion: 3,
      skills: {
        'content-genesis-v2': {
          runs: 3,
          lastRunAt: 'bad-date',
          profiles: {
            'direct:editorial:text-only': {
              runs: 2,
              lastRunAt: '2026-03-01T00:00:00.000Z',
              lastCoverageScore: 1.3,
            },
          },
        },
      },
    })
    assert.equal(
      (normalizedExecutionMemory.skills['content-genesis-v2'] as Record<string, unknown>).runs,
      3,
      'execution memory normalization should preserve run counts',
    )
    assert.equal(
      ((normalizedExecutionMemory.skills['content-genesis-v2'] as Record<string, unknown>).profiles as Record<string, Record<string, unknown>>)['direct:editorial:text-only'].lastCoverageScore,
      1,
      'execution memory normalization should clamp coverage score into [0, 1]',
    )

    const normalizedBranchRegistry = normalizeBranchRegistry([
      {
        branchId: 'branch:agent:test',
        rootProblemNodeId: 'agent-problem-1',
        anchorPaperId: STAGE_ONE_SELECTED_PAPER_ID,
        anchorPaperPublishedAt: '2023-03-21T00:00:00.000Z',
        lastTrackedPaperId: STAGE_ONE_SELECTED_PAPER_ID,
        lastTrackedPublishedAt: '2023-03-21T00:00:00.000Z',
        stageIndex: 1,
        activeWindowMonths: 5,
        status: 'active',
        priorityScore: 0.5,
        linkedProblemNodeIds: ['agent-problem-1'],
      },
      {
        branchId: 'branch:agent:test',
        rootProblemNodeId: 'agent-problem-1',
        anchorPaperId: STAGE_ONE_SELECTED_PAPER_ID,
        anchorPaperPublishedAt: '2023-03-21T00:00:00.000Z',
        lastTrackedPaperId: STAGE_TWO_SELECTED_PAPER_ID,
        lastTrackedPublishedAt: '2023-08-16T00:00:00.000Z',
        stageIndex: 2,
        activeWindowMonths: 6,
        status: 'active',
        priorityScore: 0.7,
        linkedProblemNodeIds: ['agent-problem-1', 'agent-problem-2'],
      },
    ])
    assert.equal(normalizedBranchRegistry.length, 1, 'branch registry normalization should collapse duplicate branch ids')
    assert.deepEqual(
      normalizedBranchRegistry[0].linkedProblemNodeIds,
      ['agent-problem-1', 'agent-problem-2'],
      'branch registry normalization should merge linked problem ids',
    )

    const normalizedStageLedger = normalizeStageLedger([
      {
        branchId: 'branch:agent:test',
        stageIndex: 2,
        windowStart: '2023-03-21T00:00:00.000Z',
        windowEnd: '2023-08-21T00:00:00.000Z',
        windowMonths: 5,
        anchorPaperId: STAGE_ONE_SELECTED_PAPER_ID,
        candidatePaperIds: [STAGE_TWO_SELECTED_PAPER_ID],
        selectedPaperId: STAGE_TWO_SELECTED_PAPER_ID,
        status: 'completed',
        decisionSummary: 'selected one',
        mergeEvents: [],
        builtAt: '2026-03-01T00:00:00.000Z',
      },
      {
        branchId: 'branch:agent:test',
        stageIndex: 2,
        windowStart: '2023-03-21T00:00:00.000Z',
        windowEnd: '2023-08-21T00:00:00.000Z',
        windowMonths: 5,
        anchorPaperId: STAGE_ONE_SELECTED_PAPER_ID,
        candidatePaperIds: [STAGE_ONE_DEFERRED_PAPER_ID],
        status: 'planned',
        decisionSummary: 'planned earlier',
        mergeEvents: [
          {
            paperId: STAGE_TWO_SELECTED_PAPER_ID,
            mergedBranchIds: ['branch:agent:parallel'],
          },
        ],
        builtAt: '2026-02-01T00:00:00.000Z',
      },
    ])
    assert.equal(normalizedStageLedger.length, 1, 'stage ledger normalization should collapse duplicate stage keys')
    assert.deepEqual(
      normalizedStageLedger[0].candidatePaperIds,
      [STAGE_TWO_SELECTED_PAPER_ID, STAGE_ONE_DEFERRED_PAPER_ID],
      'stage ledger normalization should preserve unique candidates across duplicates',
    )

    const normalizedPaperRelations = normalizePaperRelations([
      {
        paperId: STAGE_TWO_SELECTED_PAPER_ID,
        problemNodeIds: ['p1'],
        branchIds: ['branch:a'],
        primaryBranchId: 'branch:a',
        isMergePaper: false,
        mergedBranchIds: [],
        resolvedProblemIds: ['p1'],
      },
      {
        paperId: STAGE_TWO_SELECTED_PAPER_ID,
        problemNodeIds: ['p2'],
        branchIds: ['branch:b'],
        primaryBranchId: 'branch:b',
        isMergePaper: true,
        mergedBranchIds: ['branch:a'],
        resolvedProblemIds: ['p2'],
      },
    ])
    assert.equal(normalizedPaperRelations.length, 1, 'paper relation normalization should collapse duplicate paper ids')
    assert.equal(normalizedPaperRelations[0].isMergePaper, true, 'paper relation normalization should preserve merge status')
    assert.deepEqual(
      normalizedPaperRelations[0].branchIds,
      ['branch:a', 'branch:b'],
      'paper relation normalization should merge branch ids',
    )

    fs.writeFileSync(decisionMemoryFile, '{bad json', 'utf8')
    fs.writeFileSync(executionMemoryFile, '{bad json', 'utf8')
    const recoveredCompile = writeCompiledTopics()
    assert.ok(
      Array.isArray(recoveredCompile.decisionMemory.entries),
      'topic compile should recover from malformed decision-memory.json',
    )
    assert.ok(
      recoveredCompile.executionMemory.skills && typeof recoveredCompile.executionMemory.skills === 'object',
      'topic compile should recover from malformed execution-memory.json',
    )

    await withMockedDirectProvider(async () =>
      runSkillDefinition(paperTrackerSkill, {
        skillId: 'paper-tracker',
        input: {
          topicId: 'agent',
          providerId: 'openai-compatible',
        },
        storageMode: 'canonical-only',
      }),
    )

    const orchestratorRun = await withMockedDirectProvider(async () =>
      runSkillDefinition(orchestratorSkill, {
        skillId: 'orchestrator',
        input: {
          topicId: 'agent',
          workflowMode: 'full-cycle',
          maxIterations: 1,
          providerId: 'openai-compatible',
        },
        storageMode: 'canonical-only',
      }),
    )

    const orchestratorOutput = orchestratorRun.output as {
      steps: Array<{ status: string }>
      failures: unknown[]
      selectedPaper: { branchId?: string | null; paperId?: string | null } | null
    }
    assert.equal(orchestratorOutput.steps.length, 4, 'orchestrator full-cycle run should execute four steps')
    assert.equal(orchestratorOutput.failures.length, 0, 'orchestrator full-cycle run should complete without failures')
    assert.equal(
      orchestratorOutput.selectedPaper?.paperId,
      STAGE_TWO_SELECTED_PAPER_ID,
      'orchestrator should advance the next branch-aware stage after the persisted first stage',
    )

    const generatedTopicMemoryPath = path.join(
      process.cwd(),
      'generated-data',
      'app-data',
      'workflow',
      'topic-memory.json',
    )
    assert.ok(fs.existsSync(generatedTopicMemoryPath), 'topic compile should materialize canonical workflow data')

    console.log(
      JSON.stringify(
        {
          ok: true,
          compiledTopicCount: compiled.topicCatalog.topics.length,
          firstStagePaperId: STAGE_ONE_SELECTED_PAPER_ID,
          secondStagePaperId: STAGE_TWO_SELECTED_PAPER_ID,
          coveredAssets: coverageReport.coveredAssets.length,
          orchestratorSteps: orchestratorOutput.steps.length,
        },
        null,
        2,
      ),
    )
  } finally {
    writeCompiledTopics()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
