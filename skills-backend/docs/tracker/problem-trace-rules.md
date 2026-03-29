# Problem Trace Rules

- 追踪单位不是“下一篇论文”，而是“未解决问题”。
- 下一篇论文的选择优先级仍然来自上一阶段留下的未解决问题，高于关键词匹配。
- 每个问题节点都必须先写成机制化问题，而不是只保留叙事句。
- 每个问题节点至少记录：
  `id`
  `question`
  `problemConstraints`
  `requiredCapabilities`
  `directCandidates`
  `transferCandidates`
  `rejectedTransferCandidates`
  `resolutionStatus`
  `confidence`
- `transferCandidates` 允许来自其它主题或其它问题背景，只要它们在能力原语上具有可迁移性。
- 迁移候选必须写清楚：
  `whyThisCouldWork`
  `requiredAssumptions`
  `expectedFailureModes`
- 问题分叉会在前端被显式展示为时间化问题树；未成熟候选只在阶段末尾或研究视图显示。
- 如果同一时间窗内没有足够代表性的续作，必须记录扩展时间窗及理由。
