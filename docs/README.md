# 文档总览

`docs/` 是溯知当前唯一的权威文档入口。

## 建议阅读顺序

1. `suzhi-ideal-state-blueprint.md`
   说明产品目标、研究闭环和体验原则。
2. `frontend-ui-system-blueprint.md`
   说明页面职责、界面结构、工作台与搜索契约。
3. `backend-research-architecture.md`
   说明后端路由、研究编排、搜索、模型接入和资产流。
4. `developer-operations.md`
   说明启动、测试、端口、运行数据目录和开发治理。
5. `implementation-roadmap.md`
   说明当前已经稳定的部分与下一步收口重点。
6. `model-config-migration.md`
   说明模型配置从环境变量到配置接口/设置页的迁移方式。
7. `legacy-docs-status.md`
   说明根目录历史文档如何映射到当前文档体系。

## 文档原则

- 文档必须描述“当前代码真实怎么工作”，而不是空泛的理想状态。
- 历史草图、实验计划、运行日志和一次性调查，不再放在这里当正式规范。
- 如果代码改变了页面结构、接口契约或运行方式，优先更新这里，再补实现细节。
