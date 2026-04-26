<p align="center">
  <img src="assets/tracemind-logo.svg" alt="TraceMind logo" width="520">
</p>

<h1 align="center">溯知 TraceMind</h1>

<p align="center">
  <strong>AI 个人研究工作台，把论文、证据、节点、判断和追问沉淀成长期可追溯的研究现场。</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-111827"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-ready-0f766e">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-8_languages-2563eb">
  <img alt="Stack" src="https://img.shields.io/badge/stack-React_%2B_Express_%2B_Prisma-f5b84b">
</p>

<p align="center">
  <a href="docs/getting-started.md">快速开始</a> ·
  <a href="docs/product-positioning.md">产品定位</a> ·
  <a href="docs/research-workflow.md">研究流程</a> ·
  <a href="docs/comparison.md">横向对比</a> ·
  <a href="docs/research-intent.md">研究初心</a> ·
  <a href="docs/README.md">完整文档</a>
</p>

---

## 为什么是 AI 个人研究工作台

今天的研究者并不缺信息。真正困难的是：论文越读越多，网页越存越多，AI 对话越聊越长，最后却很难回答三个问题：

- 我为什么相信这个判断？
- 哪些证据真正支撑它？
- 半个月后我还能不能沿着同一条线索继续推进？

溯知不是又一个「问 AI 一个问题」的聊天框，也不只是论文收藏夹。它面向个人长期研究，把资料、论文、图表、公式、引用、节点文章、模型输出和你的阶段性判断放进同一个可追溯的工作台里。

它的目标不是替你完成研究，而是让你在 AI 很强、信息很多、结论很容易被写得很漂亮的时代，仍然保有自己的判断主权。

## 30 秒理解溯知

| 如果你正在经历 | 溯知尝试提供 |
| --- | --- |
| 收藏了很多论文，但不知道哪些构成主线 | 主题、候选论文、准入判断和研究节点 |
| AI 摘要很流畅，但证据路径不清楚 | 论文、PDF、图表、公式、引用和证据片段 |
| 聊天记录里有好想法，但很快丢失 | 围绕主题的 Workbench 和长期研究记忆 |
| 想写综述、技术判断或研究备忘录 | 带证据链的节点文章、研究简报和导出产物 |
| 想自托管研究数据和模型配置 | 本地前后端、Prisma 数据层和 Omni Gateway |

## 核心能力

- **论文发现**：聚合 arXiv、OpenAlex、Crossref、Semantic Scholar 等开放学术来源，形成候选论文池。
- **证据抽取**：围绕 PDF、图表、公式、表格、引用和可解释文本片段建立证据对象。
- **研究节点**：把主题拆成问题、方法、机制、分歧、局限、趋势和关键转折，而不是只保留一串链接。
- **节点写作**：生成更接近研究备忘录的长文结构，强调 Introduction、论文分析、综合判断和收束。
- **工作台追问**：把对话放回当前主题、节点和证据上下文，让追问能够沉淀，而不是消失在聊天历史里。
- **模型治理**：通过 Omni Gateway、模型配置和 Prompt Studio 管理不同供应商、角色模型、提示词和任务包。
- **多语言体验**：界面与项目介绍覆盖中文、英语、日语、韩语、德语、法语、西班牙语、俄语八种语言。

## 一个完整研究回路

1. 创建一个 Topic，例如「端到端自动驾驶」或「具身智能任务规划」。
2. 通过搜索聚合获得候选论文，初步区分 admitted、candidate、rejected。
3. 抽取 PDF 中的文本、图表、公式、引用和关键片段。
4. 将论文和证据映射到研究节点，形成主题内的研究地图。
5. 阅读节点文章，检查每个判断背后的证据链。
6. 在 Workbench 里继续追问，让 AI 回到当前主题和证据上下文。
7. 导出节点文章、研究简报或报告素材。
8. 随着新论文和新问题进入，更新主题记忆与阶段判断。

更细的用户路径见 [研究工作流](docs/research-workflow.md)。

## 与常见工具的关系

溯知不试图替代成熟工具，而是补上「个人长期研究工作台」这一层。

| 工具 | 最擅长 | 溯知的位置 |
| --- | --- | --- |
| Zotero | 文献收集、标注、引用和参考文献管理 | 承接文献之上的研究结构、证据链和节点判断 |
| NotebookLM | 围绕给定源材料进行问答和摘要 | 把源材料问答放进长期主题、论文发现和研究节点 |
| Elicit | 系统综述中的检索、筛选和字段抽取 | 更偏个人长期研究现场，而不是单次综述任务 |
| Perplexity | 联网搜索与带来源答案 | 把一次性答案沉淀为主题记忆和可继承判断 |
| Obsidian / Notion | 笔记、知识库和个人组织 | 更强调论文证据、模型治理和研究闭环 |
| ChatGPT / Claude | 通用推理、写作和对话 | 给模型一个有档案、有证据、有边界的研究环境 |

完整分析见 [横向对比](docs/comparison.md)。

## 快速开始

要求：

- Node.js 18+
- npm 9+
- SQLite 本地开发，或 Docker Compose 中的 PostgreSQL + Redis
- Python 3.10+，用于 PDF 抽取脚本

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

## 文档地图

| 文档 | 适合你什么时候读 |
| --- | --- |
| [文档总览](docs/README.md) | 第一次进入项目，想知道从哪里开始 |
| [产品定位](docs/product-positioning.md) | 想理解溯知为什么是工作台，而不是聊天框 |
| [研究初心](docs/research-intent.md) | 想理解项目背后的研究痛点和价值选择 |
| [研究流程](docs/research-workflow.md) | 想知道从一个主题到研究产物如何闭环 |
| [设计原则](docs/design-principles.md) | 想理解证据优先、长期记忆和人类判断 |
| [横向对比](docs/comparison.md) | 正在比较 Zotero、NotebookLM、Elicit、Perplexity、通用 AI 工具 |
| [快速上手](docs/getting-started.md) | 准备安装、配置和启动项目 |
| [系统架构](docs/architecture.md) | 想理解前端、后端、模型网关和数据层如何协作 |
| [后端研究架构](docs/backend-research-architecture.md) | 想理解搜索、PDF、调度、模型路由和 API 边界 |
| [开发与运维](docs/developer-operations.md) | 准备贡献、测试或维护公开仓库 |
| [路线图](docs/roadmap.md) | 想了解当前边界和后续计划 |

八语言项目介绍：

- [中文](docs/i18n/README.zh-CN.md)
- [English](docs/i18n/README.en-US.md)
- [日本語](docs/i18n/README.ja-JP.md)
- [한국어](docs/i18n/README.ko-KR.md)
- [Deutsch](docs/i18n/README.de-DE.md)
- [Français](docs/i18n/README.fr-FR.md)
- [Español](docs/i18n/README.es-ES.md)
- [Русский](docs/i18n/README.ru-RU.md)

## 项目结构

```text
TraceMind/
├── frontend/          React + Vite personal research workbench
├── skills-backend/    Express + Prisma research API and orchestration
├── model-runtime/     model connector runtime experiments
├── generated-data/    curated demo/runtime data used by the app
├── assets/            public brand assets and SVG logo
├── docs/              public documentation
└── docker-compose.yml local production-like stack
```

## 当前边界

溯知仍然处在开源基线持续完善阶段。它重视可追溯性，但不会保证模型输出永远正确；它支持长期研究工作流，但不替代同行评议、专家判断或正式学术规范；它支持自托管，但你仍然需要谨慎管理模型密钥、私有 PDF 和本地数据。

这些边界不是弱点，而是溯知的安全姿态：AI 应该帮助研究者更清楚地思考，而不是把不确定性包装成确定答案。

## 文档风格参考

这一版公开文档参考了多个成熟开源项目的 README 组织方式：Supabase 的能力清单和架构透明度、LangChain 的生态入口、Dify 的自托管快速开始、Immich 的清晰链接与风险提示、Next.js 和 VS Code 的社区/贡献路径、Excalidraw 的简洁产品表达。溯知不会照搬它们的定位，但会学习它们让用户「快速理解、快速启动、知道边界、知道下一步」的文档体验。

更多技术与产品参考见 [开源参考](docs/open-source-references.md)。

## Logo

Logo 文件位于 [assets/tracemind-logo.svg](assets/tracemind-logo.svg)。它是透明背景 SVG：左侧的分叉路径表示研究线索从原始证据分流到不同问题，中心的「证据之眼」表示溯知的核心原则：每个判断都要能回看来源。

## 许可证

本项目以 MIT License 开源。见 [LICENSE](LICENSE)。
