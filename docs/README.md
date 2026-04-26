# TraceMind Documentation

溯知 TraceMind 的文档面向真正要使用它做研究的人，而不是只给开发者看的配置清单。这里会解释：它为什么存在、适合谁、能做什么、为什么这样设计、如何运行，以及怎样参与改进。

文档组织参考了成熟开源项目的常见结构：先让用户快速理解价值，再给出可执行路径，随后展开架构、边界、贡献和路线图。目标是让第一次打开仓库的人不迷路，让准备深入的人有足够上下文。

## 如果你是第一次来

建议按这个顺序阅读：

1. [产品定位](product-positioning.md)：理解溯知为什么是 AI 个人研究工作台，而不是聊天框或文献管理器。
2. [研究初心](research-intent.md)：理解这个项目想解决的真实研究痛点。
3. [研究流程](research-workflow.md)：理解一个主题如何从线索、论文、证据走向节点和判断。
4. [设计原则](design-principles.md)：理解证据优先、长期记忆、节点化研究和人类判断为什么重要。
5. [横向对比](comparison.md)：理解溯知与 Zotero、NotebookLM、Elicit、Perplexity、Obsidian、Notion、通用聊天模型的关系。
6. [快速上手](getting-started.md)：安装、配置、启动前后端。

## 如果你想了解实现

- [系统架构](architecture.md)：主题、论文、证据、节点、模型网关和工作台如何协作。
- [后端研究架构](backend-research-architecture.md)：搜索聚合、PDF 抽取、调度、模型路由和 API 边界。
- [模型配置](model-config-migration.md)：多模型、多供应商和运行时角色配置。
- [开发与运维](developer-operations.md)：测试、构建、仓库卫生和发布纪律。
- [安全策略](../SECURITY.md)：漏洞报告和密钥处理边界。

## 如果你想参与或评估项目

- [路线图](roadmap.md)：当前稳定基线、近期优先级和非目标。
- [贡献指南](../CONTRIBUTING.md)：分支、测试、提交和 PR 约定。
- [开源参考](open-source-references.md)：框架、学术数据源、相邻产品和文档风格参考。
- [品牌说明](brand.md)：Logo、透明 SVG、图形含义和使用方式。

## 八语言项目介绍

溯知界面支持八种语言。用户向的项目介绍也同步提供：

- [中文](i18n/README.zh-CN.md)
- [English](i18n/README.en-US.md)
- [日本語](i18n/README.ja-JP.md)
- [한국어](i18n/README.ko-KR.md)
- [Deutsch](i18n/README.de-DE.md)
- [Français](i18n/README.fr-FR.md)
- [Español](i18n/README.es-ES.md)
- [Русский](i18n/README.ru-RU.md)

## 文档写作约定

- 先讲「为什么」，再讲「怎么做」，最后讲「实现细节」。
- 先面向用户，再面向维护者，避免把 README 写成内部备忘录。
- 不夸大 AI 能力，不隐藏不确定性，不把模型输出包装成事实。
- 对比其他工具时保持尊重：溯知不是要替代所有工具，而是补上个人长期研究工作台这一层。
- 本地代理说明、运行截图、临时 QA 输出、一轮性计划和私有数据不进入公开文档。

## 文档还需要继续变好的地方

- 增加更稳定的截图或录屏，但不能提交本地调试截图。
- 增加真实示例主题的端到端 walkthrough。
- 增加 API examples 和第三方集成示例。
- 增加常见问题与故障排查。
