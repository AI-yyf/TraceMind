# SKILLS-BACKEND - 后端研究服务

## OVERVIEW

Express + Prisma + SQLite 后端，包含完整的研究Agent系统

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 服务器入口 | `src/server.ts` | Express + WebSocket + 路由挂载 |
| API路由 | `src/routes/` | 17个路由模块 |
| 业务服务 | `src/services/` | 核心：omni/search/editorial/topics |
| 研究Agent | `skill-packs/research/` | orchestrator/paper-tracker/content-genesis |
| Agent引擎 | `engine/` | Skill执行框架 + 存储管理 |
| 数据库 | `prisma/schema.prisma` | 17个表 |
| 主题配置 | `topic-config/` | 各主题的查询标签和策略 |
| Python脚本 | `scripts/pdf_extract.py` | PyMuPDF PDF提取核心 |
| 共享类型 | `shared/` | model-config/research-graph/research-memory |

## CONVENTIONS

- **Skill-Pack模式**: `skill-packs/research/*/skill.ts` 定义 → `executor.ts` 执行
- **OmniGateway**: 所有LLM调用必须通过 gateway 统一
- **SearchAggregator**: 论文搜索必须聚合，支持去重评分
- **Prisma ORM**: 不使用原始SQL，通过 Prisma Client 操作

## ANTI-PATTERNS

- **API Key硬编码**: 通过 `model_configs` 表 + `secure-storage.ts`
- **同步阻塞**: 长任务必须异步 + 进度推送
- **绕过Skill-Pack**: 新研究能力必须注册为Skill
- **直接Prisma raw query**: 使用 TypeSafe 的 Prisma API
