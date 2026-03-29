# 内容生产系统架构

## 系统边界

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web UI 层                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  首页   │ │ 主题页  │ │ 论文页  │ │研究视图 │ │主题管理 │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                  │
│  职责：                                                          │
│  - 固定页面框架与导航                                            │
│  - 维护预置主题库与活跃主题配置                                  │
│  - 执行主题启用、归档、恢复、排序                                │
│  - 渲染 skill 输出的标准化内容                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 读取活跃主题配置
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Skill 核心层                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Problem -> Capability -> Candidate           │   │
│  │                         ↓                                 │   │
│  │                     Publication                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  职责：                                                          │
│  - 读取当前活跃主题集合                                          │
│  - 对每个活跃主题进行问题追踪                                    │
│  - 生成 direct / transfer candidates                             │
│  - 维护问题树、分支树、推荐队列、决策日志                        │
│  - 每次只推进 1 篇正式长文内容                                   │
│                                                                  │
│  禁止：                                                          │
│  - ❌ 不创建主题                                                 │
│  - ❌ 不删除主题                                                 │
│  - ❌ 不改网页布局                                               │
│  - ❌ 不决定导航结构                                             │
│  - ❌ 不管理主题切换                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 输出标准化内容
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据层                                      │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 预置主题库   │ │ 活跃主题配置 │ │ 能力库       │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 主题记忆 v2  │ │ 决策日志     │ │ 论文目录     │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流

```
1. 用户通过主题管理页配置活跃主题
2. Web UI 保存活跃主题配置
3. Skill 读取活跃主题配置
4. Skill 对每个活跃主题：
   - 读取主题记忆、能力库、已发布内容
   - 推导未解问题
   - 生成 candidates
   - 更新问题树、分支树、推荐队列
   - 选出 1 篇正式深写
5. Skill 输出标准化内容
6. Web UI 渲染内容到固定页面框架
```

## 主题生命周期

```
┌─────────────┐     启用      ┌─────────────┐
│  预置主题库  │ ────────────> │  活跃主题   │
│  (只读)     │               │  (skill服务) │
└─────────────┘               └─────────────┘
       ^                            │
       │                            │ 归档
       │                            ▼
       │                     ┌─────────────┐
       └──────────────────── │  归档主题   │
            恢复              │  (只读)     │
                             └─────────────┘
```

## 内容生产流程

```
┌─────────────────────────────────────────────────────────────┐
│                     单次 Skill 运行                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  输入：活跃主题配置                                          │
│                                                             │
│  1. 读取主题记忆 (topic-memory.json)                         │
│     ├── publishedMainlinePaperIds                            │
│     ├── publishedBranchPaperIds                              │
│     ├── candidatePaperIds                                    │
│     ├── problemNodes                                         │
│     ├── branchTree                                           │
│     └── recommendationQueue                                  │
│                                                             │
│  2. 推导未解问题                                             │
│     ├── 从 problemsOut 创建初始 problemNodes                 │
│     ├── 检查已发布论文的 closingHandoff                      │
│     └── 识别新产生的问题                                     │
│                                                             │
│  3. 生成 Candidates                                          │
│     ├── Direct Candidates (同领域)                           │
│     │   └── 基于 problemConstraints + requiredCapabilities   │
│     └── Transfer Candidates (跨领域)                         │
│         └── 基于 potentialTransferDirections                 │
│                                                             │
│  4. 评估与筛选                                               │
│     ├── 计算 selectionScore                                  │
│     ├── 验证 requiredAssumptions                             │
│     └── 识别 expectedFailureModes                            │
│                                                             │
│  5. 更新数据结构                                             │
│     ├── 更新 problemNodes (添加 candidates)                  │
│     ├── 更新 branchTree (识别新分支)                         │
│     └── 更新 recommendationQueue                             │
│                                                             │
│  6. 内容生成 (只选 1 篇)                                      │
│     ├── 从 recommendationQueue 选最高分                      │
│     ├── 生成正式论文内容                                     │
│     │   ├── openingStandfirst                                │
│     │   ├── sections[]                                       │
│     │   ├── evidence[] (figure/table/formula)                │
│     │   ├── closingHandoff                                   │
│     │   └── problemsOut                                      │
│     └── 更新 decisionLog                                     │
│                                                             │
│  7. 写回数据                                                 │
│     ├── 更新 topic-memory.json                               │
│     ├── 更新 decision-log.json                               │
│     └── 输出论文内容到 trackerContent                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 核心数据结构

### ProblemNode
```typescript
interface ProblemNode {
  id: string
  question: string
  whyItMatters: string
  problemConstraints: string[]
  requiredCapabilities: string[]
  directCandidates: DirectCandidate[]
  transferCandidates: TransferCandidate[]
  rejectedTransferCandidates: RejectedTransferCandidate[]
  resolutionStatus: 'open' | 'branched' | 'merged' | 'resolved'
  confidence: number
  createdAt: string
  updatedAt: string
}
```

### TransferCandidate
```typescript
interface TransferCandidate {
  paperId: string
  whyThisCouldWork: string
  requiredAssumptions: string[]
  expectedFailureModes: string[]
  supportedCapabilityIds: string[]
  selectionScore: number
  status: 'watch' | 'selected' | 'branch_active' | 'rejected' | 'promoted'
  createdAt: string
  evaluatedAt: string
}
```

### BranchNode
```typescript
interface BranchNode {
  id: string
  name: string
  description: string
  parentBranchId?: string
  problemNodeIds: string[]
  candidatePaperIds: string[]
  publishedPaperIds: string[]
  status: 'candidate' | 'branch_active' | 'promoted_to_mainline' | 'merged' | 'archived'
  createdAt: string
  mergedAt?: string
}
```

## 内容输出规范

### 论文内容结构
```typescript
interface PaperContent {
  openingStandfirst: string      // 研究背景导语
  sections: Section[]            // 章节内容
  closingHandoff: string[]       // 承上启下
  problemsOut: ProblemTrace[]    // 未解问题
}

interface Section {
  id: string
  sourceSectionTitle: string     // 原文章节标题
  editorialTitle: string         // 编辑后标题
  paragraphs: string[]           // 段落内容（2000-3000字）
  evidence: EvidenceItem[]       // 证据块
}
```

### 写作风格规范
- **篇幅**：2000-3000 字中文
- **体裁**：编年体长文，不用列表代替正文
- **口吻**：编辑性叙事，不写维护者说明
- **必答问题**：
  1. 前一阶段的问题是什么？
  2. 本文为什么在此时出现？
  3. 它如何借助图、表、公式解决问题？
  4. 它留下了哪些新的未解问题？
- **章节顺序**：镜像原论文主结构
- **段落逻辑**：问题 → 机制 → 证据 → 代价/裂缝

### 证据规范

**公式**：
- 全部用 MathJax 可渲染的 TeX
- 行内公式保留在正文段落
- 块级公式只用于核心机制
- 每个公式块必须有：latex, caption, analysis[]
- 一篇论文建议只保留 1-3 个核心公式块

**图片**：
- 区分 cover 和 evidence figure
- 正文图只选真正推进论点的图
- 每张图必须有：assetPath, caption, analysis[], placement
- 图注只说明图是什么
- 分析必须回答"这张图为什么能支撑当前问题判断"

**表格**：
- 只保留能改变判断的关键表格
- 不整页复刻 benchmark
- 表格分析重点是"哪个问题被改善、代价是什么"
