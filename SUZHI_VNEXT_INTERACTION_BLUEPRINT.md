# 溯知 vNext 右侧栏交互与使用逻辑蓝图

## 1. 目标定位

溯知不是让人类去盯着 AI 干活的监工台，而是一个让人类与“持续研究中的 AI 学者”保持交流的研究系统。

核心关系应该是：

- AI 是主研究者，负责持续检索、分组、判断、修正、写作、追踪。
- 人是观察者、提议者、校准者、审美与方向的提供者。
- 人与 AI 的唯一主动交互窗口，就是右侧对话栏。
- 主题页、节点页、论文页负责展示研究结果。
- 右侧栏负责表达研究状态、接收建议、解释判断、承接追问、回写后续调整。

这意味着右侧栏不是“聊天框”，而是：

- 当前研究世界的控制面
- 人类建议进入系统的唯一入口
- AI 对自身研究进度、调整理由、未决问题的唯一解释面

## 2. 当前系统的正确方向

当前项目已经出现了三个正确的雏形：

- `ResearchSessionCard` 表示 AI 可以持续研究，而不是单轮问答。
- `ResearchWorldCard` 表示系统开始拥有跨阶段的统一研究世界状态。
- `Topic chat author context` 已经开始把研究报告、会话记忆、研究世界一起喂给对话。

但它还没有成为成熟交互系统，因为还缺三件事：

1. 用户消息还没有被稳定地区分为“交流”与“可执行建议”。
2. AI 还没有把“我接受了什么建议、准备怎么调整、何时生效”显式说清楚。
3. 右侧栏还没有形成一套跨 topic/node/paper 的统一使用逻辑。

## 3. 产品总原则

### 3.1 唯一窗口原则

所有主动协作都经过右侧栏：

- 开始研究
- 暂停研究
- 延长研究
- 提方向建议
- 提结构质疑
- 提风格要求
- 指定关注节点/论文/证据
- 追问当前判断
- 要求导出或整理笔记

别的页面不直接改内容，不做“手工编辑主题/节点/详情页”的第二入口。

### 3.2 AI 主体原则

用户不直接告诉 AI “把节点改成 X”。
用户给的是：

- 倾向
- 质疑
- 约束
- 偏好
- 关注点

AI 需要自己判断：

- 是否采纳
- 采纳到什么程度
- 应该影响哪个 scope
- 是立刻回答，还是进入后续研究周期再调整

### 3.3 结果先于过程原则

右侧栏不展示冗长中间推理，不堆日志。
它只展示最值得人类知道的四类信息：

- 当前在研究什么
- 现在准备怎么推进
- 为什么这么判断
- 接受了你哪些建议

### 3.4 页面分工原则

- Topic 页：主题概览、节点结构、总结，不承担交互负担。
- Node 页：单节点文章化展示，不承担系统控制职责。
- Paper 页：论文证据与深读，不承担系统控制职责。
- Right Sidebar：唯一研究窗口，统一存在。

## 4. 全屏布局契约

参考 alphaXiv 的正确抽象，但要适配溯知：

- 中央主画布永远是主 artifact。
- 右侧栏永远是“解释、协作、调度、笔记、邻近工作流”的地方。
- 宽屏下右栏常驻，窄屏下可收起，但必须保留用户当前页面位置。

三种主场景：

### 4.1 Topic 页

中央主画布：

- 主题简介
- 节点卡片主链
- 总结

右栏：

- 当前研究状态
- 研究世界
- 与 AI 对话
- 笔记/资源/相似项

### 4.2 Node 页

中央主画布：

- 节点文章
- 相关论文展开
- 证据与评价

右栏：

- 解释这个节点在主题主线中的角色
- 接收用户对节点边界的建议
- 继续向后端发起“围绕该节点的后续研究”

### 4.3 Paper 页

中央主画布：

- 论文深读内容
- 图表公式证据

右栏：

- 解释这篇论文在 node/topic 中的作用
- 接收用户对证据解释、论文定位、图像代表性的建议

## 5. 右侧栏的成熟结构

右侧栏应该固定为三层：

### 5.1 顶层：Assistant Header

职责：

- 模型入口
- New Chat
- History
- Collapse

要求：

- 不混入全局导航
- 永远保持轻
- 不承载研究详情

### 5.2 中层：Scroll Body

这是右栏真正的工作区，应按如下顺序组织：

1. `Research Session Card`
2. `Guidance Ledger Card`
3. `Research World Card`
4. `Research Pulse Card`
5. `Conversation Thread` 或 `Assistant Empty State`

说明：

- `Research Session Card` 回答“AI 现在是不是在工作”。
- `Guidance Ledger Card` 回答“你刚才的建议是否被接纳、准备怎么处理”。
- `Research World Card` 回答“系统现在怎么看这个主题”。
- `Research Pulse Card` 回答“最近一轮研究有什么推进”。
- `Conversation Thread` 才是交流内容。

### 5.3 底层：Composer Dock

职责：

- 输入问题或建议
- 控制 Search / Thinking / Style
- 显示上下文 pills

原则：

- 永远固定在底部
- 不因长对话被顶走
- 不隐藏关键开关

## 6. 人类消息的成熟分类

右侧栏里的用户消息，不应该只被当作“普通 chat”。
系统必须先做分类。

建议分为六类：

### 6.1 Ask

用户想问：

- 这个节点为什么这样分
- 这篇论文为什么进主线
- 现在最值得读什么

系统动作：

- 直接回答
- 引用当前 artifact 与 research world
- 不一定写入长期指导

### 6.2 Suggest

用户提出柔性建议：

- 我更希望你把重点放在机制而不是性能
- 我希望阶段命名更克制
- 这条线索值得继续深挖

系统动作：

- 提取为 directive
- 写入 guidance ledger
- 在下轮研究中生效

### 6.3 Challenge

用户提出质疑：

- 这个节点分组不对
- 这个阶段命名太空泛
- 这篇论文其实不该成为代表

系统动作：

- 作为高优先级 critique directive
- 要求 AI 回答当前判断
- 同时放入后续研究 agenda

### 6.4 Focus

用户给范围聚焦：

- 接下来一小时只研究这个节点
- 重点关注图像世界模型这条线
- 先别扩主题，先把当前节点做扎实

系统动作：

- 影响 orchestration planner
- 改写接下来若干研究周期的检索与生成优先级

### 6.5 Style

用户给表达要求：

- 写得更像文章，不要流水账
- 评价更尖锐
- 阶段标题更有风格

系统动作：

- 更新写作 profile
- 对 topic/node/paper 生成模板生效
- 不直接改事实判断

### 6.6 Command

用户给明确系统动作：

- 开始研究 4 小时
- 停止本轮
- 导出研究档案

系统动作：

- 直接调用对应系统动作
- 在线程里回一条 receipt

## 7. 建议如何被系统吸收

这是整个交互闭环最关键的一层。

## 7.1 新增后端概念：Guidance Ledger

建议新增一套独立于 chat transcript 的指导账本：

```ts
interface TopicGuidanceDirective {
  id: string
  topicId: string
  sourceMessageId: string
  scopeType: 'topic' | 'stage' | 'node' | 'paper' | 'evidence'
  scopeId: string | null
  directiveType: 'suggest' | 'challenge' | 'focus' | 'style' | 'constraint' | 'command'
  instruction: string
  rationale: string
  strength: 'soft' | 'strong'
  status: 'accepted' | 'partial' | 'deferred' | 'rejected' | 'superseded' | 'consumed'
  appliesToRuns: 'next-run' | 'until-cleared' | 'current-session'
  createdAt: string
  updatedAt: string
}
```

它的作用不是记录“聊过什么”，而是记录：

- 什么建议还在生效
- 它影响哪个范围
- AI 是否采纳
- 是否已经落实到后续研究

## 7.2 消息进入系统后的流程

每条用户消息进入后应走 5 步：

1. 识别消息类型
2. 若包含建议，抽取 directive
3. 把 directive 写入 `guidance ledger`
4. 立即生成一条简短 receipt
5. 在后续 research cycle 中读取并应用

## 7.3 receipt 的回答范式

AI 不需要谄媚，也不该像审批系统。
回复格式应很克制：

- 你提出了什么
- 我准备怎么处理
- 何时生效
- 当前仍保留什么判断

示例：

> 我接受你关于“阶段命名太泛”的建议。  
> 我不会直接改现有展示结果，而会在下一轮 stage re-evaluation 中优先重审第 2 阶段与第 3 阶段的命名、摘要和节点边界。  
> 当前我仍保留它们属于同一主线的判断，但会重点检查是否应该拆分成两条不同的方法支路。

## 8. AI 在右栏里的成熟话语风格

AI 不能像客服，也不能像工具调用器。
它应该像一位正在编书的研究者。

回答结构固定为三段：

1. 直接结论
2. 放回主题/节点/论文主线
3. 给出边界、疑点或下一步

禁止：

- 空泛鼓励
- 机械重复上下文
- 暴露内部链式推理
- 把“收到建议”说成流水账

## 9. 场景矩阵

下面是必须覆盖的核心场景。

### 9.1 主题刚创建，尚未开始研究

用户心智：

- 我想知道怎么开始
- 我想先告诉你研究偏好

右栏应该：

- 展示空状态
- 给出三类入口：开始研究 / 设定风格 / 指定重点

系统动作：

- 可先记录 guidance，再启动研究

### 9.2 研究正在运行中

用户心智：

- 我不想打断你，但我想给建议

右栏应该：

- 明确显示“建议会在本轮后续或下一轮生效”
- 不把用户逼成暂停或重开

系统动作：

- 记录 directive
- 标记生效时机
- 在线程里回一条简短 receipt

### 9.3 用户指出节点分组不合理

右栏应该：

- 把它识别为 `challenge`
- 回答当前为何如此分组
- 同时承诺进入 `stabilize-node` 或 `re-evaluate-stage`

后端动作：

- 写入 critique directive
- 抬升该节点相关 agenda priority

### 9.4 用户对阶段命名不满意

右栏应该：

- 不立刻改页面
- 先解释现命名逻辑
- 然后表示会在后续 stage naming pass 里重审

### 9.5 用户要求风格更有文章感

右栏应该：

- 回答“这会影响后续总结、节点文稿、详情页风格”
- 不影响已确认的事实判断

后端动作：

- 更新 style guidance profile

### 9.6 用户想聚焦一个节点或一篇论文

右栏应该：

- 支持当前页面 / 当前选中 artifact 自动进入上下文
- 允许一句话：“接下来重点把这个节点做扎实”

后端动作：

- planner 调整 subject focus
- 提高该 scope 的检索、比较、证据选择优先级

### 9.7 用户提出事实性追问

例如：

- 为什么这篇论文被放进这个节点
- 这两篇论文关系是什么

系统动作：

- 直接回答
- 绑定 citation
- 若用户追问里隐含质疑，再转入 challenge

### 9.8 用户发现 AI 误判

这是最高优先级人类输入。

右栏应该：

- 明确承认这是 correction candidate
- 区分“我现在同意”和“我会重审”

后端动作：

- 写入 correction directive
- 在后续 run 中优先验证

### 9.9 用户只想旁观，不频繁输入

右栏应该：

- 自动回写关键回执
- 只在重要事件说话
- 不刷屏

建议自动回写的事件：

- 本轮研究开始
- 本轮研究完成
- 采纳了新的高优先级建议
- 发现重大结构变化
- 遇到关键未决问题

### 9.10 用户在 node/paper 页中高亮或选中证据

右栏应该：

- 把高亮转成 context pill
- 允许问：“这张图到底支持了什么判断？”

系统动作：

- 回答当前问题
- 如用户要求“以后更重视这类图”，则抽成 style/focus directive

### 9.11 用户想导出

右栏应该：

- 导出研究档案
- 导出重点摘编
- 导出笔记

导出不只是下载，而是“把 AI 当前研究世界冻结成一个可读成果”。

### 9.12 用户要中止或延长研究

右栏应该：

- 中止时返回本轮收束说明
- 延长时明确“延长的是当前主线，不是从头重来”

## 10. 右栏状态机

建议把状态机分成两层。

### 10.1 系统状态

- `idle`
- `researching`
- `applying-guidance`
- `waiting-next-cycle`
- `completed`
- `paused`
- `interrupted`

### 10.2 会话状态

- `empty`
- `drafting`
- `submitting`
- `thinking`
- `retrieving`
- `answer-ready`
- `partial-grounding`
- `auth-required`
- `rate-limited`
- `hard-error`

其中最重要的是增加一个可见语义：

- `applying-guidance`

因为用户给建议后，如果系统没有显式反馈“正在吸收”，就会觉得建议像丢进黑洞。

## 11. 前端应如何配合

## 11.1 当前 RightSidebarShell 的正确方向

现有组件已经有这些基础：

- `AssistantHeader`
- `ResearchSessionCard`
- `ResearchWorldCard`
- `WorkbenchPulseCard`
- `ConversationThread`
- `ContextTray`
- `GroundedComposer`

这是对的。

## 11.2 下一步前端最应该加的，不是更多卡片，而是 `Guidance Ledger Card`

建议在 `ResearchSessionCard` 和 `ResearchWorldCard` 之间插入：

```tsx
<GuidanceLedgerCard
  pendingDirectives={...}
  recentlyAccepted={...}
  recentlyDeferred={...}
  onAskFollowup={...}
/>
```

它只展示三类内容：

- 刚采纳的建议
- 正在排队生效的建议
- 被推迟/部分采纳的建议

这样用户会第一次感受到：

- AI 听见了
- AI 记住了
- AI 正在按这个调整

## 11.3 Composer 的成熟收口

输入框保持自由文本，但建议补 5 个轻量快捷入口：

- `提建议`
- `质疑当前判断`
- `聚焦这个节点`
- `调整写作风格`
- `继续研究`

注意：

- 这些只是提示，不是强制流程
- 用户仍然可以直接打字

## 11.4 Thread 里的消息不应都一样重

应区分三类 assistant message：

- `research receipt`
- `guidance receipt`
- `answer`

其中 `guidance receipt` 应更短、更像系统内化回执。

## 12. 后端应如何配合

## 12.1 orchestration 读取层次

后端每轮研究前，建议按以下优先顺序读状态：

1. 当前 artifact scope
2. active guidance directives
3. research world
4. latest research report
5. session memory recall
6. generation memory / judgments

这样可以保证：

- 当前页面与当前建议优先
- 统一世界状态不被局部对话冲垮

## 12.2 研究 loop 中新增两个步骤

### Step A: Guidance compile

把最近用户消息编译为 directives。

### Step B: Adjustment receipt

在每轮 run 结束时生成：

```ts
interface RunAdjustmentReceipt {
  topicId: string
  runId: string
  acceptedDirectiveIds: string[]
  appliedDirectiveIds: string[]
  deferredDirectiveIds: string[]
  changedScopes: Array<{
    scopeType: 'topic' | 'stage' | 'node' | 'paper'
    scopeId: string
    change: string
  }>
  summary: string
}
```

然后回写到右栏线程与 session memory。

## 12.3 对话回答时的记忆层次

topic chat 应像“记得自己编撰过这个主题”。
因此回答时必须同时读：

- `research world`
- `guidance ledger`
- `recent session events`
- `recalled session events`
- `current page evidence`

缺一不可。

## 13. 成熟系统里 AI 与人的关系

成熟系统不该是：

- 人命令，AI 执行
- 或 AI 自说自话，人只能看

而应是：

- AI 自主推进
- 人可以随时提出观点
- AI 吸收、回应、调整
- 系统把这些调整稳定沉淀下来

所以真正重要的不是“有没有 chat”，而是：

- chat 能否进入系统长期结构
- 建议是否真的影响后续研究
- AI 是否能说清它为什么采纳或不采纳

## 14. 最值得落地的下一刀

如果按价值排序，下一刀建议直接做这三件：

1. 后端新增 `guidance ledger` 与 directive 抽取
2. 右栏新增 `GuidanceLedgerCard`
3. 每次用户建议后，返回 `guidance receipt`，并让 research scheduler 在下一轮显式应用

这样做完以后，右侧栏才会从“能聊天”升级到“能协作”。

## 15. 反模式

不要做这些事：

- 不要把用户建议直接等于内容编辑
- 不要把所有用户输入都当成普通问答
- 不要让建议只存在于聊天记录里
- 不要让 AI 每次像失忆一样重新回答
- 不要在右栏复制主题页正文
- 不要把右栏做成日志墙

## 16. 验收标准

当右侧栏成熟时，用户会自然感觉到：

- 我不用监督它，但我说的话会留下痕迹
- 它不是“答我一句”，而是真的会按建议继续研究
- 它记得自己已经写过什么、判断过什么、被我提醒过什么
- 它能解释当前结果，也能说明接下来怎么改
- 我只需要通过这一个窗口，就能和整套研究系统交流

---

这份蓝图对应当前代码中的直接落点：

- 前端壳层：`frontend/src/components/topic/RightSidebarShell.tsx`
- 研究状态：`frontend/src/components/topic/ResearchSessionCard.tsx`
- 研究世界：`frontend/src/components/topic/ResearchWorldCard.tsx`
- 主题对话上下文：`skills-backend/src/services/topics/alpha-topic.ts`
- 统一研究世界：`skills-backend/src/services/topics/research-world.ts`

后续真正进入实现时，应优先把“建议 -> directive -> 后续 run 生效 -> 右栏 receipt”这条链彻底做通。
