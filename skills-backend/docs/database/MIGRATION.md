# 数据库与部署迁移说明

## 当前默认状态

溯知当前默认开发路径仍然是：

- Prisma
- SQLite
- 后端端口 `3303`

也就是说，**PostgreSQL 不是这份仓库当前的默认本地开发前提**。

## 什么时候需要 PostgreSQL / Redis

以下场景才建议切到更重的部署形态：

- 多人共享环境
- 持久化队列或更复杂的任务编排
- 需要更强的并发、备份或服务化部署能力
- 想直接使用 `docker-compose.yml` 中的完整环境

## 本地默认开发

```bash
cd skills-backend
npm install
npm run dev
```

默认数据库由 `prisma/schema.prisma` 和本地 `DATABASE_URL` 决定；当前仓库与测试都仍兼容 SQLite 开发。

## 如果要迁移到 PostgreSQL

请把它当作**显式架构决策**，而不是日常步骤：

1. 修改 `prisma/schema.prisma` 的 datasource provider
2. 更新 `DATABASE_URL`
3. 重新生成 Prisma Client
4. 执行迁移或 `db push`
5. 验证后端路由、调度、研究任务与模型配置链路

## Docker 路径

根目录 `docker-compose.yml` 已提供 PostgreSQL、Redis 与应用服务编排。若使用这条路径，请以 compose 配置中的端口和服务名为准，而不是历史文档中的 `3001` 或旧项目命名。

## 当前建议

- 想跑本地开发：优先 SQLite
- 想跑完整服务编排：使用根目录 `docker-compose.yml`
- 想做正式迁移：先在 `docs/implementation-roadmap.md` 记录理由，再实施
