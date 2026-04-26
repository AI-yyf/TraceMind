/**
 * Verification script for research-quality module
 *
 * Usage: npx tsx scripts/verify-research-quality.ts
 */

import { prisma } from '../src/lib/prisma'
import { assessResearchQuality, qualityMeetsThreshold, getRefinementStrategy } from '../skill-packs/research/orchestrator/research-quality'

async function main() {
  console.log('=== Research Quality Verification ===\n')

  // Find topics
  const topics = await prisma.topics.findMany({
    select: { id: true, nameZh: true, nameEn: true },
    take: 5,
  })

  if (topics.length === 0) {
    console.log('No topics found in database.')
    return
  }

  console.log(`Found ${topics.length} topics:\n`)

  for (const topic of topics) {
    const title = topic.nameZh || topic.nameEn || 'Untitled'
    console.log(`\n--- Topic: ${title} (${topic.id}) ---`)

    try {
      // Run quality assessment
      const quality = await assessResearchQuality({
        topicId: topic.id,
      })

      console.log('\nQuality Scores:')
      console.log(`  Node Stability:  ${quality.nodeStabilityScore.toFixed(2)}`)
      console.log(`  Evidence Coverage: ${quality.evidenceCoverageScore.toFixed(2)}`)
      console.log(`  Judgment Density: ${quality.judgmentDensityScore.toFixed(2)}`)
      console.log(`  Content Quality: ${quality.contentQualityScore.toFixed(2)}`)
      console.log(`  Overall Score: ${quality.overallScore.toFixed(2)}`)

      console.log('\nDetails:')
      console.log(`  Nodes: ${quality.details.nodeCount} (${quality.details.nodesWithPapers} with papers)`)
      console.log(`  Papers: ${quality.details.paperCount} (${quality.details.papersWithEvidence} with evidence)`)
      console.log(`  Judgments: ${quality.details.judgmentCount}`)
      console.log(`  Nodes with Content: ${quality.details.nodesWithContent}`)

      if (quality.gaps.length > 0) {
        console.log(`\nGaps: ${quality.gaps.join(', ')}`)
        const strategy = getRefinementStrategy(quality.gaps)
        console.log(`Suggested Action: ${strategy.action} (priority ${strategy.priority})`)
      } else {
        console.log('\nNo gaps identified!')
      }

      console.log(`\nMeets Threshold: ${qualityMeetsThreshold(quality) ? 'YES' : 'NO'}`)
    } catch (error) {
      console.error(`Error assessing topic: ${error}`)
    }
  }

  console.log('\n=== Verification Complete ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
