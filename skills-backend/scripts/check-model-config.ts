/**
 * Check model configuration script
 * Verifies that API keys and model configs are properly set up
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('=== Model Configuration Check ===\n')

  // Check model_configs table
  const modelConfigs = await prisma.model_configs.findMany({
    select: {
      id: true,
      provider: true,
      model: true,
      baseUrl: true,
      enabled: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })

  console.log(`Found ${modelConfigs.length} model configurations:\n`)

  for (const config of modelConfigs) {
    console.log(`- ${config.provider}/${config.model}`)
    console.log(`  Base URL: ${config.baseUrl || '(default)'}`)
    console.log(`  Enabled: ${config.enabled ? 'YES' : 'NO'}`)
    console.log(`  Updated: ${config.updatedAt}`)
    console.log()
  }

  // Check for Kimi-K2.5 specifically
  const kimiConfig = modelConfigs.find(c =>
    c.model?.toLowerCase().includes('kimi') ||
    c.provider?.toLowerCase().includes('kimi')
  )

  if (kimiConfig) {
    console.log('✅ Kimi configuration found')
  } else {
    console.log('⚠️ No Kimi configuration found')
    console.log('   Expected: provider=kimi, model=Kimi-K2.5')
    console.log('   Base URL: https://ai.1seey.com/v1')
  }

  // Check system_configs for any API keys
  const systemConfigs = await prisma.system_configs.findMany({
    where: {
      key: { contains: 'api' },
    },
  })

  console.log(`\nSystem configs with 'api' in key: ${systemConfigs.length}`)
  for (const cfg of systemConfigs) {
    const valuePreview = cfg.value.length > 20
      ? cfg.value.substring(0, 20) + '...'
      : cfg.value
    console.log(`- ${cfg.key}: ${valuePreview}`)
  }

  console.log('\n=== Check Complete ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
