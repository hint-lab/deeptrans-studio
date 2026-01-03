<div align="center">
  <img src="public/logo.svg" alt="DeepTrans Studio" width="120" height="120">
  
  # DeepTrans Studio
  
  ### 专业的 AI 智能翻译工作台
  
  [![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=nextdotjs)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19.1-149eca?logo=react)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
  [![Prisma](https://img.shields.io/badge/Prisma-6.1-2D3748?logo=prisma)](https://prisma.io/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  
  [English](./README.md) | [中文](#)
  
</div>

---

## 🌟 项目简介

**DeepTrans Studio** 是一套企业级智能翻译平台，融合了 AI 翻译、本地化工程与团队协作能力。专为专业译员与本地化团队打造，提供完整的端到端翻译工作流管理。

<div align="center">
  <img src="public/ui.png" alt="DeepTrans Studio 界面" width="900">
  <br/>
  <em>DeepTrans Studio 用户界面</em>
</div>

## ✨ 核心功能

### 🎯 翻译 IDE
- **智能编辑器**：段落对齐的平行编辑，支持版本控制和快捷键操作
- **多智能体协同**：协调多个 AI 智能体处理复杂翻译任务
- **实时预览**：即时文档预览，保留原始格式

### 🤖 AI 驱动翻译
- **多引擎支持**：集成 OpenAI 及自定义 AI 模型
- **术语提取**：自动提取领域专业术语
- **质量评估**：AI 驱动的语法、句法和语篇评估
- **翻译记忆**：基于 Milvus 的向量语义搜索

### 📚 知识管理
- **项目词典**：项目专属术语数据库
- **翻译记忆**：支持 TMX、CSV、XLSX 格式导入导出
- **语义搜索**：基于 Milvus 的向量相似度搜索
- **可视化管理**：使用 Attu UI 管理向量数据库

### 🔄 工作流自动化
- **队列处理**：基于 BullMQ 的异步任务处理
- **批量操作**：批量翻译、评估和质量检查
- **文档解析**：通过 PDFMath 服务解析 PDF、DOCX、XLSX 文档
- **状态追踪**：完整的翻译生命周期管理

### 🔌 可扩展性
- **开放架构**：模块化设计，集成 MinIO、Milvus、Redis
- **API 网关**：提供 RESTful API 用于外部集成
- **自定义智能体**：可扩展的 AI 智能体框架
- **插件系统**：支持自定义翻译引擎和处理流程

## 🏗️ 系统架构

DeepTrans Studio 采用基于 Next.js App Router 的现代全栈架构，配合分布式队列处理：

```mermaid
graph TD
    Browser[Web 浏览器] -->|HTTPS| Traefik[Traefik 代理]
    Traefik -->|HTTP 3000| Studio[Next.js Studio]
    Traefik --> Attu[Attu UI]
    Studio -->|Server Actions| Postgres[(PostgreSQL)]
    Studio -->|任务队列| Redis[(Redis)]
    Studio -->|API 调用| PDFMath[PDFMath 服务]
    Worker[Worker 服务] -->|消费任务| Redis
    Worker -->|ORM| Postgres
    Worker -->|向量操作| Milvus[(Milvus)]
    Worker -->|对象存储| MinIO[(MinIO)]
    Milvus --> etcd[(etcd)]
```

### 核心组件

| 组件 | 技术栈 | 用途 |
|------|--------|------|
| **Studio** | Next.js 15, React 19, TypeScript | 前端 UI、Server Actions、身份验证 |
| **Worker** | Node.js, BullMQ | 后台任务处理、批量操作 |
| **数据库** | PostgreSQL, Prisma 6 | 关系型数据存储与 ORM |
| **缓存** | Redis | 会话管理、任务队列 |
| **向量库** | Milvus + etcd | 语义搜索、翻译记忆 |
| **存储** | MinIO (S3 兼容) | 文档和资源存储 |
| **解析器** | PDFMath 服务 | PDF 及数学文档解析 |
| **网关** | Traefik | 反向代理、SSL/TLS 终端 |

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 18.18（推荐使用 `corepack` 管理 Yarn 1.22.22）
- **Yarn**（通过 `corepack enable` 启用）
- **Docker** & **Docker Compose**（用于服务和部署）
- **Git**

### 安装依赖

```bash
# 启用 corepack 并设置 Yarn
corepack enable
corepack prepare yarn@1.22.22 --activate

# 安装依赖
yarn install
```

### 环境配置

创建 `.env.local` 文件并填写以下配置：

```env
# 数据库与缓存
DATABASE_URL="postgresql://postgres:password@localhost:5432/deeptrans"
REDIS_URL="redis://127.0.0.1:6379"

# 鉴权与站点配置
AUTH_SECRET="your-secret-key-here"  # 生成方式: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
NODE_ENV=development

# AI 服务配置
OPENAI_API_KEY="sk-xxxx"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_API_MODEL="gpt-4o-mini"

# 对象存储
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=deeptrans

# 服务配置
STUDIO_HOST=localhost

# 可选：GitHub OAuth、SMTP 等
# GITHUB_ID=your-github-oauth-id
# GITHUB_SECRET=your-github-oauth-secret
```

> 💡 **安全提示**：生产环境请使用专用数据库实例，并妥善保管所有凭据。

### 数据库初始化

```bash
# 运行数据库迁移
yarn prisma migrate deploy

# 生成 Prisma Client
yarn prisma generate

# （可选）导入示例数据
yarn db:seed
```

### 开发模式

**方式一：使用 Docker Compose（推荐）**

```bash
# 启动所有服务
docker compose up -d db redis etcd milvus minio pdfmath worker

# 启动 Next.js 开发服务器
yarn dev

# 访问应用: http://localhost:3000
```

**方式二：本地服务**

```bash
# 启动 Next.js 开发服务器
yarn dev

# 在另一个终端启动 Worker
yarn dev:worker
```

可用界面：
- **Studio**: http://localhost:3000
- **Attu (Milvus UI)**: http://localhost:8001
- **Prisma Studio**: 运行 `yarn prisma studio`

### 生产部署

```bash
# 配置环境变量
cp .env.example .env.production
# 编辑 .env.production 填写生产环境配置

# 构建镜像
docker compose build studio worker pdfmath

# 部署服务
docker compose up -d traefik studio worker db redis milvus minio

# 服务将在配置的域名上通过 Traefik 提供 SSL 访问
```

## 📁 项目结构

```
deeptrans-studio/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (app)/              # 主应用页面
│   │   ├── api/                # API 路由（逐步迁移至 Server Actions）
│   │   └── layout.tsx          # 根布局与 providers
│   ├── actions/                # Server Actions（数据库、AI、文件）
│   ├── agents/                 # AI 智能体定义与提示词
│   ├── components/             # 可复用 UI 组件
│   ├── hooks/                  # 自定义 React Hooks
│   ├── lib/                    # 工具函数与客户端
│   ├── store/                  # 状态管理（Zustand）
│   ├── db/                     # 数据库客户端与仓储
│   ├── types/                  # TypeScript 类型定义
│   └── worker/                 # 后台 Worker 任务
├── prisma/                     # 数据库模式与迁移
│   ├── schema.prisma           # Prisma 模式定义
│   └── migrations/             # 数据库迁移文件
├── scripts/                    # 开发与工具脚本
├── public/                     # 静态资源
├── docker-compose.yml          # Docker 服务编排
├── Dockerfile                  # 容器镜像定义
└── package.json                # 项目依赖
```

## 🛠️ 常用脚本

| 命令 | 说明 |
|------|------|
| `yarn dev` | 启动 Next.js 开发服务器（热更新） |
| `yarn dev:worker` | 本地启动 Worker 服务（如不使用 Docker） |
| `yarn build` | 构建生产版本 Next.js 应用 |
| `yarn build:worker` | 编译 Worker 服务（esbuild → dist/worker.cjs） |
| `yarn start` | 启动生产模式 Next.js 服务器 |
| `yarn lint` | 运行 ESLint 代码质量检查 |
| `yarn type-check` | 运行 TypeScript 类型检查 |
| `yarn prisma studio` | 打开 Prisma Studio 数据库 GUI |
| `yarn prisma generate` | 生成 Prisma Client |
| `yarn db:push` | 推送模式变更到数据库 |
| `yarn db:seed` | 导入示例数据到数据库 |
| `yarn test:segment` | 测试分段解析 |
| `yarn test:docx` | 测试文档解析 |
| `yarn queue:ui` | 启动 Bull Board 队列监控 |

## 🌍 国际化

DeepTrans Studio 使用 [next-intl](https://next-intl-docs.vercel.app/) 进行国际化：

- 翻译文件：`src/i18n/en.json`、`src/i18n/zh.json`
- 使用方式：`useTranslations('namespace')` Hook
- 支持语言：英语、中文（可扩展）

添加新翻译时，请确保所有语言文件同步更新。

## 🤝 参与贡献

我们欢迎贡献！请遵循以下指引：

### 分支策略
- `feat/*` - 新功能
- `fix/*` - Bug 修复
- `chore/*` - 维护任务
- `docs/*` - 文档更新

### 开发流程

1. **Fork & Clone**：Fork 仓库并克隆到本地
2. **创建分支**：从 `main` 创建功能分支
3. **代码修改**：按照编码规范进行修改
4. **质量检查**：运行代码检查和类型检查
   ```bash
   yarn lint
   yarn type-check
   ```
5. **提交代码**：使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式
   ```
   feat: 添加翻译记忆导入功能
   fix: 修复身份验证 Bug
   docs: 更新安装指南
   ```
6. **提交 PR**：提交 Pull Request 并附上清晰的描述

### 代码规范
- 遵循 ESLint 和 Prettier 配置
- 编写带有正确类型的 TypeScript（避免使用 `any`）
- 为复杂函数添加 JSDoc 注释
- 为新功能编写单元测试
- 及时更新文档

## 📄 开源协议

本项目采用 MIT 协议 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

基于以下现代技术构建：
- [Next.js](https://nextjs.org/) - React 框架
- [Prisma](https://www.prisma.io/) - 数据库 ORM
- [Milvus](https://milvus.io/) - 向量数据库
- [BullMQ](https://docs.bullmq.io/) - 任务队列
- [MinIO](https://min.io/) - 对象存储
- [Traefik](https://traefik.io/) - 反向代理

## 📞 支持

- **Issues**：[GitHub Issues](https://github.com/yourusername/deeptrans-studio/issues)
- **讨论**：[GitHub Discussions](https://github.com/yourusername/deeptrans-studio/discussions)
- **文档**：查看 `/docs` 文件夹获取详细指南

---

<div align="center">
  
  为专业译员和本地化团队倾心打造 ❤️
  
  ⭐ 如果觉得有用，请在 GitHub 上给我们一个 Star！
  
</div>

