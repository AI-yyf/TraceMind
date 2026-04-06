# External Agents Scaffold

这个目录是给 `Codex`、`OpenClaw`、`ClaudeCode` 这类 AI CLI 工具预留的安全接入层。它们可以读取当前后端 Prompt Studio 导出的任务包，按同一套提示词、运行参数、记忆上下文和输出契约生成内容，但不会直接改坏现有的 `skill-packs/`、prompt registry 或核心 orchestrator。

## 这套脚手架解决什么问题

- 让外部 agent 和站内 LLM / VLM 使用同一套提示词母版。
- 让多次生成有明确衔接：上一轮输出、主题记忆、阶段记忆、输出契约都会随任务包导出。
- 让外部工具只负责“执行一次生成任务”，而不是私自改写系统框架。
- 让生成结果以结构化 JSON 回流，后续可以继续进入现有 topic memory 与多 pass 流程。

## 推荐工作流

1. 先在前端设置中心配置语言模型、视觉模型、默认语言和运行参数。
2. 在 Prompt Studio 中调整提示词模板、固定文案和多次生成参数。
3. 从后端导出一个任务包：

```powershell
node .\external-agents\scripts\export-job.mjs `
  --api-base http://127.0.0.1:3303 `
  --template article.node `
  --topic-id your-topic-id `
  --subject-type node `
  --subject-id your-node-id `
  --language zh `
  --input-json .\sample-input.json `
  --memory-json .\sample-memory.json `
  --output-contract .\sample-contract.json `
  --out .\external-agents\jobs\node-article-job.json
```

4. 复制 `adapters.example.json` 为 `adapters.local.json`，填入你实际使用的 CLI 命令。
5. 运行指定 adapter：

```powershell
node .\external-agents\scripts\run-adapter.mjs `
  --config .\external-agents\adapters.local.json `
  --adapter codex `
  --job .\external-agents\jobs\node-article-job.json
```

6. 在 `external-agents\outputs\` 查看 prompt 文件、stdout 捕获和执行报告。

## 任务包里已经包含什么

- 当前模板的 `system` / `user`
- Prompt Studio 里的全局专家母规则 `editorialPolicies`
- 多 pass 运行参数，比如 `selfRefinePasses`、阶段命名轮数、节点文章轮数
- 当前主题的显式记忆上下文 `memoryContext`
- 输出契约 `outputContract`
- 当前任务的结构化输入 `input`

这意味着外部 agent 不是从零开写，而是在延续主题主线。

## 多次请求如何衔接

- 第一轮只负责按模板完成当前任务。
- 如果任务包声明了 refinement 轮次，外部 agent 应先自检一轮，再返回 JSON。
- 若你希望做更深的多轮生成，不要在外部脚手架里随意扩展协议，而是继续导出下一轮任务包，把上一轮结果写入 `memoryContext` 或新输入里。
- 这样可以保证“多轮生成”仍然受后端统一调度，而不是让不同 agent 各写各的。

## 目录说明

- `PROMPT_GUIDE.md`
  外部 agent 必须遵守的提示词执行说明。
- `adapters.example.json`
  CLI 适配器样例。
- `scripts/export-job.mjs`
  从运行中的后端导出一个任务包。
- `scripts/run-adapter.mjs`
  渲染 prompt 文件并执行外部 CLI。
- `jobs/`
  生成任务包。
- `outputs/`
  prompt 文本、stdout 和执行报告。

## 约束

- 不直接修改 `skill-packs/`
- 不直接修改 prompt registry
- 不跳过 `outputContract`
- 不在没有证据的情况下臆造图表、公式解释或论文角色

这层脚手架的目标不是替代后端，而是把外部 agent 稳定接进来，让它们成为可控的 LLM / VLM 执行器。
