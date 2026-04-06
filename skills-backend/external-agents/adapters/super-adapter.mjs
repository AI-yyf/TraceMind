#!/usr/bin/env node
/**
 * 超级 Agent 适配器
 * 执行外部 Agent 任务并处理输出
 */

import { promises as fs } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = parseArgs(process.argv)
  
  if (!args.job) {
    console.error('Usage: super-adapter.mjs --job <job-file> [--adapter <name>]')
    process.exit(1)
  }

  // 读取任务包
  const jobPath = path.resolve(args.job)
  const job = JSON.parse(await fs.readFile(jobPath, 'utf8'))
  
  // 确定使用的 Agent
  const adapterName = args.adapter || 'codex'
  const adapterConfig = await loadAdapterConfig(adapterName)
  
  // 准备输出路径
  const outputDir = path.dirname(jobPath)
  const baseName = path.basename(jobPath, '.json')
  const promptFile = path.join(outputDir, `${baseName}.super-prompt.md`)
  const outputFile = path.join(outputDir, `${baseName}.${adapterName}.json`)
  
  // 写入超级提示词
  await fs.writeFile(promptFile, job.superPrompt, 'utf8')
  
  console.log(`[SuperAdapter] Executing ${adapterName}...`)
  console.log(`[SuperAdapter] Prompt: ${promptFile}`)
  console.log(`[SuperAdapter] Output: ${outputFile}`)
  
  // 执行 Agent
  const command = buildCommand(adapterConfig, promptFile, outputFile)
  const result = await executeCommand(command, job.taskConfig?.timeout || 300000)
  
  // 解析和验证输出
  const output = await parseOutput(outputFile)
  const validated = validateOutput(output, job.outputContract)
  
  // 写入报告
  const reportFile = path.join(outputDir, `${baseName}.${adapterName}.report.json`)
  await fs.writeFile(reportFile, JSON.stringify({
    schemaVersion: 'super-agent-report-v1',
    adapter: adapterName,
    success: validated.success,
    errors: validated.errors,
    metadata: output.metadata,
    confidence: output.confidence,
    executionTime: result.duration,
  }, null, 2), 'utf8')
  
  console.log(`[SuperAdapter] Completed. Success: ${validated.success}`)
  
  if (!validated.success) {
    process.exit(1)
  }
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    args[key] = argv[i + 1]
  }
  return args
}

async function loadAdapterConfig(name) {
  const configPath = path.join(__dirname, '..', 'adapters.local.json')
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
    return config.adapters?.[name]
  } catch {
    // 返回默认配置
    return getDefaultAdapter(name)
  }
}

function getDefaultAdapter(name) {
  const defaults = {
    codex: {
      command: 'codex --model o4-mini -p {promptFile} --output {outputFile}'
    },
    claudecode: {
      command: 'claude code --prompt {promptFile} --output {outputFile}'
    }
  }
  return defaults[name]
}

function buildCommand(config, promptFile, outputFile) {
  return config.command
    .replace(/\{promptFile\}/g, promptFile)
    .replace(/\{outputFile\}/g, outputFile)
}

async function executeCommand(command, timeout) {
  const startTime = Date.now()
  
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ')
    const child = spawn(cmd, args, { shell: true })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => { stdout += data })
    child.stderr.on('data', (data) => { stderr += data })
    
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Execution timeout after ${timeout}ms`))
    }, timeout)
    
    child.on('close', (code) => {
      clearTimeout(timeoutId)
      const duration = Date.now() - startTime
      
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`))
      } else {
        resolve({ code, duration, stdout, stderr })
      }
    })
    
    child.on('error', reject)
  })
}

async function parseOutput(outputFile) {
  const content = await fs.readFile(outputFile, 'utf8')
  
  // 尝试提取 JSON（处理可能的 Markdown 代码块）
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || 
                    content.match(/```\s*([\s\S]*?)```/) ||
                    [null, content]
  
  try {
    return JSON.parse(jsonMatch[1].trim())
  } catch (error) {
    throw new Error(`Failed to parse output JSON: ${error.message}`)
  }
}

function validateOutput(output, contract) {
  const errors = []
  
  // 验证 schema 版本
  if (output.schemaVersion !== 'super-agent-output-v1') {
    errors.push(`Invalid schema version: ${output.schemaVersion}`)
  }
  
  // 验证必要字段
  const required = ['metadata', 'content', 'confidence']
  for (const field of required) {
    if (!(field in output)) {
      errors.push(`Missing required field: ${field}`)
    }
  }
  
  // 验证 content 结构是否符合 contract
  if (output.content && contract) {
    const contentErrors = validateContentStructure(output.content, contract)
    errors.push(...contentErrors)
  }
  
  return {
    success: errors.length === 0,
    errors
  }
}

function validateContentStructure(content, contract) {
  const errors = []
  
  // 递归验证对象结构
  function validate(obj, schema, path = '') {
    if (schema.type === 'object' && schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const fullPath = path ? `${path}.${key}` : key
        
        if (propSchema.required && !(key in obj)) {
          errors.push(`Missing required field: ${fullPath}`)
          continue
        }
        
        if (key in obj && propSchema.type === 'object') {
          validate(obj[key], propSchema, fullPath)
        }
      }
    }
  }
  
  validate(content, contract)
  return errors
}

main().catch(error => {
  console.error('[SuperAdapter] Error:', error.message)
  process.exit(1)
})
