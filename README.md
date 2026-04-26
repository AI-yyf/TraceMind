# 溯知 TraceMind

溯知是一个面向严肃研究工作的 AI 研究工作台。它把「发现问题、检索论文、筛选证据、建模研究节点、形成判断、追问对话、导出成果」放进同一个可追溯的工作流，帮助研究者从信息洪流中沉淀可复用的知识结构。

> Status: public release baseline. The repository has been cleaned for open-source use: local agent notes, visual-debug screenshots, Playwright result dumps, duplicate generated frontend assets, and legacy planning drafts are excluded from Git.

## 解决什么问题

研究工作经常卡在三个地方：

- 信息源分散：arXiv、OpenAlex、Semantic Scholar、Crossref、PDF、个人笔记互相割裂。
- 证据不可追踪：结论写出来了，但很难回到论文、图表、公式和推理路径。
- AI 只会回答单点问题：缺少长期主题记忆、研究阶段、节点关系和可审计的输出结构。

溯知的目标不是替代研究者，而是把 AI 变成一个可以持续维护研究现场的协作层：它负责搜集、聚合、重组和提醒不确定性；研究者负责判断、取舍和最终表述。

## 核心能力

- 主题工作台：围绕一个研究主题组织论文、节点、阅读路径、会话上下文和阶段性判断。
- 多源论文发现：聚合 arXiv、OpenAlex、Crossref、Semantic Scholar 等学术来源，并进行去重、排序和候选分层。
- PDF 与证据抽取：从 PDF 中抽取文本、图片、表格、公式和可引用片段，支持节点文章写作。
- 研究节点建模：把论文和证据组织成问题、方法、机制、局限、趋势等节点，而不是扁平收藏夹。
- Omni 模型网关：统一管理 OpenAI compatible、Anthropic、Google Gemini、BigModel/GLM 等模型配置。
- Prompt Studio：维护系统提示词、外部 Agent 任务包和结构化输出契约。
- 八语言界面：前端 i18n 覆盖中文、英语、日语、韩语、德语、法语、西班牙语、俄语。

## 快速开始

要求：

- Node.js 18+
- npm 9+
- SQLite 本地开发，或 Docker Compose 中的 PostgreSQL + Redis

启动后端：

```bash
cd skills-backend
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

默认地址：

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3303/health`

Docker 方式：

```bash
docker compose up --build
```

## 项目结构

```text
TraceMind/
├── frontend/          React + Vite research workbench
├── skills-backend/    Express + Prisma research API and orchestration
├── model-runtime/     model connector runtime experiments
├── generated-data/    curated demo/runtime data used by the app
├── docs/              public documentation
└── docker-compose.yml local production-like stack
```

## 文档

- [文档总览](docs/README.md)
- [快速上手](docs/getting-started.md)
- [系统架构](docs/architecture.md)
- [后端研究架构](docs/backend-research-architecture.md)
- [开发与运维](docs/developer-operations.md)
- [模型配置](docs/model-config-migration.md)
- [路线图](docs/roadmap.md)
- [开源参考](docs/open-source-references.md)

八语言项目介绍：

- [中文](docs/i18n/README.zh-CN.md)
- [English](docs/i18n/README.en-US.md)
- [日本語](docs/i18n/README.ja-JP.md)
- [한국어](docs/i18n/README.ko-KR.md)
- [Deutsch](docs/i18n/README.de-DE.md)
- [Français](docs/i18n/README.fr-FR.md)
- [Español](docs/i18n/README.es-ES.md)
- [Русский](docs/i18n/README.ru-RU.md)

## 开源参考

溯知站在成熟开源生态之上构建：React、Vite、Express、Prisma、SQLite/PostgreSQL、Redis、Playwright、Vitest、Tailwind CSS、Zod、PyMuPDF，以及 arXiv、OpenAlex、Crossref、Semantic Scholar、Zotero 等开放学术接口和数据生态。完整说明见 [Open Source References](docs/open-source-references.md)。

## 许可证

本项目以 MIT License 开源。见 [LICENSE](LICENSE)。
