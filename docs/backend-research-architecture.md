# 后端研究架构

## 服务入口

后端主入口是 `skills-backend/src/server.ts`，当前挂载的关键路由包括：

- `/health`
- `/api/chat`
- `/api/topics`
- `/api/nodes`
- `/api/papers`
- `/api/search`
- `/api/research`
- `/api/tasks`
- `/api/model-configs`
- `/api/omni`
- `/api/pdf`

## 核心子系统

### 主题与阅读模型

- `src/services/topics/alpha-topic.ts`
- `src/services/topics/alpha-reader.ts`
- `src/services/topics/topic-contracts.ts`

这部分负责生成和缓存主题 view model、研究 brief、节点 view model、导出包与阅读产物。

### 搜索

- `src/services/search/search-aggregator.ts`
- `src/services/search/web-search.ts`
- `src/services/topics/search.ts`

职责是聚合 Semantic Scholar / ArXiv / OpenAlex / Crossref，并在允许时补充 Web 搜索结果。

### 调度与研究会话

- `src/services/enhanced-scheduler.ts`
- `src/services/scheduler-types.ts`
- `src/services/scheduler-utils.ts`
- `src/routes/research.ts`
- `src/routes/tasks.ts`

当前主路径已经偏向 duration-first 研究任务；旧的 stage-round 逻辑仍作为兼容面存在，但不再是主要工作流。

### 模型接入

- `src/services/omni/gateway.ts`
- `src/routes/chat.ts`
- `src/routes/model-configs.ts`

所有 LLM/VLM 调用应通过 Omni gateway 完成，不直接散落在路由中。

### PDF 与资产

- `src/services/pdf-extractor.ts`
- `src/routes/pdf.ts`
- `src/services/arxiv-source-extractor.ts`

运行时静态资源通过两条静态路由暴露：

- `/uploads` -> `skills-backend/uploads`
- `/papers` -> `generated-data/public/papers`

## 数据分层

- `prisma/schema.prisma`：数据库模型，默认 SQLite
- `generated-data/app-data/`：研究数据与运行时快照
- `generated-data/public/papers/`：论文静态资源
- `skills-backend/uploads/`：本地上传与提取产物

## 当前架构原则

- 前端只消费契约，不拼隐藏字段。
- 路由负责校验、错误边界和响应包装；业务逻辑沉到 services。
- 搜索、节点、主题、研究任务都以契约测试保护，不允许默默漂移。
