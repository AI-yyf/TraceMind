# 前端界面系统蓝图

## 路由与页面职责

核心前端路由集中在 `frontend/src/App.tsx`：

- `/`：首页与主题入口
- `/topic/:topicId`：主题工作面
- `/topic/:topicId/research`：研究工作台重定向入口
- `/node/:nodeId`：节点阅读页
- `/research`：研究调度与任务页
- `/settings`：模型与系统设置
- `/prompt-studio`：提示词工作区
- `/workbench`、`/workbench/:topicId`：研究工作台

## 当前界面分工

### 首页

- 负责进入系统、挑选主题、创建主题
- 不再承担全部研究控制逻辑

### 主题页

- 展示时间线、节点、主题摘要与工作面板
- 支持按阶段窗口过滤
- 是从结构上理解主题的主入口

### 节点页

- 以文章流方式呈现节点判断
- 穿插论文、章节、图、表、公式与引用锚点
- 保持 A4 阅读宽度约束

### 研究页

- 面向 duration-first 研究任务
- 展示任务队列、任务详情、运行状态和研究入口
- 依赖 `/api/tasks`、`/api/research/sessions`、`/api/model-configs`

### 工作台

- 围绕某个主题进行搜索、上下文添加、对话追问和邻近操作
- `SearchPanel`、`ResourcesPanel`、`WorkbenchChatEngine` 是核心部件

## 交互契约

- 所有 UI 文案必须走 i18n，不直接硬编码。
- 前端不直接拼 API；统一经 `src/utils/api.ts` 和契约断言层。
- 研究相关任务默认以 duration 模式呈现，不再依赖旧的 stage-round scheduler UI 假设。
- 阶段标签当前以稳定的年月格式为主：
  - 单月：`YYYY.MM`
  - 多月范围：`YYYY.MM-YYYY.MM`
  - 更细的短窗展示允许出现日级标签，但需要和主题/搜索契约保持一致

## 测试重点

优先保护这些面：

- 搜索契约与阶段过滤
- 主题/节点页面的契约容错
- 研究页的任务、详情与模型配置加载
- 右侧工作台的主交互流程
