import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import {
  loadTopicResearchReport,
  saveTopicResearchReport,
  type ResearchRunReport,
} from '../services/topics/research-report'

test('research report normalizes mixed-language stage key moves on load/save', async () => {
  const topicId = 'topic-report-normalize-test'
  const report: ResearchRunReport = {
    schemaVersion: 'topic-research-report-v1',
    reportId: 'report-normalize-test',
    taskId: 'task-normalize-test',
    topicId,
    topicName: '测试主题',
    researchMode: 'duration',
    trigger: 'manual',
    status: 'paused',
    durationHours: 1,
    startedAt: new Date('2026-04-03T10:00:00.000Z').toISOString(),
    deadlineAt: new Date('2026-04-03T11:00:00.000Z').toISOString(),
    completedAt: new Date('2026-04-03T10:10:00.000Z').toISOString(),
    updatedAt: new Date('2026-04-03T10:10:00.000Z').toISOString(),
    currentStage: 1,
    totalStages: 5,
    completedStageCycles: 0,
    totalRuns: 2,
    successfulRuns: 2,
    failedRuns: 0,
    discoveredPapers: 24,
    admittedPapers: 0,
    generatedContents: 0,
    latestStageSummary: '本轮没有新的论文被纳入主线，因此当前阶段继续停留在证据收束与判断校准模式。',
    headline: '1 小时研究已暂停',
    dek: '本轮没有新的论文被纳入主线，因此当前阶段继续停留在证据收束与判断校准模式。',
    summary: '测试摘要',
    paragraphs: ['测试段落'],
    keyMoves: ['Stage 1: 本轮没有新的论文被纳入主线，因此当前阶段继续停留在证据收束与判断校准模式。'],
    openQuestions: [],
    latestNodeActions: [],
  }

  try {
    const saved = await saveTopicResearchReport(report)
    assert.deepEqual(saved.keyMoves, [
      '第 1 阶段：本轮没有新的论文被纳入主线，因此当前阶段继续停留在证据收束与判断校准模式。',
    ])

    const loaded = await loadTopicResearchReport(topicId)
    assert.deepEqual(loaded?.keyMoves, [
      '第 1 阶段：本轮没有新的论文被纳入主线，因此当前阶段继续停留在证据收束与判断校准模式。',
    ])
  } finally {
    await prisma.system_configs.deleteMany({
      where: { key: `topic:${topicId}:research-report` },
    })
  }
})
