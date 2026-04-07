# 溯知 TraceMind

<div align="center">

**AI 驱动的学术研究追踪与深度分析系统**

*AI-Powered Academic Research Tracking & Deep Analysis System*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

---

## 📖 项目简介 | Project Overview

**溯知 (TraceMind)** 是一款基于 AI 大模型驱动的学术研究追踪系统，旨在帮助研究人员高效发现、筛选、整合和深入分析某一主题下的多篇学术论文。与传统的论文追踪工具不同，溯知通过 AI 智能地将相关论文归类为「节点」，并生成连贯的学术评述文章。

**TraceMind** is an AI-powered academic research tracking system designed to help researchers efficiently discover, screen, consolidate, and deeply analyze multiple academic papers on a given topic. Unlike traditional paper tracking tools, TraceMind uses AI to intelligently group related papers into "nodes" and generate cohesive academic review articles.

---

## ✨ 核心特性 | Key Features

### 🧠 智能论文节点 | Intelligent Paper Nodes

论文不再孤立存在——AI 根据主题相关性将多篇论文智能聚类为一个节点，形成完整的研究脉络。

> Papers no longer exist in isolation — AI intelligently clusters related papers into nodes, forming a complete research narrative.

```
┌─────────────────────────────────────────────────────────────┐
│                     🚗 世界模型研究节点                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │ GAIA-1  │───▶│ UniARM  │───▶│ DriveDreamer │───▶│ GenAD  │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│      │              │              │              │         │
│      ▼              ▼              ▼              ▼         │
│   2023.03        2023.06        2023.09        2024.01       │
└─────────────────────────────────────────────────────────────┘
```

### 🛤️ 地铁线路式时间线 | Subway-Style Timeline

主题页采用地铁线路图的可视化设计，每个站点代表一个研究阶段，旁侧显示该阶段的代表论文卡片，让研究演进一目了然。

> The topic page uses a subway map visualization design — each station represents a research stage, with paper cards displayed alongside for clear evolution tracking.

### 📝 8-Pass 深度论文解析 | 8-Pass Deep Paper Analysis

每篇论文通过 8 轮 AI 分析，生成深度解析文章：

| Pass | 内容 | Pass | 内容 |
|------|------|------|------|
| 1 | 研究背景 (Background) | 5 | 实验设计 (Experiment) |
| 2 | 核心问题 (Problem) | 6 | 研究结果 (Results) |
| 3 | 方法论 (Method) | 7 | 主要贡献 (Contribution) |
| 4 | 技术细节 (Technique) | 8 | 局限与意义 (Limitation & Significance) |

### 🌐 多语言支持 | Multilingual Support

支持 8 种语言界面，并可切换单语/双语显示模式：

🇨🇳 中文 | 🇺🇸 English | 🇯🇵 日本語 | 🇰🇷 한국어 | 🇩🇪 Deutsch | 🇫🇷 Français | 🇪🇸 Español | 🇷🇺 Русский

### 🔍 智能搜索与发现 | Smart Search & Discovery

- **Semantic Scholar 集成**: 接入学术搜索引擎，支持引用链追踪
- **三轮扩搜**: 查询扩搜 → 引用扩展 → 启发发现
- **源头识别**: 自动追踪引用链识别领域源头论文

### 🎨 深度图表分析 | Deep Figure Analysis

支持对论文中的图片、表格、公式进行深度分析，提取关键信息，辅助理解研究方法与结论。

### 🔧 灵活的多模态配置 | Flexible Multimodal Configuration

支持多种大模型 API 配置：

| 提供商 | 模型 | 适用场景 |
|--------|------|----------|
| OpenAI | GPT-4o, GPT-4 Vision | 通用分析 |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | 深度推理 |
| Google | Gemini Pro, Gemini Ultra | 多模态理解 |
| 本地模型 | Ollama, vLLM | 私有部署 |
| 自定义 | OpenAI Compatible | 企业私有 API |

---

## 🏗️ 系统架构 | Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              前端 Frontend                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  主页      │  │  主题页     │  │  节点页     │  │  设置面板   │     │
│  │  Home      │  │  Topic     │  │  Node      │  │  Settings   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ HTTP / WebSocket
┌────────────────────────────────▼────────────────────────────────────────┐
│                              后端 Backend                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Express   │  │   Prisma    │  │  WebSocket  │  │   Skills    │     │
│  │   Server   │  │    ORM      │  │   Server    │  │   System    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │   Engine   │  │  Runtime   │  │   Shared   │                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────┐
│                           模型层 Model Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ OpenAI     │  │ Anthropic   │  │  Google     │  │   Local     │     │
│  │ GPT-4V     │  │ Claude 3    │  │  Gemini     │  │   Ollama    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 横向对比 | Competitive Comparison

| 特性 Feature | 溯知 TraceMind | Mendeley | Zotero | ReadCub |
|-------------|--------|----------|--------|---------|
| AI 智能聚类论文 | ✅ | ❌ | ❌ | ❌ |
| 多论文节点整合 | ✅ | ❌ | ❌ | ❌ |
| 连贯学术评述生成 | ✅ | ❌ | ❌ | ❌ |
| 地铁线路式时间线 | ✅ | ❌ | ❌ | ❌ |
| 8-Pass 深度解析 | ✅ | ❌ | ❌ | ❌ |
| 多语言界面 (8种) | ✅ | ❌ | ❌ | ❌ |
| 深度图表分析 | ✅ | ❌ | ❌ | ❌ |
| 多模态模型支持 | ✅ | ❌ | ❌ | ❌ |
| 灵活 API 配置 | ✅ | ❌ | ❌ | ❌ |
| 实时进度追踪 | ✅ | ❌ | ❌ | ❌ |
| 中文界面 | ✅ | ⚠️ | ⚠️ | ⚠️ |

---

## 🚀 快速开始 | Quick Start

### 环境要求 | Requirements

- Node.js >= 20.0
- npm >= 9.0

### 安装步骤 | Installation

```bash
# 克隆仓库
git clone https://github.com/yourusername/tracemind.git
cd tracemind

# 安装前端依赖
cd frontend
npm install

# 安装后端依赖
cd ../skills-backend
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 初始化数据库
npx prisma generate
npx prisma db push

# 运行种子数据（可选）
npm run seed
```

### 启动开发服务器 | Start Development

```bash
# 终端 1: 启动后端
cd skills-backend
npm run dev

# 终端 2: 启动前端
cd frontend
npm run dev
```

前端将运行在 http://localhost:5173，后端在 http://localhost:3303

### 环境变量配置 | Environment Variables

```env
# 数据库
DATABASE_URL="file:./prisma/dev.db"

# OpenAI (默认)
OPENAI_API_KEY=sk-xxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# Anthropic (可选)
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Google Gemini (可选)
GOOGLE_API_KEY=xxxxx
GOOGLE_MODEL=gemini-pro

# 本地模型 (可选)
LOCAL_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL=llama3

# Semantic Scholar (用于搜索)
S2_API_KEY=xxxxx
```

---

## 📁 项目结构 | Project Structure

```
tracemind/
├── frontend/                    # React 前端应用
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   │   ├── HomePage.tsx   # 主页
│   │   │   ├── TopicPage.tsx  # 主题页 (地铁时间线)
│   │   │   ├── NodePage.tsx   # 节点页 (8-Pass 文章)
│   │   │   └── ...
│   │   ├── components/        # UI 组件
│   │   │   ├── reading/       # 阅读组件
│   │   │   │   └── PaperSectionBlock.tsx  # 论文子节
│   │   │   ├── topic/         # 主题组件
│   │   │   └── ...
│   │   ├── i18n/              # 多语言支持 (8语言)
│   │   └── types/             # TypeScript 类型
│   └── package.json
│
├── skills-backend/             # Node.js 后端
│   ├── src/
│   │   ├── routes/            # API 路由
│   │   ├── services/          # 业务服务
│   │   │   ├── topics/        # 主题服务
│   │   │   └── search/        # 搜索服务
│   │   └── ...
│   ├── shared/                # 共享模块
│   ├── engine/                # 引擎模块
│   ├── runtime/               # 运行时模块
│   ├── skill-packs/           # 技能包
│   ├── prisma/                # 数据库 schema
│   └── package.json
│
└── .gitignore                  # 已配置排除生成物
```

---

## 🧪 测试 | Testing

```bash
# 前端测试
cd frontend
npm test              # 运行所有测试
npm run test:coverage # 生成覆盖率报告

# 后端测试
cd skills-backend
npm test
```

---

## 🛠️ 技术栈 | Tech Stack

| 层级 | 技术 |
|------|------|
| 前端 | React 18, TypeScript, Vite, TailwindCSS, MUI, React Router, i18next |
| 后端 | Node.js, Express, TypeScript, Prisma ORM |
| 数据库 | SQLite (开发) / PostgreSQL (生产) |
| 实时通信 | WebSocket |
| AI 模型 | OpenAI GPT-4V, Anthropic Claude 3, Google Gemini, Ollama |
| PDF 处理 | PyMuPDF, pdf-extract |
| 搜索 | Semantic Scholar API |

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**如果你觉得这个项目有帮助，请给我们一个 ⭐！**

**If you find this project helpful, please give us a ⭐!**

</div>
