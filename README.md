# 溯知集 ArXiv Chronicle

<div align="center">

**AI 驱动的学术论文追踪与深度分析系统**

*AI-Powered Academic Research Tracking & Deep Analysis System*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

---

## 📖 项目简介 | Project Overview

**溯知集** 是一款基于 AI 大模型驱动的学术研究追踪系统，旨在帮助研究人员高效发现、筛选、整合和深入分析某一主题下的多篇学术论文。与传统的论文追踪工具不同，溯知集通过 AI 智能地将相关论文归类为「节点」，并生成连贯的学术评述文章。

**ArXiv Chronicle** is an AI-powered academic research tracking system designed to help researchers efficiently discover, screen, consolidate, and deeply analyze multiple academic papers on a given topic. Unlike traditional paper tracking tools, ArXiv Chronicle uses AI to intelligently group related papers into "nodes" and generate cohesive academic review articles.

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

```
主题: 自动驾驶世界模型
┌──────────────────────────────────────────────────────────────────────────┐
│  🚇 世界模型发展时间线                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ●━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━●      │
│  │                      │                      │                      │      │
│  ▼                      ▼                      ▼                      ▼      │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│ │   🚀 概念萌芽    │  │   ⚡ 技术突破   │  │   🔧 工程落地   │  │   🚗 量产应用   │ │
│ └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 📄 论文卡片: UniARM: Unified Autonomous Driving World Model        │  │
│  │    作者: Zhang et al. | 2023.06 | arXiv:2306.08910                  │  │
│  │    核心贡献: 统一的世界模型框架，整合感知、预测、规划                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 📝 三层内容架构 | Three-Layer Content Architecture

每个节点包含三个层次的内容，层层递进：

| 层级 | 名称 | 说明 |
|------|------|------|
| Layer 1 | 摘要 Summary | 一句话说清这个节点的研究核心 |
| Layer 2 | 叙述 Narrative | AI 生成的连贯学术评述，解释研究脉络 |
| Layer 3 | 证据 Evidence | 原文片段、公式、图表、实验数据 |

> Each node contains three progressive content layers:

| Layer | Name | Description |
|-------|------|-------------|
| Layer 1 | Summary | One sentence explaining the research core |
| Layer 2 | Narrative | AI-generated cohesive academic review |
| Layer 3 | Evidence | Original text, formulas, figures, experimental data |

### 🎨 深度图表分析 | Deep Figure Analysis

支持对论文中的图片、表格、公式进行深度分析，提取关键信息，辅助理解研究方法与结论。

> Supports deep analysis of figures, tables, and formulas in papers to extract key information.

### 🔧 灵活的多模态配置 | Flexible Multimodal Configuration

支持多种大模型 API 配置：

| 提供商 | 模型 | 适用场景 |
|--------|------|----------|
| OpenAI | GPT-4o, GPT-4 Vision | 通用分析 |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | 深度推理 |
| Google | Gemini Pro, Gemini Ultra | 多模态理解 |
| 本地模型 | Ollama, vLLM | 私有部署 |
| 自定义 | OpenAI Compatible | 企业私有 API |

> Multiple LLM API configurations supported:

| Provider | Models | Use Case |
|----------|--------|----------|
| OpenAI | GPT-4o, GPT-4 Vision | General Analysis |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | Deep Reasoning |
| Google | Gemini Pro, Gemini Ultra | Multimodal |
| Local | Ollama, vLLM | Private Deployment |
| Custom | OpenAI Compatible | Enterprise API |

---

## 🏗️ 系统架构 | Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              前端 Frontend                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  主页      │  │  主题页     │  │  节点详情页 │  │  设置面板   │     │
│  │  Home      │  │  Topic     │  │  Node Detail│  │  Settings   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ HTTP / WebSocket
┌────────────────────────────────▼────────────────────────────────────────┐
│                              后端 Backend                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Express   │  │   Prisma    │  │  WebSocket  │  │   Skills    │     │
│  │   Server   │  │    ORM      │  │   Server    │  │   System    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
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

| 特性 Feature | 溯知集 | Mendeley | Zotero | ReadCub |
|-------------|--------|----------|--------|---------|
| AI 智能聚类论文 | ✅ | ❌ | ❌ | ❌ |
| 多论文节点整合 | ✅ | ❌ | ❌ | ❌ |
| 连贯学术评述生成 | ✅ | ❌ | ❌ | ❌ |
| 地铁线路式时间线 | ✅ | ❌ | ❌ | ❌ |
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
git clone https://github.com/yourusername/arxiv-chronicle.git
cd arxiv-chronicle

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 初始化数据库
cd skills-backend
npx prisma generate
npx prisma db push

# 运行种子数据
npm run seed

# 返回根目录启动
cd ..
npm run dev
```

### 环境变量配置 | Environment Variables

```env
# OpenAI (默认)
OPENAI_API_KEY=sk-xxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# Anthropic (可选)
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Google Gemini (可选)
GOOGLE_API_KEY=xxxxx
GOOGLE_MODEL=gemini-pro

# 本地模型 (可选)
LOCAL_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL=llama3
```

---

## 📁 项目结构 | Project Structure

```
arxiv-chronicle/
├── frontend/                    # React 前端应用
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   │   ├── HomePage.tsx   # 主页
│   │   │   ├── TopicPage.tsx  # 主题页 (地铁时间线)
│   │   │   ├── NodeDetailPage.tsx  # 节点详情页 (三层架构)
│   │   │   └── ...
│   │   ├── components/        # UI 组件
│   │   │   ├── timeline/      # 时间线组件
│   │   │   │   └── SubwayTimeline.tsx
│   │   │   ├── settings/      # 设置面板
│   │   │   │   └── MultiModalModelPanel.tsx
│   │   │   └── ...
│   │   ├── hooks/             # React Hooks
│   │   └── types/            # TypeScript 类型
├── skills-backend/             # Node.js 后端
│   ├── src/
│   │   ├── server.ts         # Express 服务器
│   │   ├── routes/          # API 路由
│   │   ├── websocket/       # WebSocket 服务
│   │   ├── scripts/         # 脚本
│   │   │   └── seed.ts      # 种子数据
│   │   └── ...
│   ├── prisma/
│   │   └── schema.prisma    # 数据库 schema
│   └── shared/               # 共享模块
│       ├── multimodal-client.ts   # 多模态模型客户端
│       ├── pdf-extractor.ts       # PDF 提取器
│       ├── figure-analyzer.ts     # 图表分析器
│       └── multi-paper-generator.ts # 多论文生成器
├── generated-data/            # 生成的数据
│   └── app-data/
│       ├── paper-catalog.json
│       └── workflow/
└── ...
```

---

## 🎯 核心工作流 | Core Workflow

```
用户输入主题
      │
      ▼
┌─────────────────┐
│ 🔍 查询生成     │ ◀── LLM 生成搜索查询
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 📄 论文筛选     │ ◀── LLM 判断相关性
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 🏷️ 主题分类     │ ◀── LLM 分类论文到阶段
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 🔗 节点合并     │ ◀── LLM 合并高相关论文
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ✍️ 内容生成     │ ◀── LLM 生成三层内容
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 📊 图表深度分析 │ ◀── 多模态模型分析
└────────┬────────┘
         │
         ▼
      呈现给用户
```

---

## 🛠️ 技术栈 | Tech Stack

| 层级 | 技术 |
|------|------|
| 前端 | React 18, TypeScript, Vite, TailwindCSS, React Router |
| 后端 | Node.js, Express, TypeScript, Prisma ORM |
| 数据库 | SQLite (开发) / PostgreSQL (生产) |
| 实时通信 | WebSocket |
| AI 模型 | OpenAI GPT-4V, Anthropic Claude 3, Google Gemini, Ollama |
| PDF 处理 | PyMuPDF (Python), pdf-extract |
| 部署 | Docker (可选) |

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**如果你觉得这个项目有帮助，请给我们一个 ⭐！**

**If you find this project helpful, please give us a ⭐!**

</div>
