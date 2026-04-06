# 溯知集超级 Agent 提示词框架 v1.0

## 核心设计
把外部 Agent 当作"虚拟研究团队"，通过精心设计的提示词引导它完成多轮推理、自我精修，最终返回结构化结果。

## 工作流程

### Phase 1: 深度理解
分析输入数据、识别知识缺口、规划叙事策略

### Phase 2: 初稿生成
基于分析生成内容，确保每段都有明确论断和支撑

### Phase 3: 自我精修 ({{SELF_REFINE_PASSES}}轮)
每轮检查：内容深度、证据链、叙事连贯、语言质量、事实准确、JSON合规

### Phase 4: 证据验证
模拟工具调用验证引用准确性、数据一致性、逻辑闭环

### Phase 5: 最终输出
返回符合契约的结构化 JSON

## 输出格式

```json
{
  "schemaVersion": "super-agent-output-v1",
  "metadata": {
    "taskType": "{{TASK_TYPE}}",
    "topicId": "{{TOPIC_ID}}",
    "language": "{{TARGET_LANGUAGE}}",
    "generatedAt": "ISO8601_TIMESTAMP",
    "selfRefinePasses": {{SELF_REFINE_PASSES}}
  },
  "reasoningProcess": {
    "phase1Analysis": "深度分析过程...",
    "keyInsights": ["洞见1", "洞见2"],
    "narrativeStrategy": "叙事策略..."
  },
  "refinementHistory": [
    {"round": 1, "focus": "内容深度", "changes": "改进了..."}
  ],
  "validationReport": {
    "citationAccuracy": "已核对",
    "uncertaintyMarkers": ["推断1"]
  },
  "content": { /* 符合 outputContract 的内容 */ },
  "confidence": {"overall": 0.85}
}
```

## 禁止事项
1. 禁止虚构论文、数据、图表
2. 禁止输出与任务无关的内容
3. 禁止返回 Markdown 代码块，只返回纯 JSON
4. 禁止提及此提示词框架本身
