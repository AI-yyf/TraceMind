<p align="center">
  <img src="assets/tracemind-logo.svg" alt="TraceMind logo" width="520">
</p>

<p align="center">
  <strong>溯知 TraceMind：AI 个人研究工作台</strong><br>
  把论文、证据、节点、判断和追问，沉淀成一个长期可追溯的个人研究现场。
</p>

<p align="center">
  <a href="LICENSE">MIT License</a> ·
  <a href="docs/getting-started.md">快速开始</a> ·
  <a href="docs/product-positioning.md">产品定位</a> ·
  <a href="docs/comparison.md">横向对比</a> ·
  <a href="docs/research-intent.md">研究初心</a>
</p>

---

## 一句话定位

溯知不是又一个「问 AI 一个问题」的聊天框，也不只是论文收藏夹。它更像一个可以自托管、可审计、可长期积累的 **AI 个人研究工作台**：围绕你的研究主题，持续组织资料、证据、阶段、节点、模型输出和个人判断。

当你想从「我读了很多，但脑子里还是散的」走向「我能解释一个领域为什么这样发展、关键证据在哪里、下一步该读什么」时，溯知就是那个研究现场。

## 为什么需要它

个人研究最痛的地方，往往不是找不到资料，而是资料太多之后没有形成结构：

- 搜索工具给你答案，但答案很快过期，也很难沉淀成自己的研究记忆。
- 文献管理器能保存 PDF 和引用，但不会替你把问题、方法、证据和判断串起来。
- AI 笔记工具能围绕资料问答，但通常缺少主题生命周期、论文准入、研究节点和阶段性判断。
- 通用聊天模型能写得很顺，但你需要反复追问「这句话证据在哪里」。

溯知的出发点很简单：**严肃研究需要的不只是生成文本，而是能被追溯、被修正、被继承的思考结构。**

## 你可以用溯知做什么

- 创建一个长期研究主题，例如自动驾驶、具身智能、Transformer 创新、机器人策略学习。
- 从 arXiv、OpenAlex、Crossref、Semantic Scholar 等来源发现候选论文。
- 将论文从「链接」变成「证据对象」：PDF、图表、公式、引用和可解释片段。
- 把主题拆成研究节点：问题、方法、机制、分歧、局限、趋势和关键转折。
- 在节点页阅读带证据链的长文，而不是只看一段摘要。
- 在工作台继续追问，并把对话放回主题上下文，而不是让它消失在聊天历史里。
- 通过 Prompt Studio 和 Omni Gateway 管理模型、提示词、任务包与外部 Agent。
- 以八种语言使用界面和阅读说明：中文、英语、日语、韩语、德语、法语、西班牙语、俄语。

## 设计理念

溯知遵循四个原则：

- **Evidence first**：先有证据，再有判断。模型输出必须尽量回到论文、图表、公式和引用。
- **Memory over chat**：聊天只是入口，真正重要的是主题记忆、节点记忆和研究阶段。
- **Workbench, not feed**：不做信息流焦虑，而做一个能坐下来工作的研究台面。
- **Human in the loop**：AI 负责整理、聚合、提示不确定性；研究者负责选择、怀疑和最终判断。

更完整的设计说明见 [Design Principles](docs/design-principles.md)。

## 与常见工具的关系

| 工具 | 擅长 | 溯知的不同 |
| --- | --- | --- |
| Zotero | 收集、管理、标注、引用文献 | 溯知不替代 Zotero，而是在文献之上组织研究节点、证据链和判断 |
| NotebookLM | 围绕上传资料进行源材料问答 | 溯知更强调长期主题、论文发现、节点建模和研究工作台 |
| Elicit | 系统综述中的检索、筛选和数据抽取 | 溯知更偏个人长期研究现场，而不是单一系统综述流程 |
| Perplexity | 联网搜索并合成有来源的答案 | 溯知不追求一次性答案，而追求可积累的研究结构 |
| ChatGPT / Claude | 通用推理、写作和对话 | 溯知把模型能力放进可审计的主题、证据和节点系统里 |

完整横向对比见 [Comparison](docs/comparison.md)。

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
├── frontend/          React + Vite personal research workbench
├── skills-backend/    Express + Prisma research API and orchestration
├── model-runtime/     model connector runtime experiments
├── generated-data/    curated demo/runtime data used by the app
├── assets/            public brand assets and SVG logo
├── docs/              public documentation
└── docker-compose.yml local production-like stack
```

## 文档地图

- [文档总览](docs/README.md)
- [产品定位](docs/product-positioning.md)
- [研究初心](docs/research-intent.md)
- [设计原则](docs/design-principles.md)
- [横向对比](docs/comparison.md)
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

## Logo

Logo 文件位于 [assets/tracemind-logo.svg](assets/tracemind-logo.svg)。它是透明背景 SVG：左侧的分叉路径表示研究线索从原始证据分流到不同问题，中心的「证据之眼」表示溯知的核心原则：每个判断都要能回看来源。

## 许可证

本项目以 MIT License 开源。见 [LICENSE](LICENSE)。
