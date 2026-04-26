# Open Source References

溯知是一个集成型研究工作台。它站在成熟开源框架和开放学术生态之上，而不是重新发明每一层。

## 应用框架

- [React](https://react.dev/)：前端组件模型。
- [Vite](https://vite.dev/guide/)：前端开发和构建。
- [Express](https://expressjs.com/)：后端 HTTP API。
- [Prisma](https://www.prisma.io/docs)：数据库 schema 和 client。
- [SQLite](https://sqlite.org/)：轻量本地开发数据库。
- [PostgreSQL](https://www.postgresql.org/)：Docker Compose 中的生产化数据库选项。
- [Redis](https://redis.io/)：缓存和队列基础设施。

## 前端与质量工具

- [React Router](https://reactrouter.com/)：应用路由。
- [Tailwind CSS](https://tailwindcss.com/)：界面样式基础。
- [Vitest](https://vitest.dev/)：前端单元测试。
- [Playwright](https://playwright.dev/)：端到端浏览器测试。
- [Zod](https://zod.dev/)：运行时 schema 校验。

## AI 与模型供应商

- [OpenAI API](https://platform.openai.com/docs)：OpenAI compatible endpoints 可通过 Omni Gateway 接入。
- [Anthropic API](https://docs.anthropic.com/)：后端模型层支持的供应商之一。
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)：后端模型层支持的供应商之一。
- BigModel / GLM compatible endpoints：可通过 Omni provider 配置接入。

## 学术数据与阅读生态

- [arXiv API](https://info.arxiv.org/help/api/index.html)：论文发现和预印本入口。
- [OpenAlex](https://docs.openalex.org/)：开放学术元数据。
- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)：DOI 和出版元数据。
- [Semantic Scholar API](https://www.semanticscholar.org/product/api)：论文与引用元数据。
- [Zotero Web API](https://www.zotero.org/support/dev/web_api/v3/start)：参考文献管理和导出生态。
- [PyMuPDF](https://pymupdf.readthedocs.io/)：PDF 解析和本地抽取脚本。

## 相邻产品和设计参照

溯知也参考了现代研究工具的产品分工：

- [Zotero](https://www.zotero.org/) 启发了文献资产管理和开放研究生态的方向。
- [NotebookLM](https://notebooklm.google/) 启发了源材料优先的问答体验。
- [Elicit](https://elicit.com/) 启发了论文检索、筛选和结构化抽取工作流。
- [Perplexity](https://www.perplexity.ai/) 启发了带来源的答案体验。

溯知不会复制这些产品的定位。它实现的是一个开源、可自托管、围绕个人长期主题记忆和证据链的研究工作台。
