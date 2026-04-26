# 当前收口路线

这不是空泛路线图，而是基于当前仓库状态的收口清单。

## 已经稳定的主干

- 前端 `type-check` 通过
- 前端 Vitest 主套件通过
- 任务进度契约已补齐 evidence counters
- 搜索阶段标签与阶段过滤重新对齐
- research/session、dashboard、search、task 相关关键路由测试可通过

## 当前仍应继续推进的重点

### 1. Topic chat 韧性

- 给 topic chat / omni 调用增加更清晰的错误边界
- 为模型超时、缺 key、provider 失败补 focused tests

### 2. 运行数据治理

- 继续清理 `.playwright-cli/`、`output/`、旧 `uploads` 跟踪残留
- 逐步区分“当前运行必需资产”和“历史可删产物”

### 3. 工作台与旧调度 UI 收敛

- 让研究页、任务 DTO、设置页和旧 `TaskScheduler` 不再各自维护不同任务模型
- 统一 duration-first 任务视图

### 4. 文档持续同步

- 所有页面结构、架构和运维说明只在 `docs/` 维护
- 历史蓝图只留索引，不再继续承载新规则

## 不建议现在做的事

- 在没有复现证据的情况下重写 scheduler
- 为了“看起来先进”而全面切换阶段标签或研究时窗语义
- 把运行时数据、截图、日志继续混进正式源码目录
