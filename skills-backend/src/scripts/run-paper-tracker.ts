/**
 * Paper Tracker Runner
 * 直接执行论文发现和准入评审
 *
 * 用法：
 * npx tsx src/scripts/run-paper-tracker.ts --topic=autonomous-driving
 */

import { paperTrackerSkill } from '../../skill-packs/research/paper-tracker/skill'
import { runSkillDefinition } from '../../engine/runner'
import { PrismaClient } from '@prisma/client'
import _winston from 'winston'

const prisma = new PrismaClient()

// 创建logger
const _logger = _winston.createLogger({
  level: 'info',
  format: _winston.format.combine(
    _winston.format.timestamp(),
    _winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta) : ''}`
    })
  ),
  transports: [
    new _winston.transports.Console(),
    new _winston.transports.File({ filename: 'logs/paper-tracker.log' })
  ]
})

async function main() {
  const args = process.argv.slice(2)
  const commands = args.reduce((acc, arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      acc[key] = value || true
    }
    return acc
  }, {} as Record<string, string | boolean>)

  const topicId = (commands.topic as string) || 'autonomous-driving'
  const maxCandidates = commands.maxCandidates ? parseInt(commands.maxCandidates as string, 10) : 200
  const mode = (commands.mode as string) || 'commit'
  const dryRun = commands['dry-run'] === true

  console.log('========================================')
  console.log('Paper Tracker Runner')
  console.log('========================================')
  console.log(`Topic ID: ${topicId}`)
  console.log(`Max Candidates: ${maxCandidates}`)
  console.log(`Mode: ${mode}`)
  console.log(`Dry Run: ${dryRun}`)
  console.log('========================================')

  // 检查主题是否存在
  const topic = await prisma.topics.findUnique({
    where: { id: topicId },
    include: {
      papers: { select: { id: true, title: true, status: true } },
      topic_stages: { orderBy: { order: 'asc' } }
    }
  })

  if (!topic) {
    console.error(`Topic not found: ${topicId}`)
    process.exit(1)
  }

  console.log(`\nTopic: ${topic.nameZh} / ${topic.nameEn}`)
  console.log(`Focus: ${topic.focusLabel}`)
  console.log(`Current papers: ${topic.papers.length}`)
  console.log(`Stages: ${topic.topic_stages.length}`)

  // 统计当前论文状态
  const paperStats = {
    published: topic.papers.filter(p => p.status === 'published').length,
    candidate: topic.papers.filter(p => p.status === 'candidate').length,
    draft: topic.papers.filter(p => p.status === 'draft').length
  }
  console.log(`Paper stats: published=${paperStats.published}, candidate=${paperStats.candidate}, draft=${paperStats.draft}`)

  console.log('\n========================================')
  console.log('Starting Paper Discovery...')
  console.log('========================================\n')

  const startTime = Date.now()

  try {
    const result = await runSkillDefinition(paperTrackerSkill, {
      skillId: 'paper-tracker',
      input: {
        topicId,
        maxCandidates,
        mode: dryRun ? 'dry-run' : mode,
        discoverySource: 'external-only',
        stageMode: 'next-stage'
      },
      agentTarget: 'codex',
      storageMode: dryRun ? 'dry-run' : 'canonical-only'
    })

    const duration = Date.now() - startTime

    console.log('\n========================================')
    console.log('Paper Tracker Completed!')
    console.log('========================================')
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`)
    console.log(`Run ID: ${result.runId}`)
    console.log(`Summary: ${result.summary}`)

    // 输出发现结果
    const output = result.output as any
    if (output.discoverySummary) {
      console.log('\n--- Discovery Summary ---')
      console.log(`Total discovered: ${output.discoverySummary.totalDiscovered}`)
      console.log(`Total queries: ${output.discoverySummary.totalQueries}`)
    }

    if (output.admittedCandidates) {
      console.log('\n--- Admitted Candidates ---')
      console.log(`Count: ${output.admittedCandidates.length}`)
      for (const candidate of output.admittedCandidates.slice(0, 10)) {
        console.log(`  - [${candidate.status}] ${candidate.title?.slice(0, 60)} (confidence: ${candidate.confidence?.toFixed(2)})`)
      }
      if (output.admittedCandidates.length > 10) {
        console.log(`  ... and ${output.admittedCandidates.length - 10} more`)
      }
    }

    if (output.candidates) {
      const statusCounts = {
        admitted: output.candidates.filter((c: any) => c.status === 'admitted').length,
        candidate: output.candidates.filter((c: any) => c.status === 'candidate').length,
        rejected: output.candidates.filter((c: any) => c.status === 'rejected').length
      }
      console.log('\n--- Candidate Status Distribution ---')
      console.log(`Admitted: ${statusCounts.admitted}`)
      console.log(`Candidate: ${statusCounts.candidate}`)
      console.log(`Rejected: ${statusCounts.rejected}`)
    }

    // 检查持久化结果
    if (result.persistedArtifacts && result.persistedArtifacts.length > 0) {
      console.log('\n--- Persisted Artifacts ---')
      for (const artifact of result.persistedArtifacts) {
        console.log(`  - ${artifact}`)
      }
    }

    // 验证数据库更新
    if (!dryRun) {
      console.log('\n--- Verifying Database Updates ---')
      const updatedTopic = await prisma.topics.findUnique({
        where: { id: topicId },
        include: {
          papers: { select: { id: true, title: true, status: true } }
        }
      })

      if (updatedTopic) {
        const newPaperStats = {
          published: updatedTopic.papers.filter(p => p.status === 'published').length,
          candidate: updatedTopic.papers.filter(p => p.status === 'candidate').length,
          draft: updatedTopic.papers.filter(p => p.status === 'draft').length
        }
        console.log(`Before: published=${paperStats.published}, candidate=${paperStats.candidate}`)
        console.log(`After:  published=${newPaperStats.published}, candidate=${newPaperStats.candidate}`)
        console.log(`Total papers: ${updatedTopic.papers.length}`)
      }
    }

  } catch (error) {
    console.error('\n========================================')
    console.error('Paper Tracker Failed!')
    console.error('========================================')
    console.error(error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
