# InkOS Web Studio 改版版

> 基于 [Narcooo/inkos](https://github.com/Narcooo/inkos) 二次改版的小说写作 AI Agent 网页版。

InkOS Web Studio 改版版是在开源项目 [InkOS](https://github.com/Narcooo/inkos) 基础上整理和增强的本地 Web 工作台版本，重点面向长篇小说创作场景，提供可视化的书籍管理、章节管理、AI 助手对话、章节审计、修订、导出和连续性维护能力。

原版 InkOS 已经具备多 Agent 小说写作管线、章节质量审计、状态文件沉淀、CLI / TUI / Studio 等能力。本改版项目主要围绕 Web Studio 的实际使用体验进行调整，让小说创作、检查和修订流程更适合在网页端长期使用。

## 项目来源

本项目借鉴并基于以下开源项目改版：

- 原项目地址：[https://github.com/Narcooo/inkos](https://github.com/Narcooo/inkos)
- 原项目名称：InkOS
- 原项目定位：Autonomous Novel Writing AI Agent
- 原项目许可证：AGPL-3.0-only

感谢原作者和社区提供的 InkOS 基础能力。本项目会保留原项目来源、许可证声明和相关致谢。

## 本改版重点

- 面向本地 Web Studio 使用场景整理和增强；
- 提供更直观的小说项目管理与章节审阅体验；
- 保留多 Agent 写作、审计、修订、导出等核心能力；
- 支持长篇小说的角色、世界观、资源账本、伏笔和情感线连续性管理；
- 优化 Studio 聊天页输出显示体验；
- 修复输出字号切换后回复内容字号不变化的问题；
- 整理适合 GitHub 上传的源码目录，排除本地运行数据、测试书籍、日志和私有配置。

## 核心功能

### Web Studio 本地工作台

通过本地网页界面管理小说项目，支持书籍列表、章节审阅、章节编辑、AI 助手对话、执行状态展示、质量审计、导出、统计和真相文件查看等操作。

### 多 Agent 小说写作管线

项目保留 InkOS 的多 Agent 创作流程，将小说写作拆分为规划、构思、写作、状态观察、事实沉淀、质量审计和修订等步骤，适合长篇连载型内容生产。

### 章节审计与修订

支持对章节进行多维度检查，包括角色连续性、世界观一致性、资源账本、情感弧线、伏笔推进、章节完整性、节奏问题、AI 痕迹和大纲偏离等。

### 长篇连续性管理

每本书可维护长期状态文件，用于追踪世界设定、角色矩阵、章节摘要、支线进度、情感变化和未闭合伏笔，减少长篇创作中的设定遗忘和前后矛盾。

### 多格式导出

支持将小说内容导出为常见文本格式，方便后续归档、审阅或发布。

## 技术栈

- TypeScript
- React
- Vite
- Tailwind CSS
- Hono
- pnpm workspace
- Streamdown Markdown 渲染
- Zod / TypeBox 校验
- Vitest 测试
- OpenAI / Anthropic / OpenAI-compatible Provider

## 安装与开发

```bash
pnpm install
pnpm build
pnpm test
```

启动 Studio 开发环境：

```bash
pnpm --dir packages/studio dev:client
```

使用已构建 CLI 启动 Studio：

```bash
node packages/cli/dist/index.js studio
```

## 与原版 InkOS 的关系

本项目不是从零开始的新项目，而是基于 [Narcooo/inkos](https://github.com/Narcooo/inkos) 的 Web 改版和本地使用体验增强版本。

如果你想了解完整的原始功能、设计理念和官方更新，请优先查看原项目：

[https://github.com/Narcooo/inkos](https://github.com/Narcooo/inkos)

## License

本项目基于 [Narcooo/inkos](https://github.com/Narcooo/inkos) 二次改版，原项目采用 `AGPL-3.0-only` 许可证。

本改版项目继续保留 `AGPL-3.0-only` 许可证，并保留原项目来源与许可证声明。
