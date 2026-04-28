# InkOS GitHub 上传说明

这份说明用于把当前 InkOS 项目上传到 GitHub，包含推荐上传范围、排除项、项目介绍、README 摘要、仓库标签、提交说明和发布前检查清单。

## 1. 项目定位

InkOS 是一个面向长篇小说创作的自主式 AI Agent 工作台，提供 CLI、TUI、Web Studio 三种使用形态。它通过多 Agent 写作管线完成小说的规划、写作、审计、修订、状态沉淀和导出，适合用于网文、英文类型小说、同人、续写、风格仿写、章节质量检查和长篇连续性管理。

一句话介绍：

> InkOS 是一个本地优先的自主小说写作 AI Agent，支持多 Agent 写作管线、33 维质量审计、Web Studio 工作台、TUI 仪表盘、风格仿写、同人创作、EPUB 导出和长篇连续性管理。

英文一句话：

> InkOS is a local-first autonomous novel-writing AI agent with a multi-agent pipeline, 33-dimension quality audit, Web Studio, TUI dashboard, style cloning, fan fiction support, EPUB export, and long-form continuity tracking.

## 2. 推荐 GitHub 仓库信息

### 仓库名

推荐：

- `inkos`
- `inkos-novel-agent`
- `ai-novel-writing-agent`

如果你是 fork 或二次整理版，可以用：

- `inkos-studio-fixed`
- `inkos-local-build`

### 仓库简介 Description

中文：

> 自主小说写作 AI Agent：多 Agent 写作管线、33 维质量审计、Web Studio、TUI、风格仿写、同人创作与 EPUB 导出。

英文：

> Autonomous novel-writing AI agent with multi-agent pipeline, 33-dimension audit, Web Studio, TUI, style cloning, fan fiction, and EPUB export.

### Topics / 标签

建议添加：

- `ai-writing`
- `novel-writing`
- `ai-agent`
- `creative-writing`
- `typescript`
- `react`
- `vite`
- `cli`
- `tui`
- `epub`
- `llm`
- `writing-assistant`
- `fiction`
- `multi-agent`

## 3. 推荐上传目录

这次已经按“源码仓库”标准准备上传包。推荐包含：

```text
assets/                 # 项目 logo、截图、说明图片等静态资源
packages/               # monorepo 核心源码
  cli/                  # CLI / TUI 入口
  core/                 # 多 Agent 写作核心引擎
  studio/               # Web Studio 前后端
radar/                  # 市场雷达相关资料或模块
scripts/                # 发布、校验、构建辅助脚本
skills/                 # WorkBuddy / OpenClaw Skill 描述
CHANGELOG.md            # 更新日志
CONTRIBUTING.md         # 贡献指南
LICENSE                 # AGPL-3.0-only 许可证
package.json            # 根项目配置
pnpm-lock.yaml          # 锁定依赖版本
pnpm-workspace.yaml     # pnpm workspace 配置
README.md               # 中文 README
README.en.md            # 英文 README
README.ja.md            # 日文 README
tsconfig.json           # 根 TypeScript 配置
.gitignore              # Git 排除规则
```

## 4. 不建议上传的内容

以下内容不应上传到 GitHub，原因是体积大、包含运行时数据、可能包含隐私或本地状态：

```text
node_modules/           # 依赖目录，体积巨大，可由 pnpm install 还原
packages/**/dist/       # 构建产物，源码仓库通常不提交
packages/**/node_modules/
books/                  # 用户书籍正文和项目数据
inkos.json              # 本地项目配置，可能包含模型服务配置
.env / .env.local       # API Key 等敏感配置
test-project/           # 本地测试书籍项目，包含大量章节和日志
.playwright-cli/        # 浏览器测试临时快照
.workbuddy/             # WorkBuddy 项目记忆、会话、自动化数据
studio-out.log
studio-err.log
*.log
*.tgz
coverage/
.tmp/ 或 tmp/
```

当前 `.gitignore` 已经排除了大部分运行时数据，包括：`node_modules/`、`dist/`、`.env`、`test-project/`、`.playwright-cli/`、`.inkos/`、`books/`、`inkos.json` 等。

## 5. 项目核心特性介绍

### 多 Agent 小说写作管线

InkOS 将小说创作拆成多个职责明确的 Agent，包括规划、构思、写作、观察、状态沉淀、审计、修订等步骤。写作不只是一次性生成文本，而是围绕长期状态、角色关系、伏笔、章节目标和质量标准持续推进。

### 33 维质量审计

每章可经过多维度质量检查，覆盖：

- 角色连续性
- 世界观一致性
- 资源账本
- 情感弧线
- 伏笔推进
- 大纲偏离
- 节奏问题
- 对话质量
- AI 痕迹
- 长度治理
- 章节完整性

### InkOS Studio Web 工作台

Studio 是本地 Web 工作台，提供：

- 书籍管理
- 章节审阅与编辑
- 实时写作进度
- AI 助手对话面板
- 质量审计
- 文风分析
- 题材管理
- 市场雷达
- 真相文件编辑
- 守护进程控制
- 数据统计

### CLI / TUI 双入口

除了 Web Studio，InkOS 也支持命令行和 TUI 仪表盘：

```bash
inkos
inkos book create --title "我的小说" --genre urban
inkos write next <book-id> --count 1
inkos audit <book-id> chapter-1 --json
inkos export <book-id> --format epub
```

### 长篇连续性管理

每本书会维护结构化状态文件，用于长期追踪：

- 世界状态
- 角色矩阵
- 资源账本
- 章节摘要
- 支线进度
- 情感弧线
- 未闭合伏笔

### 风格仿写与同人创作

支持分析参考文本，提取文风指纹，并将其用于后续章节生成；也支持基于原作素材创建同人项目。

### 多语言与类型小说支持

支持中文网文题材和英文类型小说，包括都市、玄幻、仙侠、恐怖、LitRPG、Progression Fantasy、Isekai、Romantasy、Sci-Fi 等。

## 6. 技术栈介绍

- 语言：TypeScript
- Monorepo：pnpm workspace
- 前端：React 19、Vite 6、Tailwind CSS、shadcn 风格组件
- 后端：Hono、@hono/node-server
- CLI：commander
- TUI：Ink + React
- Markdown 渲染：Streamdown
- 校验：Zod / TypeBox
- 测试：Vitest
- 导出：EPUB 生成支持
- LLM：OpenAI / Anthropic / OpenAI-compatible custom provider

## 7. 本次本地修复记录

当前工作副本相对原项目包含至少一个本地修复：

### Studio 输出字号修复

修复 Studio 聊天页“输出字号”选择后，历史回复和输出内容字号不变化的问题。

涉及文件：

```text
packages/studio/src/components/chat/ChatMessage.tsx
packages/studio/src/components/ai-elements/message.tsx
packages/studio/src/index.css
```

修复方式：

- 将字号以 CSS 变量形式挂到消息容器；
- 给消息内容增加 `.chat-output-content` 类；
- 用显式 CSS 覆盖 Markdown 内部段落、列表、代码、表格、标题等元素字号；
- 修正 `MessageResponse` 的 memo 比较逻辑，避免样式变化被缓存忽略；
- 重新构建前端并通过浏览器实测。

实测结果：

```text
初始输出段落字号：14px
点击 20 后计算字号：20px
点击 12 后计算字号：12px
```

## 8. GitHub README 摘要模板

如果你想单独写一个更短的 README，可以参考：

```md
# InkOS

InkOS 是一个本地优先的自主小说写作 AI Agent，支持多 Agent 写作管线、33 维质量审计、Web Studio 工作台、TUI 仪表盘、风格仿写、同人创作、EPUB 导出和长篇连续性管理。

## Features

- Multi-agent novel writing pipeline
- 33-dimension continuity and quality audit
- Local Web Studio for book/chapter management
- CLI and TUI dashboard
- Long-form truth/state files
- Style cloning and fan fiction support
- EPUB / Markdown / TXT export
- OpenAI, Anthropic, and OpenAI-compatible providers

## Install

```bash
npm i -g @actalk/inkos
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --dir packages/studio dev:client
```

## License

AGPL-3.0-only
```

## 9. 上传前检查清单

上传 GitHub 前建议检查：

- [ ] 确认没有 `.env`、API Key、token、账号密码；
- [ ] 确认没有上传 `node_modules/`；
- [ ] 确认没有上传个人小说正文、测试书籍、运行日志；
- [ ] 确认 `.gitignore` 已包含 `books/`、`test-project/`、`inkos.json`、`.workbuddy/`；
- [ ] 确认 README 中的截图路径真实存在；
- [ ] 确认许可证为 `AGPL-3.0-only`；
- [ ] 如要公开发布，确认是否保留原仓库作者信息和许可证声明。

## 10. 推荐 Git 命令

如果要上传到一个新的 GitHub 仓库，可参考：

```bash
git init
git add .
git commit -m "Initial commit: InkOS project source"
git branch -M main
git remote add origin https://github.com/<your-name>/<repo-name>.git
git push -u origin main
```

如果 GitHub 仓库已经创建，并且本地已有 git 历史，需要按实际情况调整 remote。

## 11. 注意许可证

本项目标注为 `AGPL-3.0-only`。如果公开上传或二次分发，需要保留许可证声明，并遵守 AGPL-3.0 的开源义务。
