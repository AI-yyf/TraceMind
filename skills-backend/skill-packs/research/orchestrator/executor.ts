import { runSkillDefinition } from '../../../engine/runner'
import { contentGenesisSkill } from '../content-genesis-v2/skill'
import { buildDecisionMemoryChange, buildExecutionMemoryChange } from '../shared/memory'
import { paperTrackerSkill } from '../paper-tracker/skill'
import { topicVisualizerSkill } from '../topic-visualizer/skill'
import {
  assessResearchQuality,
  qualityMeetsThreshold,
  getRefinementStrategy,
} from './research-quality'

import {
  asRecord,
  asString,
  asStringArray,
  buildFallbackBranchRegistry,
  buildFallbackPaperRelations,
  normalizeBranchingDefaults,
  resolveMainlineBranchId,
  syncLegacyBranchTree,
  uniqueStrings,
} from '../../../shared/research-graph'

import type { SkillArtifactChange, SkillContextSnapshot, SkillExecutionRequest } from '../../../engine/contracts'
import type { PaperTrackerCandidate } from '../paper-tracker/types'
import type { OrchestratorStepResult, OrchestratorWorkflowMode } from './types'

function resolveWorkflowMode(input: Record<string, unknown>): OrchestratorWorkflowMode {
  const workflowMode = input.workflowMode
  return workflowMode === 'discover-only' ||
    workflowMode === 'content-only' ||
    workflowMode === 'visualize-only' ||
    workflowMode === 'full-cycle' ||
    workflowMode === 'rebuild'
    ? workflowMode
    : 'full-cycle'
}

function appendStep(
  collection: OrchestratorStepResult[],
  step: OrchestratorStepResult,
  artifactsChanged: Set<string>,
) {
  collection.push(step)
  for (const artifact of step.persistedArtifacts) {
    artifactsChanged.add(artifact)
  }
}

function inferSelectedCandidate(output: Record<string, unknown>) {
  const selectedCandidate = asRecord(output.selectedCandidate)
  if (!selectedCandidate || typeof selectedCandidate.paperId !== 'string') {
    return null
  }

  return selectedCandidate as unknown as PaperTrackerCandidate
}

function inferSelectedBranch(output: Record<string, unknown>) {
  const selectedBranch = asRecord(output.selectedBranch)
  if (!selectedBranch || typeof selectedBranch.branchId !== 'string') {
    return null
  }

  return {
    branchId: selectedBranch.branchId,
    stageIndex:
      typeof selectedBranch.stageIndex === 'number' && selectedBranch.stageIndex > 0
        ? selectedBranch.stageIndex
        : 1,
  }
}

function resolvePaperIdFromMemory(topicMemory: Record<string, unknown>): string | null {
  const queue = Array.isArray(topicMemory.recommendationQueue)
    ? (topicMemory.recommendationQueue as Array<Record<string, unknown>>)
    : []
  const selectedEntry = queue.find((entry) => entry.status === 'selected' && typeof entry.paperId === 'string')
  if (selectedEntry && typeof selectedEntry.paperId === 'string') {
    return selectedEntry.paperId
  }
  const queuedEntry = queue.find((entry) => entry.status === 'queued' && typeof entry.paperId === 'string')
  if (queuedEntry && typeof queuedEntry.paperId === 'string') {
    return queuedEntry.paperId
  }
  const anyEntry = queue.find((entry) => typeof entry.paperId === 'string')
  if (anyEntry && typeof anyEntry.paperId === 'string') {
    return anyEntry.paperId
  }
  return null
}

function resolveBranchIdForPaper(topicMemory: Record<string, unknown>, paperId: string): string | null {
  const paperRelations = Array.isArray(topicMemory.paperRelations)
    ? (topicMemory.paperRelations as Array<Record<string, unknown>>)
    : []
  const relation = paperRelations.find((entry) => entry.paperId === paperId)
  if (relation && typeof relation.primaryBranchId === 'string') {
    return relation.primaryBranchId
  }

  const queue = Array.isArray(topicMemory.recommendationQueue)
    ? (topicMemory.recommendationQueue as Array<Record<string, unknown>>)
    : []
  const branchEntry = queue.find((entry) => entry.paperId === paperId && typeof entry.branchId === 'string')
  if (branchEntry && typeof branchEntry.branchId === 'string') {
    return branchEntry.branchId
  }
  return null
}

function buildSyntheticContext(args: {
  base: SkillContextSnapshot
  topicId: string
  nextTopicMemory: Record<string, unknown>
  paperId?: string
}) {
  return {
    ...args.base,
    topicMemory: args.nextTopicMemory,
    paper:
      args.paperId && args.base.paperCatalog && args.base.paperCatalog[args.paperId]
        ? {
            id: args.paperId,
            title: String((args.base.paperCatalog[args.paperId] as Record<string, unknown>).title ?? args.paperId),
            published: String((args.base.paperCatalog[args.paperId] as Record<string, unknown>).published ?? ''),
            authors: Array.isArray((args.base.paperCatalog[args.paperId] as Record<string, unknown>).authors)
              ? ((args.base.paperCatalog[args.paperId] as Record<string, unknown>).authors as unknown[]).map(String)
              : [],
            summary:
              typeof (args.base.paperCatalog[args.paperId] as Record<string, unknown>).summary === 'string'
                ? String((args.base.paperCatalog[args.paperId] as Record<string, unknown>).summary)
                : undefined,
            topicIds: [args.topicId],
          }
        : args.base.paper,
    workflowTopicMemory: {
      ...(args.base.workflowTopicMemory ?? {}),
      [args.topicId]: args.nextTopicMemory,
    },
  } satisfies SkillContextSnapshot
}

function buildPromotionChanges(args: {
  context: SkillContextSnapshot
  topicId: string
  paperId: string
  candidateType: 'direct' | 'branch' | 'transfer'
  branchId: string | null
  mergeTargetBranchIds: string[]
  resolvedProblemIds: string[]
}): SkillArtifactChange[] {
  const topicMemory = asRecord(args.context.workflowTopicMemory?.[args.topicId])
  const topic = args.context.topic
  const paperCatalog = (args.context.paperCatalog ?? {}) as Record<string, Record<string, unknown>>
  if (!topicMemory || !topic) {
    return []
  }

  const defaults = normalizeBranchingDefaults(topic.defaults as Record<string, unknown> | undefined)
  const branchRegistry = buildFallbackBranchRegistry({
    topicId: args.topicId,
    topicOriginPaperId: topic.originPaperId,
    topicDefaults: defaults,
    topicMemory,
    paperCatalog,
  })
  const nextBranchRegistry = branchRegistry.map((branch) => {
    if (branch.branchId === args.branchId) {
      return {
        ...branch,
        status: branch.status === 'merged' ? 'merged' : 'active',
      }
    }

    if (args.mergeTargetBranchIds.includes(branch.branchId)) {
      return {
        ...branch,
        status: 'merged' as const,
        mergedIntoBranchId: args.branchId,
      }
    }

    return branch
  })

  const paperRelations = buildFallbackPaperRelations({
    topicId: args.topicId,
    topicMemory,
    branchRegistry: nextBranchRegistry,
  })
  const mainlineBranchId = resolveMainlineBranchId({
    topicId: args.topicId,
    branchRegistry: nextBranchRegistry,
  })
  const relationMap = new Map(paperRelations.map((entry) => [entry.paperId, { ...entry }]))
  const currentRelation = relationMap.get(args.paperId) ?? {
    paperId: args.paperId,
    nodeId: `node:${args.paperId}`,
    problemNodeIds: [],
    branchIds: [],
    primaryBranchId: args.branchId ?? mainlineBranchId,
    isMergePaper: false,
    mergedBranchIds: [],
    resolvedProblemIds: [],
  }

  relationMap.set(args.paperId, {
    ...currentRelation,
    branchIds: uniqueStrings([
      ...currentRelation.branchIds,
      ...(args.branchId ? [args.branchId] : []),
      ...args.mergeTargetBranchIds,
    ]),
    primaryBranchId: args.branchId ?? currentRelation.primaryBranchId,
    isMergePaper: args.mergeTargetBranchIds.length > 0 || currentRelation.isMergePaper,
    mergedBranchIds: uniqueStrings([
      ...currentRelation.mergedBranchIds,
      ...args.mergeTargetBranchIds,
    ]),
    resolvedProblemIds: uniqueStrings([
      ...currentRelation.resolvedProblemIds,
      ...args.resolvedProblemIds,
    ]),
  })

  const timestamp = new Date().toISOString()
  const decisionEntry = {
    id: `${args.topicId}-orchestrator-promote-${Date.now()}`,
    topicId: args.topicId,
    branchId: args.branchId,
    skillId: 'orchestrator',
    timestamp,
    action: 'promote-paper',
    actionKind: args.mergeTargetBranchIds.length > 0 ? 'merge' : 'promote',
    summary: `已将 ${args.paperId} 提升到${args.candidateType === 'direct' ? '主线' : '分支'}正式论文集合。`,
    affectedProblemIds: args.resolvedProblemIds,
    affectedPaperIds: [args.paperId],
    rationale:
      args.candidateType === 'direct'
        ? '这篇论文是当前主题主线的直接下一跳，现在已经具备写入 canonical 正式集合的条件。'
        : '这篇论文仍然作为分支或迁移推进被保留下来，同时继续与分支化主题输出保持一致。',
  }

  const nextProblemNodes = (
    Array.isArray(topicMemory.problemNodes)
      ? (topicMemory.problemNodes as Array<Record<string, unknown>>)
      : []
  ).map((problemNode) => ({
    ...problemNode,
    directCandidates: (
      Array.isArray(problemNode.directCandidates)
        ? (problemNode.directCandidates as Array<Record<string, unknown>>)
        : []
    ).map((candidate) => ({
      ...candidate,
      status: candidate.paperId === args.paperId ? 'promoted' : candidate.status,
    })),
    transferCandidates: (
      Array.isArray(problemNode.transferCandidates)
        ? (problemNode.transferCandidates as Array<Record<string, unknown>>)
        : []
    ).map((candidate) => ({
      ...candidate,
      status: candidate.paperId === args.paperId ? 'promoted' : candidate.status,
    })),
    resolutionStatus: args.resolvedProblemIds.includes(asString(problemNode.id, ''))
      ? args.mergeTargetBranchIds.length > 0
        ? 'merged'
        : args.candidateType === 'direct'
          ? 'resolved'
          : 'branched'
      : problemNode.resolutionStatus,
  }))

  const nextWorkflowTopicMemory = structuredClone(args.context.workflowTopicMemory ?? {})
  nextWorkflowTopicMemory[args.topicId] = {
    ...topicMemory,
    publishedMainlinePaperIds:
      args.candidateType === 'direct'
        ? Array.from(new Set([...asStringArray(topicMemory.publishedMainlinePaperIds), args.paperId]))
        : asStringArray(topicMemory.publishedMainlinePaperIds),
    publishedBranchPaperIds:
      args.candidateType === 'direct'
        ? asStringArray(topicMemory.publishedBranchPaperIds)
        : Array.from(new Set([...asStringArray(topicMemory.publishedBranchPaperIds), args.paperId])),
    candidatePaperIds: asStringArray(topicMemory.candidatePaperIds).filter((candidatePaperId) => candidatePaperId !== args.paperId),
    seedPaperIds: asStringArray(topicMemory.seedPaperIds).filter((seedPaperId) => seedPaperId !== args.paperId),
    recommendationQueue: (
      Array.isArray(topicMemory.recommendationQueue)
        ? (topicMemory.recommendationQueue as Array<Record<string, unknown>>)
        : []
    ).filter((entry) => entry.paperId !== args.paperId),
    branchRegistry: nextBranchRegistry,
    paperRelations: [...relationMap.values()],
    branchTree: syncLegacyBranchTree({
      topicId: args.topicId,
      topicMemory,
      branchRegistry: nextBranchRegistry,
      paperRelations: [...relationMap.values()],
    }),
    problemNodes: nextProblemNodes,
    decisionLog: [
      ...(Array.isArray(topicMemory.decisionLog) ? topicMemory.decisionLog : []),
      decisionEntry,
    ],
    lastBuiltAt: timestamp,
    lastRewrittenAt: timestamp,
  }

  return [
    {
      relativePath: 'workflow/topic-memory.json',
      kind: 'json',
      retention: 'canonical',
      description: `把 ${args.paperId} 提升到 canonical 主题记忆中。`,
      nextValue: nextWorkflowTopicMemory,
    },
    buildDecisionMemoryChange({
      context: args.context,
      entry: decisionEntry,
    }),
  ]
}

export async function executeOrchestrator(args: {
  request: SkillExecutionRequest
  context: SkillContextSnapshot
}) {
  const topic = args.context.topic
  if (!topic) {
    throw new Error('orchestrator 需要合法的 topicId。')
  }

  const workflowMode = resolveWorkflowMode(args.request.input)
  const envMaxIterations = process.env.ORCHESTRATOR_MAX_ITERATIONS
    ? parseInt(process.env.ORCHESTRATOR_MAX_ITERATIONS, 10)
    : 30  // Raised from 20 to 30 for deeper multi-round research
  const maxIterations =
    typeof args.request.input.maxIterations === 'number' && args.request.input.maxIterations > 0
      ? Math.min(args.request.input.maxIterations, envMaxIterations)
      : 15  // Default iterations raised to 15 for deeper multi-round research
  const storageMode = args.request.storageMode ?? 'canonical-only'
  const steps: OrchestratorStepResult[] = []
  const failures: Array<{ step: string; message: string }> = []
  const retryHints: string[] = []
  const artifactsChanged = new Set<string>()
  const selectedPaperIds = new Set<string>()
  let selectedPaper: { paperId: string; candidateType: string; branchId?: string | null; stageIndex?: number } | null = null
  let workingTopicMemory = asRecord(args.context.workflowTopicMemory?.[topic.id]) ?? {}

  const runSubSkill = async (params: {
    skillId: 'paper-tracker' | 'content-genesis-v2' | 'topic-visualizer'
    input: Record<string, unknown>
  }) => {
    const definition =
      params.skillId === 'paper-tracker'
        ? paperTrackerSkill
        : params.skillId === 'content-genesis-v2'
          ? contentGenesisSkill
          : topicVisualizerSkill

    return runSkillDefinition(definition, {
      skillId: params.skillId,
      input: params.input,
      agentTarget: args.request.agentTarget,
      storageMode,
    })
  }

  let consecutiveEmptyRounds = 0

  if (workflowMode === 'discover-only' || workflowMode === 'full-cycle') {
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      // Adaptive early stopping: check evidence saturation + quality assessment
      const completedSteps = steps.filter(s => s.status === 'completed')
      const failedSteps = steps.filter(s => s.status === 'failed')

      // Quality-based early stopping (every 3 iterations)
      if (completedSteps.length >= 3 && iteration >= 2 && iteration % 3 === 2) {
        try {
          const quality = await assessResearchQuality({
            topicId: topic.id,
            stageIndex: typeof args.request.input.stageIndex === 'number'
              ? args.request.input.stageIndex
              : undefined,
          })

          // If quality meets threshold, consider early termination
          if (qualityMeetsThreshold(quality)) {
            retryHints.push(`质量达标 (${quality.overallScore.toFixed(2)})，在第${iteration}轮提前结束迭代打磨。`)
            break
          }

          // If quality is critical and no progress, consider intervention
          if (quality.overallScore < 0.45 && consecutiveEmptyRounds >= 2) {
            const strategy = getRefinementStrategy(quality.gaps)
            retryHints.push(`质量严重不足 (${quality.overallScore.toFixed(2)})，缺口: ${quality.gaps.join(', ')}。建议策略: ${strategy.action}`)
          }
        } catch (qualityErr) {
          // Quality assessment failed, continue with standard logic
        }
      }

      // Legacy early stopping: evidence saturation
      if (completedSteps.length >= 3 && failedSteps.length === 0 && iteration >= 3) {
        // Check if last 3 iterations had substantive progress (papers selected)
        const lastThreeIterations = steps.slice(-9) // 3 iterations × 3 steps each (discover, content, visualize)
        const hadPapersSelected = lastThreeIterations.filter(
          s => s.id.startsWith('discover-') && s.status === 'completed'
        ).length >= 3
        // If 3 consecutive successful discovery rounds, consider early termination
        if (hadPapersSelected) {
          // Evidence saturation reached: continue only if there are more candidates to process
          const candidateCount = asStringArray(workingTopicMemory.candidatePaperIds).length
          if (candidateCount === 0) {
            retryHints.push(`自适应早停: 连续3轮成功且无剩余候选，在第${iteration}轮提前结束。`)
            break
          }
        }
      }

      try {
        const discoveryResult = await runSubSkill({
          skillId: 'paper-tracker',
          input: {
            topicId: topic.id,
            branchId: args.request.input.branchId,
            stageIndex: args.request.input.stageIndex,
            stageMode: args.request.input.stageMode ?? 'next-stage',
            discoverySource: args.request.input.discoverySource ?? 'external-only',
            recalibrate: args.request.input.recalibrate === true,
            windowMonths: args.request.input.windowMonths,
            maxCandidates: args.request.input.maxCandidates,
            windowPolicy: args.request.input.windowPolicy ?? 'hybrid-auto-5m',
            allowMerge: args.request.input.allowMerge,
            mode: args.request.input.mode,
            providerId: args.request.input.providerId,
            model: args.request.input.model,
            temperature: args.request.input.temperature,
            maxTokens: args.request.input.maxTokens,
            attachments: args.request.input.attachments,
          },
        })
        appendStep(
          steps,
          {
            id: `discover-${iteration + 1}`,
            skillId: 'paper-tracker',
            status: 'completed',
            summary: discoveryResult.summary,
            persistedArtifacts: discoveryResult.persistedArtifacts,
          },
          artifactsChanged,
        )

        if (asRecord(discoveryResult.output.topicMemoryPatch)) {
          workingTopicMemory = {
            ...workingTopicMemory,
            ...(discoveryResult.output.topicMemoryPatch as Record<string, unknown>),
            decisionLog: [
              ...(Array.isArray(workingTopicMemory.decisionLog) ? workingTopicMemory.decisionLog : []),
              ...(Array.isArray((discoveryResult.output.topicMemoryPatch as Record<string, unknown>).decisionLog)
                ? ((discoveryResult.output.topicMemoryPatch as Record<string, unknown>).decisionLog as unknown[])
                : []),
            ],
          }
        }

        const candidate = inferSelectedCandidate(discoveryResult.output)
        const selectedBranch = inferSelectedBranch(discoveryResult.output)
        if (!candidate || !selectedBranch) {
          consecutiveEmptyRounds++
          retryHints.push(`paper-tracker 没有给出符合当前阶段窗口的候选 (连续空轮次: ${consecutiveEmptyRounds}/3)。可以考虑放宽分支时间窗，或先补充新的 canonical 候选后再运行。`)
          if (workflowMode === 'full-cycle') {
            appendStep(
              steps,
              {
                id: `content-${iteration + 1}`,
                skillId: 'content-genesis-v2',
                status: 'skipped',
                summary: '由于发现阶段没有选出论文，本轮未继续生成正文。',
                persistedArtifacts: [],
              },
              artifactsChanged,
            )
            appendStep(
              steps,
              {
                id: `visualize-${iteration + 1}`,
                skillId: 'topic-visualizer',
                status: 'skipped',
                summary: '由于发现阶段没有选出论文，本轮未继续刷新展示投影。',
                persistedArtifacts: [],
              },
              artifactsChanged,
            )
          }
          // Only break after 3 consecutive empty rounds
          if (consecutiveEmptyRounds >= 3) {
            retryHints.push('连续3轮未选出论文，编排器停止当前运行。')
            break
          }
          continue  // Try next iteration
        }

        if (selectedPaperIds.has(candidate.paperId)) {
          retryHints.push(`后续迭代再次选中了 ${candidate.paperId}，为保证幂等性，编排器已主动停止。`)
          break
        }

        selectedPaperIds.add(candidate.paperId)
        consecutiveEmptyRounds = 0  // Reset on successful selection
        selectedPaper = {
          paperId: candidate.paperId,
          candidateType: candidate.candidateType,
          branchId: selectedBranch.branchId,
          stageIndex: selectedBranch.stageIndex,
        }

        if (workflowMode === 'discover-only') {
          break
        }

        const contentResult = await runSubSkill({
          skillId: 'content-genesis-v2',
          input: {
            topicId: topic.id,
            paperId: candidate.paperId,
            branchId: selectedBranch.branchId,
            stageIndex: selectedBranch.stageIndex,
            problemNodeIds: candidate.derivedFromProblemIds,
            citeIntent: candidate.citeIntent,
            coverageStrict: args.request.input.coverageStrict,
            contentMode: args.request.input.contentMode,
            providerId: args.request.input.providerId,
            model: args.request.input.model,
            temperature: args.request.input.temperature,
            maxTokens: args.request.input.maxTokens,
            attachments: args.request.input.attachments,
          },
        })
        appendStep(
          steps,
          {
            id: `content-${iteration + 1}`,
            skillId: 'content-genesis-v2',
            status: 'completed',
            summary: contentResult.summary,
            persistedArtifacts: contentResult.persistedArtifacts,
          },
          artifactsChanged,
        )

        const promotionContext = buildSyntheticContext({
          base: args.context,
          topicId: topic.id,
          nextTopicMemory: workingTopicMemory,
          paperId: candidate.paperId,
        })
        const promotionChanges = buildPromotionChanges({
          context: promotionContext,
          topicId: topic.id,
          paperId: candidate.paperId,
          candidateType:
            candidate.candidateType === 'direct' ||
            candidate.candidateType === 'branch' ||
            candidate.candidateType === 'transfer'
              ? candidate.candidateType
              : 'direct',
          branchId: selectedBranch.branchId,
          mergeTargetBranchIds: candidate.mergeTargetBranchIds ?? [],
          resolvedProblemIds: candidate.derivedFromProblemIds,
        })

        appendStep(
          steps,
          {
            id: `promote-${iteration + 1}`,
            skillId: 'orchestrator',
            status: promotionChanges.length > 0 ? 'completed' : 'skipped',
            summary:
              promotionChanges.length > 0
                ? `已把 ${candidate.paperId} 提升写入 canonical 主题记忆。`
                : `${candidate.paperId} 本轮不需要额外的主题记忆提升写入。`,
            persistedArtifacts: promotionChanges.length > 0 ? ['workflow/topic-memory.json', 'workflow/decision-memory.json'] : [],
          },
          artifactsChanged,
        )

        const topicMemoryChange = promotionChanges.find(
          (change) => change.relativePath === 'workflow/topic-memory.json' && asRecord(change.nextValue),
        )
        if (topicMemoryChange && asRecord(topicMemoryChange.nextValue)) {
          const nextWorkflow = topicMemoryChange.nextValue as Record<string, Record<string, unknown>>
          workingTopicMemory = nextWorkflow[topic.id] ?? workingTopicMemory
        }

        const visualizerResult = await runSubSkill({
          skillId: 'topic-visualizer',
          input: {
            topicId: topic.id,
            rebuildMode: iteration === 0 ? 'incremental' : 'full',
          },
        })
        appendStep(
          steps,
          {
            id: `visualize-${iteration + 1}`,
            skillId: 'topic-visualizer',
            status: 'completed',
            summary: visualizerResult.summary,
            persistedArtifacts: visualizerResult.persistedArtifacts,
          },
          artifactsChanged,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push({
          step: workflowMode === 'discover-only' ? 'paper-tracker' : 'full-cycle',
          message,
        })
        retryHints.push('先检查失败步骤的报错信息；如果需要保留中间产物，请改用 `storageMode=debug` 重新运行。')
        appendStep(
          steps,
          {
            id: `failure-${iteration + 1}`,
            skillId: workflowMode === 'discover-only' ? 'paper-tracker' : 'orchestrator',
            status: 'failed',
            summary: message,
            persistedArtifacts: [],
          },
          artifactsChanged,
        )
        break
      }
    }
  } else if (workflowMode === 'content-only') {
    try {
      const paperId =
        typeof args.request.input.paperId === 'string'
          ? args.request.input.paperId
          : resolvePaperIdFromMemory(workingTopicMemory)
      if (!paperId) {
        throw new Error('content-only 模式需要显式传入 paperId，或 recommendationQueue 中已有已选论文。')
      }

      selectedPaper = {
        paperId,
        candidateType: 'direct',
        branchId: resolveBranchIdForPaper(workingTopicMemory, paperId),
      }

      const contentResult = await runSubSkill({
        skillId: 'content-genesis-v2',
        input: {
          topicId: topic.id,
          paperId,
          branchId: selectedPaper.branchId ?? undefined,
          stageIndex: typeof args.request.input.stageIndex === 'number' ? args.request.input.stageIndex : undefined,
          coverageStrict: args.request.input.coverageStrict,
          contentMode: args.request.input.contentMode,
          providerId: args.request.input.providerId,
          model: args.request.input.model,
          temperature: args.request.input.temperature,
          maxTokens: args.request.input.maxTokens,
          attachments: args.request.input.attachments,
        },
      })
      appendStep(
        steps,
        {
          id: 'content-only',
          skillId: 'content-genesis-v2',
          status: 'completed',
          summary: contentResult.summary,
          persistedArtifacts: contentResult.persistedArtifacts,
        },
        artifactsChanged,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ step: 'content-genesis-v2', message })
      appendStep(
        steps,
        {
          id: 'content-only',
          skillId: 'content-genesis-v2',
          status: 'failed',
          summary: message,
          persistedArtifacts: [],
        },
        artifactsChanged,
      )
    }
  } else {
    try {
      const paperId =
        typeof args.request.input.paperId === 'string' ? args.request.input.paperId : undefined

      if (workflowMode === 'rebuild' && paperId) {
        const contentResult = await runSubSkill({
          skillId: 'content-genesis-v2',
          input: {
            topicId: topic.id,
            paperId,
            branchId: resolveBranchIdForPaper(workingTopicMemory, paperId) ?? undefined,
            stageIndex: typeof args.request.input.stageIndex === 'number' ? args.request.input.stageIndex : undefined,
            coverageStrict: args.request.input.coverageStrict,
            contentMode: args.request.input.contentMode,
            providerId: args.request.input.providerId,
            model: args.request.input.model,
            temperature: args.request.input.temperature,
            maxTokens: args.request.input.maxTokens,
            attachments: args.request.input.attachments,
          },
        })
        appendStep(
          steps,
          {
            id: 'rebuild-content',
            skillId: 'content-genesis-v2',
            status: 'completed',
            summary: contentResult.summary,
            persistedArtifacts: contentResult.persistedArtifacts,
          },
          artifactsChanged,
        )
        selectedPaper = {
          paperId,
          candidateType: 'direct',
          branchId: resolveBranchIdForPaper(workingTopicMemory, paperId),
        }
      }

      const visualizerResult = await runSubSkill({
        skillId: 'topic-visualizer',
        input: {
          topicId: topic.id,
          paperIds: Array.isArray(args.request.input.paperIds) ? args.request.input.paperIds : undefined,
          rebuildMode: workflowMode === 'rebuild' ? 'full' : args.request.input.rebuildMode,
        },
      })
      appendStep(
        steps,
        {
          id: workflowMode,
          skillId: 'topic-visualizer',
          status: 'completed',
          summary: visualizerResult.summary,
          persistedArtifacts: visualizerResult.persistedArtifacts,
        },
        artifactsChanged,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ step: 'topic-visualizer', message })
      appendStep(
        steps,
        {
          id: workflowMode,
          skillId: 'topic-visualizer',
          status: 'failed',
          summary: message,
          persistedArtifacts: [],
        },
        artifactsChanged,
      )
    }
  }

  const refreshedContext = buildSyntheticContext({
    base: args.context,
    topicId: topic.id,
    nextTopicMemory: workingTopicMemory,
    paperId: selectedPaper?.paperId,
  })
  const artifactChanges: SkillArtifactChange[] = [
    buildExecutionMemoryChange({
      context: refreshedContext,
      skillId: 'orchestrator',
      patch: {
        lastTopicId: topic.id,
        lastWorkflowMode: workflowMode,
        lastSelectedPaperId: selectedPaper?.paperId ?? null,
        lastSelectedBranchId: selectedPaper?.branchId ?? null,
        lastStageIndex: selectedPaper?.stageIndex ?? null,
        lastFailureCount: failures.length,
        lastStepCount: steps.length,
      },
    }),
  ]

  return {
    output: {
      steps,
      artifactsChanged: Array.from(artifactsChanged),
      selectedPaper,
      summary:
        failures.length > 0
          ? `orchestrator 在主题 ${topic.nameZh} 的 ${workflowMode} 运行中出现 ${failures.length} 个失败步骤。`
          : `orchestrator 已为主题 ${topic.nameZh} 完成 ${steps.filter((step) => step.status === 'completed').length} 个步骤，运行模式为 ${workflowMode}。`,
      failures,
      retryHints,
    },
    artifactChanges,
    summary:
      failures.length > 0
        ? `orchestrator 在 ${topic.nameZh} 上运行结束，但仍有 ${failures.length} 个失败步骤。`
        : `orchestrator 已完成 ${topic.nameZh} 的 ${workflowMode} 运行。`,
  }
}
