# Skill Runtime Rules

- `skill` 只负责内容获取、问题追踪、候选筛选、分支演化与正式长文填充；不负责主题启用、归档、恢复、排序或页面布局。
- 主题治理由网页 UI 完成；`skill` 的唯一主题输入是活跃主题配置。
- UI 框架已经固定在代码中；`skill` 不得重设首页、主题页、论文页、研究视图与主题管理页的结构。
- 每次 `skill run` 只推进 1 篇正式长文，不能批量生成多篇浅内容。
- 固定流程：
  1. 读取规则文档、活跃主题配置、能力库与 `topic-memory.json`
  2. 检查源头审计是否通过
  3. 读取上一论文的 `problemsOut` 与历史问题节点
  4. 以 `Problem -> Capability -> Candidate -> Publication` 生成 direct / transfer candidates
  5. 更新问题树、分支树、推荐队列与决策日志
  6. 只选出 1 篇论文进入正式深写
- 未深写完成的论文只能保持 `seeded` 或 `candidate`，不能进入正式主时间线。
- 工作流脚本刷新元数据、引用和封面时，必须保留既有源头审计、问题树和决策日志，不得覆盖。
- 自动化续写时必须输出 `openingStandfirst`、`sections[]`、`evidence[]`、`closingHandoff`、`problemsOut`。
- `evidence` 必须按章节插入，且只支持 `figure | table | formula` 三类证据块。
- 行内数学符号与块级公式都必须以 TeX 形式写入内容数据。
