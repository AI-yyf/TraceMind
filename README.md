# 溯知 TraceMind

溯知是一个面向严肃研究场景的 AI 研究工作台。它把主题发现、论文筛选、证据抽取、节点建模、研究判断、对话追问和导出产物串成一个持续演进的研究闭环。

当前仓库同时包含：

- `frontend/`：React + Vite 前端工作台
- `skills-backend/`：Express + Prisma 后端、研究流程与模型接入
- `model-runtime/`：模型运行时与接入层
- `generated-data/`：研究数据快照与静态资源
- `docs/`：当前唯一的权威文档入口

## 快速开始

```bash
# 前端
cd frontend
npm install
npm run dev

# 后端
cd ../skills-backend
npm install
npm run dev
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3303`

## 文档入口

- 文档总览：`docs/README.md`
- 产品蓝图：`docs/suzhi-ideal-state-blueprint.md`
- 前端界面与页面契约：`docs/frontend-ui-system-blueprint.md`
- 后端研究架构：`docs/backend-research-architecture.md`
- 开发与运行说明：`docs/developer-operations.md`
- 当前收口路线：`docs/implementation-roadmap.md`
- 历史文档映射：`docs/legacy-docs-status.md`
- 模型配置迁移说明：`docs/model-config-migration.md`

## 仓库治理约定

- `docs/` 是当前唯一的权威文档入口；根目录旧规格文档只作为历史索引，不再充当事实来源。
- `.playwright-cli/`、`output/`、`skills-backend/uploads/`、`generated-data/app-data/workflow/` 等目录视为运行期或本地调试产物，不应继续新增为正式源码资产。
- 主题、节点、论文等运行时数据以当前后端契约和 `generated-data/` 有效快照为准，不要再依赖历史草图或未维护的脚本说明。

## 当前定位

这份仓库已经不是单纯的论文追踪器，而是在向“研究工作台”收敛：

- 前端有 `topic / node / research / workbench / settings / prompt-studio` 等主路径
- 后端已挂载 `chat / topics / search / research / model-configs / omni` 等关键接口
- 研究调度、搜索聚合、PDF 抽取、节点文章流和工作台对话链路都在仓库中有实现

后续收口重点请直接看 `docs/implementation-roadmap.md`。
