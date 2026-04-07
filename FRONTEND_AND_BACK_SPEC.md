# 溯知集前后端联合规范

版本：`2026-03-31`

本规范以用户最新要求为唯一基准，覆盖仓库内所有旧版前端草图、回归方案与临时占位实现。若历史实现、旧文案、旧页面结构与本规范冲突，一律以本文件为准。

## 1. 总原则

1. 主题页保留时间线、分支和 stage 作为研究组织逻辑，但不再把详情阅读暴露成“三层摘要”产品结构。
2. 桌面端右侧助手采用独立浮层 drawer，不再作为挤压主画布的第三栏。
3. 节点页与论文页统一为纯文章阅读面，强调连续叙事，减少盒子感和分界感。
4. 除封面图外，所有主题内容、节点内容、卡片文案、阶段文案、主题总结、详情页正文、图表公式解释都以后端 LLM/VLM 生成结果为准，前端不再拼正式兜底文案。
5. 中文是默认表达语言，只保留必要英文锚点，例如论文标题、方法名、模型名、数据集名和少量固定术语；不允许术语墙。
6. 搜索必须是后端统一检索，不允许前端本地过滤冒充搜索。
7. 视觉主基调是白色和近白色；除分支颜色和强调色外，其他颜色全部回到白色色调体系。
8. 若用户新要求与本规范冲突，以用户最新要求为准，并同步修改本文件。

## 2. 视觉语言

### 2.1 配色

- 页面、卡片、抽屉、输入区、搜索层、设置面板全部使用白色或近白色底。
- 不再使用大面积暖黄、米黄、浅棕底色塑造“学术感”。
- 分支色只用于 DAG 连线、路径标记、分支标签与节点来源识别。
- 强调色默认使用 Amber，只用于选中、焦点、轻量高亮与关键操作，不得成为大面积铺底。

### 2.2 密度

- 主题页卡片密度显著提高，节点卡尺寸约为此前的一半。
- 详情页改成长文流，正文之间只用留白和细线建立节奏，不做模块墙。
- 搜索和右侧工作台优先使用纵向空间承载结果、上下文和输入，不出现大面积说明空白。

### 2.3 字体与排版

- 大标题优先使用带书卷感的中文标题字体。
- 正文采用清楚、克制的中文阅读排版，重视连续阅读体验。
- 长文解释优先“顺着讲清楚”，而不是通过大量信息卡切割理解路径。

## 3. 首页

### 3.1 定位

- 首页是正式产品入口，不是 Alpha-only landing，也不是临时回归页。
- 首页必须直接体现“主题主线 + 节点文章 + 论文深读 + 证据锚点 + 右侧工作台”的完整产品面。
- 首页入口以左侧侧边栏为主，不再在首页 hero 区重复铺满创建、搜索、设置等大按钮。

### 3.2 结构

- 左侧保留极窄全局导航。
- 主区优先展示：
  - 产品主标题与连续导语
  - 主题列表
- 创建主题、全局搜索、研究编排、设置与提示词中心统一收进左侧侧边栏。
- “工作原则”区改为单一连续中文说明，不再切成四张卡。
- 首页主题列表采用居中、无边框、弱 hover 的连续列表，不做厚重白卡。

### 3.3 主题卡

- 首页主题卡与主题页节点卡采用同一套白色极简视觉语言。
- 首页主题卡强调主题 thesis、时间、状态和进入入口。
- 首页主题卡不承担长文解释，只负责把用户带到主题工作台。

## 4. 主题页

### 4.1 整体布局

- 左侧只保留极窄 app chrome，不再保留主题级信息面板。
- 原左侧面板中的必要动作迁移到全局左侧栏的 topic tools。
- 中间：高密度时间线 / DAG 主画布。
- 右侧：独立浮层工作台，不参与主画布排版。

### 4.2 主题摘要信息

- 主题标题、导语、状态、语言与统计统一收进主题页顶部正文区。
- 不再保留独立的主题左面板。
- stage 导航改成时间线左侧的轻量 date rail，不再把页面切成“左信息栏 + 中图”的双产品结构。

### 4.3 主题主画布

- 主题主画布采用高密度多分支 DAG 布局，参考用户给定的手绘树状/地铁式分支结构。
- `Y` 轴按 stage 排布，`X` 轴按问题推进和分支展开排布。
- 支持 merge node。
- 主画布不能被右侧助手打开后重新挤压或重排。

### 4.4 时间标记

- 不再只显示 `Stage 1 / Stage 2 / Stage 3`。
- 每个阶段必须突出 `MM.DD` 或完整具体日期，年份只做弱提示。
- 日期下方直接显示阶段名称。
- 阶段名称以后端 skill/LLM 生成结果为准，命名应具有研究判断力和轻微叙事感，不得退化成机械编号。
- 时间由该阶段代表论文时间与关键节点时间聚合生成。
- 若阶段英文名只是 `Stage N` 之类的机械占位，前端应自动隐藏，不作为正式展示内容。

### 4.5 节点卡

每张节点卡必须满足：

- 横向卡片，内部保留方图配图
- 主图区域为 `120-160px` 方形
- 整卡整体为横向阅读块，适配多节点同屏排布
- 整卡 clickable
- 保留中文名与英文名
- 仅保留 2-3 行导航型叙事，不承载正文型长文
- 支持多分支、多卡、交叉和汇流并存

节点卡文案职责固定为：

- 说明这一跳为什么成立
- 说明这一节点在解决什么
- 说明应该点进去看什么

时间线与分支要求：

- 主线始终使用单一、高对比、较粗的时间线颜色。
- 分支线使用不同颜色区分，最多支持 `10` 个分支。
- 多节点场景下优先保证时间线和分支关系可读，不允许因为卡片放大而遮挡主线。

### 4.6 主题末尾总结

- 主题页末尾不是统计卡堆砌，而是一段连续总结。
- 总结必须说明：
  - 主线如何推进
  - 分支如何分化与汇流
  - 目前最稳固的证据是什么
  - 仍悬而未决的问题是什么

## 5. 节点页与论文页

### 5.1 共通目标

- 节点页和论文页都必须像一篇完整文章，而不是多个分块卡片。
- 不保留左侧信息列、论文分工卡、审稿提示卡等实体侧栏。
- 不保留旧版 `Layer 1 / Layer 2 / Layer 3` 结构。

### 5.2 页面结构

详情页统一改为连续文章流，顺序为：

1. 标题
2. 导语
3. 正文
4. 跨论文展开
5. 图 / 表 / 公式穿插
6. 审稿式批评
7. 收束

前端按 `article.flow` 顺序渲染，不再把内容拆成若干 section 卡。

### 5.3 节点页

- 节点页是多论文聚合文章，不是“主论文 + 其他论文一两句补充”。
- 若节点关联多篇论文，正文必须明确写清：
  - 每篇论文解决的问题
  - 每篇论文在节点中的角色
  - 彼此如何推进、替代或分歧
  - 哪些证据支撑节点成立
  - 节点级仍未解决的问题

硬性验收：

- 读者看完节点页后，能复述“这个节点在研究什么、有哪些关键论文、它们如何推进、哪里还有问题”。
- 不能出现“读完还必须回原文拼主线”的情况。

### 5.4 论文页

- 论文页是单篇深读文章。
- 图、表、公式必须尽可能就近放进正文，而不是在底部堆一排证据块。
- 图表公式解释必须回答：
  - 它证明了什么
  - 它支撑了哪一段判断
  - 它的限制是什么

## 6. 右侧工作台

### 6.1 结构

- 工作台是独立 overlay drawer。
- 在 `1440-1719` 宽度下默认收起为右下角浮动入口按钮。
- 在 `>=1720` 宽度下默认展开，但仍然是浮层，不挤压主画布。
- 移动端与窄屏可以使用遮罩；桌面端默认不使用拦截式全屏遮罩，保证主题 DAG 和文章主栏在工作台展开时仍可直接交互。
- 支持 ESC 关闭和开关状态记忆。

### 6.2 主 tab

固定为：

- `Assistant`
- `Similar`
- `Resources`

约束：

- `History` 只做 header action
- `Notes` 删除
- `Evidence` 不做独立 tab

### 6.3 Assistant

- Assistant 的逻辑应接近阅读器附属助手，而不是通用工具面板。
- 空态应优先呈现一条简短助手消息，再给 starter prompts 与上下文建议，不得堆成大面积教学卡墙。
- 当前上下文 pills、starter prompt 和推荐追问必须保留，但不能堆成理解成本过高的说明墙。
- Composer 固定到底部，采用 alphaXiv 风格控制面：
  - 检索开关
  - 推理开关
  - 风格切换
  - 上下文入口
  - 发送按钮
- 长回答不能把 composer 顶出视口。

### 6.4 Similar

- Similar 是真正高密度相似检索列表。
- 每条结果支持：
  - 打开
  - 加入上下文
  - 继续追问

### 6.5 Resources

- Resources 负责上下文篮、证据检查器和当前选中节点/论文的紧凑资源卡。
- 不允许退化成说明性面板。

### 6.6 状态模型

必须完整支持：

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

失败时必须保留：

- shell
- tabs
- 草稿
- context pills
- history

## 7. 搜索

### 7.1 接口

统一后端接口：

- `GET /api/search`

参数：

- `q`
- `scope = global | topic`
- `topicId?`
- `types = topic,node,paper,section,figure,table,formula`
- `limit`

### 7.2 排序

排序优先级固定为：

1. exact / prefix / title match
2. subtitle / summary
3. tags
4. evidence excerpt
5. 同分按 `node > paper > section|figure|table|formula > topic`
6. 全局搜索按最近时间优先

### 7.3 前端行为

- `Cmd/Ctrl + K` 打开全局搜索。
- 全局搜索必须支持：
  - 类型筛选
  - 主题筛选
  - 最近搜索
  - 命中字段标签
  - 结果快捷动作
- 搜索空态不得使用大面积虚线说明块，只保留紧凑提示、最近搜索或快捷入口。
- 主题工作台内的 `Similar` 与全局搜索共用同一后端接口，仅切换 `scope`。
- 点击结果必须尽量保留当前 artifact locus；能定点跳转就不打断阅读链路。

## 8. ViewModel 与接口契约

### 8.1 Topic

`GET /api/topics/:id/view-model` 必须返回：

- `summaryPanel`
- `timeline.stages[].yearLabel`
- `timeline.stages[].timeLabel`
- `timeline.stages[].stageThesis`
- `graph.nodes[].parentNodeIds`
- `graph.nodes[].branchPathId`
- `graph.nodes[].timeLabel`
- `graph.nodes[].layoutHint`
- `graph.nodes[].coverAsset`
- `graph.nodes[].cardEditorial`
- `generationState`

### 8.2 Node / Paper

`GET /api/nodes/:id/view-model` 与 `GET /api/papers/:id/view-model` 必须返回：

- `article.periodLabel`
- `article.timeRangeLabel`
- `article.flow`

`flow` 允许的 block 类型：

- `text`
- `paper-break`
- `comparison`
- `figure`
- `table`
- `formula`
- `critique`
- `closing`

### 8.3 Evidence

`GET /api/evidence/:anchorId` 必须补足：

- `thumbnailPath?`
- `importance`
- `placementHint`
- `whyItMatters`

### 8.4 Chat / Omni

`POST /api/topics/:id/chat` 与 omni 需要支持以下上下文来源：

- graph node
- stage
- inline figure / table / formula
- selected paper
- comparison block
- selected evidence

## 9. 后端生成链路与提示词

### 9.1 母版风格

- 保留旧版 `content-genesis-v2` 的中文“研究编年史编辑”风格作为母版。
- 其他语言提示词必须从中文母版映射，不允许各语言自行漂移。

### 9.2 正式多 pass

后端 skill 默认拆成以下 pass：

- `topic-hero-pass`
- `stage-timeline-pass`
- `node-card-pass`
- `topic-closing-pass`
- `node-article-flow-pass`
- `paper-article-flow-pass`
- `cross-paper-pass`
- `evidence-explanation-pass`
- `reviewer-pass`
- `visual-brief-pass`

### 9.3 多论文节点生成

节点生成必须采用多次 LLM/VLM 调用的聚合链路：

1. `paper-pass`
   - 对节点内每篇论文分别生成高密度解读
2. `cross-paper-pass`
   - 提取共同问题、推进关系、替代关系和分歧
3. `node-synthesis-pass`
   - 合成连续节点文章
4. `reviewer-pass`
   - 生成严厉审稿式批评

### 9.4 VLM 责任

- 选出真正关键的 figure / table / formula
- 输出正文可直接插入的 explanation
- 给出 `whyItMatters`
- 给出 `placementHint`
- 给出 importance 排序

### 9.5 生成约束

- 前端不得伪造正式主题文案和节点正文。
- 若后端生成缺失，前端只能显示 skeleton、loading 或 regenerate 状态，不得用前端拼出的长文替代正式内容。

## 10. 测试与验收

### 10.1 前端视觉与交互

- 主题页 DAG 卡片密度成立，卡片尺寸明显缩小，整卡可点。
- 阶段时间标签醒目、明确。
- 右侧助手以浮层打开与关闭，主画布宽度不变化。
- 首页“工作原则”改为单一长板块。
- 搜索空态无大面积浪费空间。
- 节点页与论文页为纯文章流，无左侧信息卡列。

### 10.2 内容

- 多论文节点页必须讲清每篇论文的角色、推进关系、证据和未解决问题。
- 图表公式解释必须说明其论证作用，而不是只描述外观。
- 中文正文可读、判断清楚、少废话。

### 10.3 工程

- `frontend npm run type-check`
- `frontend npm run build`
- `frontend npm run test:e2e`
- `skills-backend npm run type-check`
- `skills-backend npm run build`
- `skills-backend npm test`

### 10.4 Playwright 场景

- `1440 / 1728 / 1920` 三档宽度下主题页不遮挡、不挤压
- 右侧助手浮层开关不改变主画布宽度
- 多分支 DAG 下卡片布局稳定
- 节点文章页与论文文章页均为连续长文
- 搜索结果支持快捷动作进入工作台
