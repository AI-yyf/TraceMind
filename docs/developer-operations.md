# 开发与运行说明

## 运行环境

- Node.js：建议 `>=18`
- 前端端口：`5173`
- 后端端口：`3303`
- 默认数据库：SQLite
- Docker 侧可选提供 PostgreSQL / Redis / 服务编排

## 常用命令

### 前端

```bash
cd frontend
npm install
npm run dev
npm run type-check
npm test
npm run test:e2e
```

### 后端

```bash
cd skills-backend
npm install
npm run dev
npm run type-check
npm test
```

### 数据库

```bash
cd skills-backend
npm run db:generate
npm run db:migrate
npm run db:studio
```

## 运行时目录说明

- `generated-data/app-data/`
  研究快照、主题编译产物、论文索引等运行数据。
- `generated-data/public/papers/`
  通过 `/papers` 暴露的论文静态资源。
- `skills-backend/uploads/`
  本地上传、抽取和封面/图片输出目录。
- `.playwright-cli/`、`output/`
  本地测试和截图产物，不应继续新增为源码资产。

## 当前治理规则

- 修改前端文案时必须同步 i18n。
- 修改后端接口时必须同步契约断言与相关测试。
- 清理运行产物时，先确认是可再生或不再被当前元数据引用的内容。
- 不要把一次性调试脚本、日志、截图报告继续提交到仓库。

## 验证优先级

日常改动至少运行：

1. `frontend npm run type-check`
2. `skills-backend npm run type-check`
3. 相关前端 Vitest
4. 相关后端 Node test

高风险改动再加：

1. `frontend npm test`
2. 关键后端路由与契约测试
3. 必要时运行 `skills-backend/scripts/functional-test.cjs`
