# Skill 运行规则

## 职责边界

### Skill 负责
- ✅ 读取当前活跃主题配置
- ✅ 对每个活跃主题进行问题追踪
- ✅ 生成 direct / transfer candidates
- ✅ 维护问题树、分支树、推荐队列、决策日志
- ✅ 每次只推进 1 篇正式长文内容
- ✅ 输出标准化的论文内容结构

### Skill 禁止
- ❌ 创建主题
- ❌ 删除主题
- ❌ 修改网页布局
- ❌ 决定导航结构
- ❌ 管理主题切换
- ❌ 直接操作 UI 状态

## 运行流程

### 阶段 1: 初始化
```
1. 读取活跃主题配置 (active-topics.json)
2. 对每个活跃主题：
   - 读取主题记忆 (topic-memory.json)
   - 读取能力库 (capability-library.json)
   - 读取已发布内容
```

### 阶段 2: 问题推导
```
1. 从现有 problemNodes 找出未解决问题
2. 检查已发布论文的 closingHandoff
3. 识别 problemsOut 中尚未处理的问题
4. 创建新的 problemNodes（如需要）
```

### 阶段 3: Candidate 生成

#### Direct Candidates
```
条件：
- 论文属于同一主题领域
- 满足 problemConstraints
- 支持 requiredCapabilities
- 在 bootstrapWindow 时间范围内

评估维度：
- 时间 proximity
- 方法契合度
- 实验充分性
- 引用影响力
```

#### Transfer Candidates
```
条件：
- 来自其他主题或领域
- 满足 potentialTransferDirections
- 提供新的 capability 视角
- 有可迁移的方法论

评估维度：
- 跨领域适配性
- 假设合理性
- 失败模式可控性
- 创新价值
```

### 阶段 4: 评估与筛选
```
计算 selectionScore：
- 问题契合度 (0-30)
- 方法创新性 (0-25)
- 实验充分性 (0-20)
- 影响力潜力 (0-15)
- 时间 proximity (0-10)

验证 requiredAssumptions
识别 expectedFailureModes
```

### 阶段 5: 内容生成

#### 选题
```
从 recommendationQueue 选择：
1. 最高 selectionScore
2. 状态为 'selected' 或 'watch'
3. 尚未正式深写
4. 只选 1 篇
```

#### 内容结构
```
openingStandfirst
  └── 研究背景导语（200-300字）

sections[]
  └── 章节 1: 问题背景
      ├── paragraphs[]: 前一阶段的问题
      └── evidence[]: 相关证据
  └── 章节 2: 方法机制
      ├── paragraphs[]: 核心方法
      └── evidence[]: 架构图、公式
  └── 章节 3: 实验验证
      ├── paragraphs[]: 实验设计
      └── evidence[]: 结果图、表格
  └── 章节 4: 讨论与代价
      └── paragraphs[]: 遗留问题

closingHandoff[]
  └── 承上启下（连接到下一篇）

problemsOut[]
  └── 未解决问题（带 constraints 和 capabilities）
```

#### 写作规范
```
1. 篇幅：2000-3000 字中文
2. 体裁：编年体长文
3. 口吻：编辑性叙事
4. 必答：
   - 前一阶段的问题
   - 本文出现的时机
   - 如何借助证据解决问题
   - 留下的新问题
5. 章节：镜像原论文结构
6. 段落：问题 → 机制 → 证据 → 代价
```

### 阶段 6: 数据持久化
```
写回文件：
1. topic-memory.json
   - 更新 problemNodes
   - 更新 branchTree
   - 更新 recommendationQueue
   - 添加 publishedPaperId

2. decision-log.json
   - 记录本次决策
   - 记录 selectionScore 计算
   - 记录假设和失败模式

3. trackerContent/
   - 输出论文正式内容
```

## 数据结构规范

### ProblemNode
```typescript
{
  id: "problem-{topicId}-{index}",
  question: "具体问题描述",
  whyItMatters: "为什么重要",
  problemConstraints: ["约束1", "约束2"],
  requiredCapabilities: ["cap-1", "cap-2"],
  directCandidates: [...],
  transferCandidates: [...],
  rejectedTransferCandidates: [...],
  resolutionStatus: "open" | "branched" | "merged" | "resolved",
  confidence: 0.85,
  createdAt: "2026-03-27T14:00:00Z",
  updatedAt: "2026-03-27T14:30:00Z"
}
```

### TransferCandidate
```typescript
{
  paperId: "1706.03762",
  whyThisCouldWork: "跨领域适配理由",
  requiredAssumptions: ["假设1", "假设2"],
  expectedFailureModes: ["失败模式1"],
  supportedCapabilityIds: ["cap-1"],
  selectionScore: 78.5,
  status: "selected" | "watch" | "branch_active" | "rejected" | "promoted",
  createdAt: "2026-03-27T14:00:00Z",
  evaluatedAt: "2026-03-27T14:30:00Z"
}
```

### DecisionLogEntry
```typescript
{
  id: "decision-{timestamp}",
  timestamp: "2026-03-27T14:30:00Z",
  topicId: "transformer-innovation",
  action: "publish_paper" | "create_branch" | "merge_branch" | "reject_candidate",
  targetPaperId: "1706.03762",
  targetProblemId: "problem-transformer-1",
  reasoning: "决策理由",
  selectionScoreBreakdown: {
    problemFit: 28,
    methodInnovation: 22,
    experimentQuality: 18,
    impactPotential: 12,
    timeProximity: 8
  },
  assumptions: ["假设1"],
  risks: ["风险1"],
  alternativesConsidered: ["alternative-1"]
}
```

## 输出格式

### 论文内容
```typescript
{
  titleZh: "中文标题",
  highlight: "一句话亮点",
  openingStandfirst: "研究背景导语",
  sections: [
    {
      id: "sec-1",
      sourceSectionTitle: "Introduction",
      editorialTitle: "引言：当...",
      paragraphs: ["段落1...", "段落2..."],
      evidence: [
        {
          id: "fig-1",
          type: "figure",
          title: "架构图",
          assetPath: "/papers/.../fig1.png",
          caption: "图1. 架构图",
          analysis: ["分析1", "分析2"],
          placement: 0
        },
        {
          id: "formula-1",
          type: "formula",
          title: "核心公式",
          latex: "\\\\theta^* = \\\\arg\\\\min_\\\\theta ...",
          caption: "公式1. 优化目标",
          analysis: ["分析1"],
          placement: 1
        }
      ]
    }
  ],
  closingHandoff: ["承上启下段落"],
  problemsOut: [
    {
      id: "prob-1",
      question: "未解问题",
      whyItMatters: "重要性",
      problemConstraints: ["约束"],
      requiredCapabilities: ["能力"],
      potentialTransferDirections: ["方向"]
    }
  ]
}
```

## 错误处理

### 可恢复错误
- 网络请求失败：重试 3 次
- 数据格式不兼容：使用默认值
- 缺少可选字段：跳过

### 致命错误
- 活跃主题配置不存在：报错退出
- 主题记忆损坏：从备份恢复
- 权限不足：报错退出

## 性能要求

- 单次运行时间 < 5 分钟
- 内存占用 < 500MB
- 同时处理主题数 <= 5
