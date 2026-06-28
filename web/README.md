# Markdown Reader Web App

这里是项目的 Next.js + Fumadocs Web 应用目录。完整项目说明、本地部署步骤、运行配置和技术基础见根目录 [README.md](../README.md)。

## 常用命令

```bash
npm install
npm run dev
npm run lint
npm run types:check
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

## 运行配置

复制并编辑环境变量：

```bash
cp .env.example .env
```

关键变量：

- `READER_DATA_DIR`
- `READER_ADMIN_PASSWORD`
- `READER_SESSION_SECRET`
- `READER_GITHUB_TOKEN`
- `READER_PULL_INTERVAL_MINUTES`

不要提交 `.env` 或任何 GitHub token。

## 主要入口

- `/docs`: Markdown 阅读器。
- `/admin/repos`: 仓库管理和同步。
- `/login`: 管理员登录。
- `/api/repos`: 仓库管理 API。
- `/api/comments`: 本地评论 API。
- `/api/search`: SQLite FTS 搜索 API。
