# 数据库迁移指南 | Database Migration Guide

## 从 SQLite 迁移到 PostgreSQL

### 1. 准备工作

#### 安装 PostgreSQL
```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql

# Docker
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```

#### 创建数据库
```bash
# 连接到 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE arxiv_chronicle;
CREATE USER arxiv_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE arxiv_chronicle TO arxiv_user;
\c arxiv_chronicle
GRANT ALL ON SCHEMA public TO arxiv_user;
```

### 2. 修改环境配置

#### 开发环境 (.env)
```env
DATABASE_URL="file:./dev.db"
NODE_ENV=development
```

#### 生产环境 (.env)
```env
# 注释掉 SQLite 配置
# DATABASE_URL="file:./dev.db"

# 添加 PostgreSQL 配置
DATABASE_URL="postgresql://arxiv_user:your_password@localhost:5432/arxiv_chronicle?schema=public"
NODE_ENV=production
```

### 3. 修改 Prisma Schema

编辑 `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 4. 执行迁移

```bash
cd skills-backend

# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 推送 schema 到数据库 (开发环境)
npx prisma db push

# 生产环境 - 创建迁移
npx prisma migrate dev --name init_postgresql
npx prisma migrate deploy
```

### 5. 数据迁移 (如有现有数据)

#### 导出 SQLite 数据
```bash
# 使用 prisma studio 或脚本导出
npx prisma studio
```

#### 导入 PostgreSQL
```bash
# 使用 pgloader 或手动导入
pgloader source.db postgresql://user:pass@host/dbname
```

### 6. Docker 部署

#### docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: arxiv_chronicle
      POSTGRES_USER: arxiv_user
      POSTGRES_PASSWORD: your_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: .
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql://arxiv_user:your_password@postgres:5432/arxiv_chronicle
      NODE_ENV: production
    ports:
      - "3001:3001"

volumes:
  postgres_data:
```

#### 启动
```bash
docker-compose up -d
```

### 7. 验证迁移

```bash
# 检查连接
npx prisma db execute --stdin <<< "SELECT 1"

# 查看表
npx prisma db execute --stdin <<< "\dt"

# 检查数据
npx prisma studio
```

### 8. 常见问题

#### 问题: 连接被拒绝
```bash
# 检查 PostgreSQL 是否运行
pg_isready

# 检查 pg_hba.conf 配置
# 确保允许 md5 或 scram-sha-256 认证
```

#### 问题: 迁移失败
```bash
# 查看详细错误
npx prisma migrate dev --name init --create-only
npx prisma migrate status
```

#### 问题: 性能问题
```sql
-- 为常用查询添加索引
CREATE INDEX CONCURRENTLY idx_papers_topic_published ON papers(topic_id, published DESC);
CREATE INDEX CONCURRENTLY idx_nodes_topic_stage ON research_nodes(topic_id, stage_index);
```

### 9. 生产环境检查清单

- [ ] PostgreSQL 已安装并运行
- [ ] 数据库和用户已创建
- [ ] `.env` 配置已更新
- [ ] `schema.prisma` provider 已更改
- [ ] `npx prisma generate` 已执行
- [ ] `npx prisma db push` 或迁移已执行
- [ ] 应用可以连接数据库
- [ ] 关键查询有适当索引
- [ ] 备份策略已配置
