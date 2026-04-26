# PROJECT KNOWLEDGE BASE - 溯知 TraceMind

**Generated**: 2026-04-22T10:30:00+08:00
**Commit**: dadab812
**Branch**: main

## OVERVIEW

溯知是一个面向严肃研究场景的AI研究工作台。覆盖「发现 → 筛选 → 证据抽取 → 节点建模 → 研究判断 → 对话追问 → 导出产物」的完整研究闭环。

**技术栈**: React + Vite (前端) | Express + Prisma + SQLite (后端) | OpenAI/Anthropic/Google (AI模型)

## STRUCTURE

```
DailyReport-main/
├── frontend/          # React + Vite 前端工作台 (端口5173)
├── skills-backend/    # Express + Prisma 后端服务 (端口3303)
├── model-runtime/     # 模型运行时与接入层
├── generated-data/    # 生成数据与静态资源
├── docker-compose.yml # Docker编排 (PostgreSQL + Redis)
└── docs/              # 文档入口 (未在仓库中，见README)
```

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 研究Agent编排 | `skills-backend/skill-packs/research/orchestrator/` | 协调paper-tracker/content-genesis/visualizer |
| 论文发现引擎 | `skills-backend/skill-packs/research/paper-tracker/` | LLM双轮查询、arxiv/openalex搜索 |
| PDF内容提取 | `skills-backend/src/services/pdf-extractor.ts` + `scripts/pdf_extract.py` | PyMuPDF图片/表格/公式提取 |
| 模型配置管理 | `skills-backend/src/services/omni/` | Omni Gateway + config-store + catalog |
| 搜索聚合 | `skills-backend/src/services/search/search-aggregator.ts` | 4源聚合: SemanticScholar/Arxiv/OpenAlex/Crossref |
| 任务调度 | `skills-backend/src/services/enhanced-scheduler.ts` | 4273行，支持时长模式(1小时~1年) |
| 内容生成Agent | `skills-backend/src/services/editorial/` | node/paper editorial agent |
| 前端路由 | `frontend/src/App.tsx` | React Router配置 |
| 前端页面 | `frontend/src/pages/` | TopicPage/NodePage/ResearchPage等 |
| 国际化 | `frontend/src/i18n/` | 8语言 + 25翻译模块 |
| 数据模型 | `skills-backend/prisma/schema.prisma` | 17个表: topics/papers/nodes/figures/formulas等 |

## CODE MAP (核心符号)

| 符号 | 类型 | 位置 | 角色 |
|------|------|------|------|
| `executeOrchestrator` | 函数 | orchestrator/executor.ts:321 | 编排器主入口 |
| `PaperTrackerSkill` | Skill | paper-tracker/skill.ts | 论文追踪skill定义 |
| `OmniGateway` | 类 | omni/gateway.ts | 多模态模型网关 |
| `EnhancedScheduler` | 类 | enhanced-scheduler.ts | 时长研究任务调度 |
| `PDFExtractor` | 类 | pdf-extractor.ts:567 | PDF提取封装 |
| `SearchAggregator` | 类 | search-aggregator.ts | 搜索源聚合 |
| `I18nProvider` | 组件 | frontend/src/i18n/useI18n.tsx:103 | 国际化Context |
| `ResearchWorld` | 类型 | research-world.ts | 研究状态模型 |

## CONVENTIONS

- **TypeScript严格模式**: 所有新代码必须通过 `tsc --noEmit`
- **Prisma迁移**: 数据库变更必须通过 `prisma migrate dev`
- **i18n**: 所有UI文案使用 `useI18n().t(key)` 获取
- **API路由**: `/api/*` 前缀，Express路由文件在 `src/routes/`
- **Agent编排**: 遵循 Skill-Pack 模式 (`skill-packs/research/*/skill.ts`)
- **内容生成**: 遵循 NodeArticleFlowBlock 结构 (Introduction → PaperAnalyses → Synthesis → Closing)

## ANTI-PATTERNS (本项目)

- **API Key硬编码**: 绝不允许。必须通过 `model_configs` 表或前端设置页面配置
- **同步长时间任务**: 一周~一年的研究任务必须使用持久化队列(BullMQ)
- **直接调用模型SDK**: 必须通过 OmniGateway 统一调用
- **绕过搜索聚合**: 论文搜索必须通过 SearchAggregator 获取去重和评分
- **PDF提取降级**: 图片/表格/公式提取失败必须有重试或替代方案

## UNIQUE STYLES

- **研究时长模式**: EnhancedScheduler 支持 `duration` 模式 (1小时~365天)
- **广纳贤文策略**: 论文准入三级评审 (admitted/candidate/rejected)
- **总分总生成**: NodeArticleFlowBlock 强制 Introduction + Synthesis + Closing
- **双语内容**: 支持中英双语显示 (BilingualProvider + BilingualText)
- **A4布局**: 前端内容页 `max-width: min(210mm, 100%)`

## COMMANDS

```bash
# 前端开发
cd frontend && npm install && npm run dev    # 启动前端 (localhost:5173)

# 后端开发
cd skills-backend && npm install && npm run dev  # 启动后端 (localhost:3303)
cd skills-backend && npm run db:migrate      # 数据库迁移
cd skills-backend && npm run db:studio       # Prisma Studio

# Docker完整环境
docker-compose up                            # 启动 PG + Redis + Backend + Frontend

# 测试
cd frontend && npm run test                  # Vitest单元测试
cd frontend && npm run test:e2e              # Playwright E2E测试
cd skills-backend && npm run test            # 后端测试

# 研究任务
cd skills-backend && npm run scheduler:start  # 启动研究调度器
cd skills-backend && npm run topic:generate   # 生成主题内容
```

## NOTES

- **模型配置优先**: Kimi-K2.5 等新模型通过 `/api/model-configs` API配置，不修改 .env
- **EnhancedScheduler已成熟**: 4273行代码，优先扩展而非重写
- **PDF提取精度**: 公式置信度0.74，图片0.92(有标题)/0.55(无标题)，可考虑Nougat/Marker增强
- **任务队列缺失**: 当前无持久化队列，长时间研究需引入 BullMQ
- **网页搜索缺失**: 当前仅学术数据库API，无通用网页搜索
- **Redis已配置**: docker-compose.yml 中有 Redis，可直接使用