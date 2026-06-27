# Markdown Reader

本项目是一个自托管的 GitHub Markdown 知识库/博客阅读器。目标部署环境是树莓派或普通 Linux 主机，用一个 Next.js 服务完成仓库管理、Markdown 渲染、全文搜索、侧边笔记和基础在线编辑写回。

当前实现是单管理员 MVP，适合先在可信内网中试用。它不是 GitHub/Gitea 的替代品，也不是多人协作文档平台。

## 功能概览

- 通过 GitHub HTTPS URL 添加仓库，并克隆到本地。
- 支持多个仓库，仓库文档统一进入 `/docs` 阅读界面。
- 扫描 `.md`、`.markdown`、`.mdx` 文件并建立 SQLite 索引。
- 使用 Fumadocs 风格的文档布局：顶部导航、左侧文档树、正文、右侧目录。
- Markdown 渲染支持 GFM、表格、任务列表、代码块、图片、相对链接和数学公式。
- 对仓库 Markdown 生成的 HTML 做 sanitize，避免直接执行不可信脚本。
- 支持本地侧边笔记，笔记不会自动修改源文件。
- 支持在线编辑 Markdown、预览、commit 并 push 到默认分支。
- 支持手动同步和进程内定时 pull。

## 技术基础

### 应用框架

- `Next.js 16`: Web 应用、App Router、服务端 API routes、生产构建与运行。
- `React 19`: 前端组件与交互界面。
- `Fumadocs UI/Core 16`: 文档阅读布局、导航树、目录、主题样式等。
- `Fumadocs MDX`: 保留用于项目内静态示例内容、类型生成和 Fumadocs 集成。

当前项目没有 fork 或直接修改 Fumadocs 内部代码。若后续正常扩展点不足，可以参考用户 fork `https://github.com/HuangDell/fumadocs`，但默认方向仍是优先使用框架扩展点。

### Markdown 渲染

动态仓库文档没有直接交给 Fumadocs MDX 编译，而是走服务端 Markdown pipeline：

- `unified`
- `remark-parse`
- `remark-gfm`
- `remark-math`
- `remark-rehype`
- `rehype-katex`
- `rehype-sanitize`
- `rehype-stringify`
- `gray-matter`

这样做的原因是仓库内容来自运行时 clone/pull，不是构建时固定内容。服务端会读取本地 worktree 文件，解析 frontmatter，提取标题/目录，渲染 HTML，并重写相对链接和图片路径。

### 数据与 Git

- `node:sqlite`: 使用 Node.js 22 内置 SQLite 保存仓库、文档索引、全文搜索、笔记和同步状态。Node 目前仍把该模块标为 experimental，运行时会出现 warning。
- 系统 `git` 命令：clone、fetch、pull、add、commit、push 都通过本机 Git 执行。
- `GIT_ASKPASS`: GitHub token 不写进 clone URL，也不传给浏览器；服务端通过 askpass 脚本给 Git 提供认证。

### 前端组件

- `@uiw/react-codemirror` 和 `@codemirror/lang-markdown`: 在线 Markdown 编辑器。
- `lucide-react`: 管理端按钮和工具图标。
- `Tailwind CSS` 和 `fumadocs-ui` 样式：页面布局和视觉样式。

### 参考项目

需求调研参考过 Gollum、Wiki.js、Gitea/Forgejo、MkDocs、Docusaurus、docsify 等项目。它们不是本项目的直接代码基础；本项目当前代码基础是 Create Fumadocs 生成的 Next.js/Fumadocs 应用，再叠加自定义 Git、SQLite、Markdown 渲染和管理功能。

## 目录结构

```text
.
├── docs/                 # 需求、开发记录和项目说明
├── web/                  # Next.js + Fumadocs 应用
│   ├── src/app/          # 页面和 API routes
│   ├── src/components/   # 管理端和阅读器组件
│   └── src/lib/server/   # Git、SQLite、Markdown、认证等服务端逻辑
└── data/                 # 运行时数据目录，默认本地生成，不进入 git
```

运行后默认数据布局：

```text
data/
├── app.db
├── auth/
│   └── git-askpass.sh
└── repos/
    └── <repo-id>/
        └── worktree/
```

## 本地部署

以下步骤不使用 Docker，适用于树莓派、Linux 主机、macOS 或 WSL。生产长期运行建议使用 systemd。

### 1. 准备运行环境

需要安装：

- Node.js 22，已验证版本为 `v22.22.3`。
- npm，已验证版本为 `10.9.8`。
- Git。
- 能访问 GitHub 的网络环境。

检查版本：

```bash
node --version
npm --version
git --version
```

树莓派上建议使用 64 位系统，并确保内存和 swap 足够完成 Next.js production build。若使用 nvm 安装 Node，请注意 systemd 服务里也要能找到对应的 `node` 和 `npm`。

### 2. 获取代码

示例安装路径使用 `/opt/reader`。如果部署在用户 home 目录，也可以把路径替换为自己的目录。

```bash
sudo mkdir -p /opt/reader
sudo chown -R "$USER":"$USER" /opt/reader
cd /opt/reader
git clone <your-reader-repo-url> .
```

如果代码已经在本机，只需要进入项目根目录即可。

### 3. 安装依赖

```bash
cd /opt/reader/web
npm install
```

项目的 `.npmrc` 默认使用 `https://registry.npmmirror.com/`。如果部署环境不需要镜像，可以按需要调整根目录和 `web/` 下的 `.npmrc`。

### 4. 配置环境变量

复制示例配置：

```bash
cd /opt/reader/web
cp .env.example .env
chmod 600 .env
```

编辑 `web/.env`：

```bash
READER_DATA_DIR=../data
READER_ADMIN_PASSWORD=change-this-password
READER_SESSION_SECRET=replace-with-at-least-32-random-characters
READER_GITHUB_TOKEN=github_pat_or_fine_grained_token
READER_PULL_INTERVAL_MINUTES=15
```

变量说明：

- `READER_DATA_DIR`: 运行时数据目录。相对路径会基于 `web/` 工作目录解析，默认 `../data` 即项目根目录下的 `data/`。
- `READER_ADMIN_PASSWORD`: 管理端登录密码。
- `READER_SESSION_SECRET`: 用于签名登录 cookie，至少 32 个字符。可以用 `openssl rand -base64 48` 生成。
- `READER_GITHUB_TOKEN`: 服务端 GitHub token。当前实现所有 Git 命令都会要求该变量存在；如果需要 push，token 必须有目标仓库内容读写权限。
- `READER_PULL_INTERVAL_MINUTES`: 定时 pull 间隔，最小按 1 分钟处理。

GitHub token 建议使用细粒度 token，并只授权需要读取或写回的仓库。不要把 token 写进仓库 URL，也不要提交 `.env`。

### 5. 配置 Git 提交身份

在线编辑会在服务端执行 `git commit`。运行服务的系统用户必须配置 Git author 信息。

如果直接用当前用户运行：

```bash
git config --global user.name "Markdown Reader"
git config --global user.email "reader@example.com"
```

如果后续用 systemd 的 `reader` 用户运行，需要给该用户配置：

```bash
sudo -u reader git config --global user.name "Markdown Reader"
sudo -u reader git config --global user.email "reader@example.com"
```

### 6. 构建前验证

```bash
cd /opt/reader/web
npm run lint
npm run types:check
npm run build
```

`npm run build` 成功后会生成 `web/.next/`。在 Codex 沙箱里，Next/Turbopack build 可能因为内部端口绑定受限失败；普通本机 shell 通常不需要特殊处理。

### 7. 启动服务

临时前台运行：

```bash
cd /opt/reader/web
NEXT_TELEMETRY_DISABLED=1 npm run start -- -H 0.0.0.0 -p 3000
```

访问：

```text
http://<server-ip>:3000
```

常用入口：

- `/`: 首页。
- `/docs`: 阅读器。
- `/admin/repos`: 仓库管理，需要登录。
- `/login`: 管理员登录。



## 首次使用流程

1. 打开 `http://<server-ip>:3000/admin/repos`。
2. 用 `READER_ADMIN_PASSWORD` 登录。
3. 输入 GitHub HTTPS clone URL，例如 `https://github.com/owner/repo.git`。
4. 添加仓库后，服务会 clone 到 `data/repos/<repo-id>/worktree/` 并扫描 Markdown 文件。
5. 打开 `/docs` 阅读文档。
6. 在阅读页使用 `Edit` 进入编辑器，修改后预览并 `Commit & Push`。
7. 需要手动同步时，在仓库管理页点击同步按钮。

当前 MVP 只支持 GitHub HTTPS URL。SSH URL 和通用 Git URL 尚未支持。

## 更新部署

```bash
cd /opt/reader
git pull
cd web
npm install
npm run lint
npm run types:check
npm run build
sudo systemctl restart reader
```

如果不是 systemd 运行，停止旧进程后重新执行 `npm run start`。

## 数据备份

至少备份：

- `data/app.db`
- `data/repos/`
- `web/.env`

示例：

```bash
cd /opt/reader
tar -czf reader-backup-$(date +%F).tgz data web/.env
```

如果仓库都能从 GitHub 重新 clone，最关键的是 `data/app.db` 和 `web/.env`；但为了保留本地状态和减少恢复时间，建议一起备份 `data/repos/`。

## 安全注意事项

- 管理端 API 和编辑 API 需要管理员登录。
- `/docs`、搜索 API 和原始资源 API 当前是公开读。如果克隆了私有仓库，不要直接暴露到公网，除非前面再加统一认证或访问控制。
- `READER_GITHUB_TOKEN` 只应授予必要仓库和必要权限。
- `web/.env` 应设置为只有运行用户可读，例如 `chmod 600 web/.env`。
- 生产环境建议通过内网、VPN、反向代理认证或防火墙限制访问。
- 如果通过公网访问，请在反向代理层配置 HTTPS。

## 当前限制

- 当前是单管理员模型，没有多用户权限系统。
- 周期同步是 Next.js 进程内定时器，不是独立任务队列或系统级 cron。
- Git 冲突处理是基础版：检测到打开后仓库或文件变化会拒绝保存，需要手动同步后重试。
- 在线编辑直接 push 到默认分支，没有 PR 工作流。
- 笔记可按仓库、分支、文档、标题锚点和选中文本保存，但还没有自动贴合正文行号或高亮选区。
- 尚未提供 Docker、Docker Compose 或一键安装脚本。
- 尚未完成树莓派 ARM 实机长期运行验证。

## 常用命令

在 `web/` 目录执行：

```bash
npm install
npm run dev
npm run lint
npm run types:check
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

开发模式：

```bash
cd web
npm run dev -- -H 0.0.0.0 -p 3000
```

生产模式：

```bash
cd web
npm run build
NEXT_TELEMETRY_DISABLED=1 npm run start -- -H 0.0.0.0 -p 3000
```
