# RESEARCH SKILL-PACKS - 研究Agent技能包

## OVERVIEW

研究闭环的核心Agent系统：论文发现 → 内容生成 → 可视化

## WHERE TO LOOK

| Skill | 入口 | 功能 |
|-------|------|------|
| orchestrator | `orchestrator/executor.ts` | 编排paper-tracker/content-genesis/visualizer |
| paper-tracker | `paper-tracker/executor.ts` | 论文发现/筛选/准入(广纳贤文三级评审) |
| content-genesis-v2 | `content-genesis-v2/executor.ts` | 节点内容生成(总分总结构) |
| topic-visualizer | `topic-visualizer/skill.ts` | 主题可视化投影 |

## CONVENTIONS

- **广纳贤文**: 三级评审 (admitted/candidate/rejected)，最多200篇/阶段
- **LLM双轮查询**: Round1初始发现 + Round2扩搜填补
- **总分总结构**: NodeArticleFlowBlock 强制 Introduction + Synthesis + Closing
- **记忆系统**: workflow/topic-memory.json + workflow/decision-memory.json

## KEY LIMITS

| 参数 | 值 | 来源 |
|------|-----|------|
| 最大迭代 | 5 | orchestrator/executor.ts:332 |
| 候选池上限 | 200 | paper-tracker/executor.ts:214 |
| LLM评估并发 | 2 | paper-tracker/executor.ts:224 |
| PDF下载并发 | 2 | paper-tracker/executor.ts:226 |
| Arxiv超时 | 4.5s | paper-tracker/executor.ts:222 |
