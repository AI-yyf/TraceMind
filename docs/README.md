# TraceMind Documentation

溯知 TraceMind 的文档不是给机器看的配置清单，而是给真正要做研究的人看的产品手册。这里会解释：它为什么存在、适合谁、能做什么、为什么这样设计，以及如何把它跑起来。

## 推荐阅读路径

1. [产品定位](product-positioning.md)：理解溯知为什么是 AI 个人研究工作台，而不是聊天框或文献管理器。
2. [研究初心](research-intent.md)：理解这个项目想解决的真实研究痛点。
3. [设计原则](design-principles.md)：理解证据优先、长期记忆、节点化研究和人类判断为什么重要。
4. [横向对比](comparison.md)：理解溯知与 Zotero、NotebookLM、Elicit、Perplexity、通用聊天模型的关系。
5. [快速上手](getting-started.md)：安装、配置、启动前后端。
6. [系统架构](architecture.md)：理解主题、论文、证据、节点、模型网关和工作台如何协作。
7. [后端研究架构](backend-research-architecture.md)：理解搜索聚合、PDF 抽取、调度、模型路由和 API 边界。
8. [模型配置](model-config-migration.md)：理解多模型、多供应商和运行时角色配置。
9. [开发与运维](developer-operations.md)：理解测试、构建、仓库卫生和发布纪律。
10. [路线图](roadmap.md)：理解当前边界和下一步方向。
11. [开源参考](open-source-references.md)：查看框架、接口和开放生态来源。

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

- 面向用户先讲「为什么」，再讲「怎么做」，最后讲「实现细节」。
- 不夸大 AI 能力，不隐藏不确定性，不把模型输出包装成事实。
- 对比其他工具时保持尊重：溯知不是要替代所有工具，而是补上个人长期研究工作台这一层。
- 本地代理说明、运行截图、临时 QA 输出、一轮性计划和私有数据不进入公开文档。
