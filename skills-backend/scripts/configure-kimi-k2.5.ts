/**
 * Configure Kimi-K2.5 model for 溯知 TraceMind.
 *
 * Usage:
 *   npx tsx scripts/configure-kimi-k2.5.ts
 *   npx tsx scripts/configure-kimi-k2.5.ts --api-key=sk-xxx --base-url=https://ai.1seey.com/v1
 *   npx tsx scripts/configure-kimi-k2.5.ts --test
 *
 * This script:
 *   1. Saves Kimi-K2.5 configuration for both language and multimodal slots
 *   2. Sets up task routing for vision/document tasks
 *   3. Optionally tests the configuration
 */

import 'dotenv/config'
import { saveUserModelConfig, getResolvedUserModelConfig, getModelCapabilitySummary } from '../src/services/omni/config-store'
import { omniGateway } from '../src/services/omni/gateway'
import type { UserModelConfig } from '../shared/model-config'

interface KimiConfigOptions {
  apiKey: string
  baseUrl: string
  model: string
  test: boolean
  verbose: boolean
}

const DEFAULT_API_KEY = 'sk-J4LY1GZTN6bO3AvakqIUGzsvmDlyHuo9Q5JW3Og8HsyHCQIN'
const DEFAULT_BASE_URL = 'https://ai.1seey.com/v1'
const DEFAULT_MODEL = 'Kimi-K2.5'

function parseArgs(): KimiConfigOptions {
  const args = process.argv.slice(2)

  const apiKeyArg = args.find((arg) => arg.startsWith('--api-key='))
  const baseUrlArg = args.find((arg) => arg.startsWith('--base-url='))
  const modelArg = args.find((arg) => arg.startsWith('--model='))
  const test = args.includes('--test')
  const verbose = args.includes('--verbose') || args.includes('-v')

  return {
    apiKey: apiKeyArg ? apiKeyArg.slice('--api-key='.length) : DEFAULT_API_KEY,
    baseUrl: baseUrlArg ? baseUrlArg.slice('--base-url='.length) : DEFAULT_BASE_URL,
    model: modelArg ? modelArg.slice('--model='.length) : DEFAULT_MODEL,
    test,
    verbose,
  }
}

async function configureKimi(options: KimiConfigOptions): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('Kimi-K2.5 Model Configuration')
  console.log('='.repeat(60))
  console.log(`API Base URL: ${options.baseUrl}`)
  console.log(`Model: ${options.model}`)
  console.log(`API Key: ${options.apiKey.slice(0, 8)}...${options.apiKey.slice(-4)}`)
  console.log('-'.repeat(60))

  // Build configuration for Kimi-K2.5
  const config: UserModelConfig = {
    // Language slot: Kimi-K2.5 for text-based tasks
    language: {
      provider: 'openai_compatible',
      model: options.model,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      options: {
        thinking: 'auto',
        temperature: 0.2,
        maxTokens: 4096,
      },
      providerOptions: {
        headers: {
          'HTTP-Referer': 'https://suzhi.example',
          'X-Title': 'TraceMind Research Workbench',
        },
      },
    },
    // Multimodal slot: Kimi-K2.5 for vision/document tasks
    multimodal: {
      provider: 'openai_compatible',
      model: options.model,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      options: {
        thinking: 'auto',
        temperature: 0.2,
        maxTokens: 4096,
      },
      providerOptions: {
        headers: {
          'HTTP-Referer': 'https://suzhi.example',
          'X-Title': 'TraceMind Research Workbench',
        },
      },
    },
    // Task routing: route specific tasks to optimal slots
    taskRouting: {
      // Vision/document tasks should go to multimodal slot
      document_parse: 'multimodal',
      figure_analysis: 'multimodal',
      formula_recognition: 'multimodal',
      table_extraction: 'multimodal',
      topic_chat_vision: 'multimodal',
      evidence_explainer: 'multimodal',
      // Text-based tasks use language slot
      general_chat: 'language',
      topic_chat: 'language',
      topic_summary: 'language',
    },
  }

  console.log('\nSaving configuration...')

  try {
    const saved = await saveUserModelConfig(config)

    console.log('\n✓ Configuration saved successfully!')
    console.log(`  Language slot: ${saved.language?.provider}/${saved.language?.model}`)
    console.log(`  Multimodal slot: ${saved.multimodal?.provider}/${saved.multimodal?.model}`)
    console.log(`  Task routing: ${Object.keys(saved.taskRouting || {}).length} tasks configured`)

    if (options.verbose) {
      console.log('\nFull configuration:')
      console.log(JSON.stringify(saved, null, 2))
    }
  } catch (error) {
    console.error('\n✗ Failed to save configuration:', error)
    throw error
  }
}

async function testKimiConfiguration(options: KimiConfigOptions): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('Testing Kimi-K2.5 Configuration')
  console.log('='.repeat(60))

  try {
    // Test 1: Get capability summary
    console.log('\nTest 1: Get capability summary...')
    const capabilities = await getModelCapabilitySummary()

    console.log(`  Language slot: ${capabilities.slots.language.provider}/${capabilities.slots.language.model}`)
    console.log(`    Capability: ${JSON.stringify(capabilities.slots.language.capability)}`)
    console.log(`    API Key: ${capabilities.slots.language.apiKeyStatus}`)

    console.log(`  Multimodal slot: ${capabilities.slots.multimodal.provider}/${capabilities.slots.multimodal.model}`)
    console.log(`    Capability: ${JSON.stringify(capabilities.slots.multimodal.capability)}`)
    console.log(`    API Key: ${capabilities.slots.multimodal.apiKeyStatus}`)

    // Test 2: Simple completion
    console.log('\nTest 2: Simple text completion...')
    const start = Date.now()

    const result = await omniGateway.complete({
      task: 'general_chat',
      messages: [
        { role: 'system', content: 'You are a helpful research assistant. Reply in a friendly, concise manner.' },
        { role: 'user', content: 'Hello! Please say "Kimi-K2.5 configuration successful!" in one short sentence.' },
      ],
      temperature: 0,
      maxTokens: 50,
    })

    const elapsed = Date.now() - start

    if (result.issue) {
      console.log(`  ✗ Error: ${result.issue.title}`)
      console.log(`    Message: ${result.issue.message}`)
    } else {
      console.log(`  ✓ Response received in ${elapsed}ms`)
      console.log(`  Provider: ${result.provider}`)
      console.log(`  Model: ${result.model}`)
      console.log(`  Text: ${result.text?.slice(0, 100)}${result.text && result.text.length > 100 ? '...' : ''}`)
    }

    // Test 3: Vision capability test (with small base64 image)
    console.log('\nTest 3: Vision capability test...')
    const visionStart = Date.now()

    // A tiny 1x1 red pixel PNG
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    const visionResult = await omniGateway.complete({
      task: 'topic_chat_vision',
      messages: [
        { role: 'system', content: 'You are a vision assistant. Describe what you see briefly.' },
        {
          role: 'user',
          content: 'What color is this pixel? Reply with just the color name.',
          attachments: [
            {
              type: 'image',
              mimeType: 'image/png',
              base64: tinyPng,
            },
          ],
        },
      ],
      temperature: 0,
      maxTokens: 20,
    })

    const visionElapsed = Date.now() - visionStart

    if (visionResult.issue) {
      console.log(`  ✗ Error: ${visionResult.issue.title}`)
      console.log(`    Message: ${visionResult.issue.message}`)
    } else {
      console.log(`  ✓ Vision response received in ${visionElapsed}ms`)
      console.log(`  Provider: ${visionResult.provider}`)
      console.log(`  Model: ${visionResult.model}`)
      console.log(`  Text: ${visionResult.text}`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('All tests completed!')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\nTest failed with error:', error)
    throw error
  }
}

async function main(): Promise<void> {
  const options = parseArgs()

  try {
    // Configure Kimi-K2.5
    await configureKimi(options)

    // Optionally test the configuration
    if (options.test) {
      await testKimiConfiguration(options)
    } else {
      console.log('\nTip: Run with --test flag to verify the configuration.')
    }
  } catch (error) {
    console.error('\nConfiguration failed:', error)
    process.exitCode = 1
  }
}

void main()
