# Origin Audit Rules

- 源头标准是 `earliest-representative`，不是“绝对最早相关论文”。
- 每个主题都必须记录：
  `originPaperId`
  `originConfirmedAt`
  `originConfirmationMode`
  `originQuestionDefinition`
  `originWhyThisCounts`
  `earlierRejectedCandidates`
- 审计必须两轮完成：
  1. 按时间核对源头前后的更早候选。
  2. 按主线问题定义判断这些更早论文是主线源头，还是相关、预备、旁支、子问题工作。
- 如果源头审计未通过，skill 不允许继续写该主题下一篇论文。
- 被排除的更早候选必须写明排除理由，不能只记录标题。
