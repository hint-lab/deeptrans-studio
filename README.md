# DeepTrans Studio · 智能翻译工作室

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1-149eca?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.1-2D3748?logo=prisma)](https://prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 🚀 DeepTrans Studio 是一套面向专业翻译与本地化团队的智能工作平台，提供翻译 IDE、术语管理、翻译记忆、质量评估与自动化工作流等端到端能力。

**开发单位**: [CogNLP Lab](https://hint-lab.github.io/people/wang_hao/), Shanghai University

**中文** | [English](./README_EN.md)

---

## 📚 目录

- [项目简介](#项目简介)
- [核心能力](#核心能力)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
  - [前置要求](#前置要求)
  - [安装依赖](#安装依赖)
  - [配置环境变量](#配置环境变量)
  - [初始化数据库](#初始化数据库)
  - [启动本地开发环境](#启动本地开发环境)
  - [使用 Docker Compose 运行](#使用-docker-compose-运行)
- [后台服务与任务](#后台服务与任务)
- [目录结构](#目录结构)
- [常用脚本](#常用脚本)
- [国际化](#国际化)
- [贡献指引](#贡献指引)
- [项目说明](#项目说明)

---

## 项目简介

DeepTrans Studio 将 AI 翻译、本地化工程与团队协作能力整合在同一套产品内。平台围绕翻译项目的全流程打造，包括：

- 多场景翻译工作台（IDE、即时翻译、批量操作）
- 专业领域词典、翻译记忆与知识库
- AI 辅助的质量评估、术语提取与语篇审校
- 工作流自动化与队列任务处理
- 统一的权限、日志、运营配置与对外 API

## 核心能力

- **翻译 IDE**：提供段落对齐、版本追踪、快捷键与多智能体协同的翻译工作台。
- **AI 辅助**：内置翻译、术语抽取、语法/语篇评估、字数统计与多引擎比对。
- **术语 & 记忆**：支持项目/个人词典、翻译记忆导入导出、Milvus 向量检索及 Attu 可视化。
- **项目管理**：项目全生命周期、文件分段、状态流转、文档预览与任务分发。
- **自动化工作流**：BullMQ 队列驱动 Worker，处理批量翻译、评估、文档解析、向量写入等耗时任务。
- **开放与扩展**：通过 MinIO、Milvus、Redis 等组件可扩展自定义 AI 服务、报表或外部集成。

## 系统架构

平台采用前后端一体的 Next.js App Router 架构，结合队列与服务组件形成如下结构：

- **Studio（Next.js 应用）**：承担前端 UI、Server Actions、NextAuth 鉴权与 API 网关能力。
- **Worker（Node 服务）**：与 BullMQ/Redis 交互，负责批处理、嵌入生成、向量写入、任务调度。
- **PDFMath 服务**：处理 PDF/数学类文档解析，供 Studio 和 Worker 调用。
- **Traefik**：反向代理与证书管理，可统一暴露 Studio、Attu 等子服务。
- **支撑组件**：PostgreSQL、Redis、Milvus(含 etcd)、MinIO、Attu UI。

```mermaid
graph TD
    Browser -->|HTTPS| Traefik
    Traefik -->|HTTP 3000| Studio[Next.js Studio]
    Traefik --> Attu[Attu UI]
    Studio -->|Server Actions| Postgres[(PostgreSQL)]
    Studio -->|BullMQ| Redis[(Redis)]
    Studio -->|HTTP| PDFMath[PDFMath Service]
    Worker -->|BullMQ| Redis
    Worker -->|Prisma| Postgres
    Worker -->|Milvus SDK| Milvus[(Milvus)]
    Worker -->|S3 API| MinIO[(MinIO)]
    Milvus --> etcd[(etcd)]
```

## 技术栈

| 模块 | 技术选型 |
| --- | --- |
| 应用框架 | Next.js 15 (App Router)、React 19、TypeScript 5 |
| 后端能力 | Next.js Server Actions、Prisma 6、NextAuth、BullMQ |
| 数据存储 | PostgreSQL、Redis、Milvus + etcd、MinIO |
| AI 能力 | OpenAI 兼容接口、自研 PDFMath 服务、AI Agents |
| 构建 & 工具 | Yarn 1、corepack、Docker Compose、Traefik、ESLint、Prettier |

## 快速开始

### 前置要求

- **Node.js** ≥ 18.18（推荐使用 `corepack` 管理 Yarn 1.22.22）
- **Yarn**（通过 `corepack enable` 启用）
- **Docker / Docker Compose**（用于本地依赖服务或一键部署）
- **Git** 等常用工具

### 安装依赖

```bash
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
```

### 配置环境变量

复制或创建 `.env.local` 并依据实际环境填写：

```dotenv
# 数据库与缓存
DATABASE_URL="postgresql://postgres:123456@localhost:5432/deeptrans"
REDIS_URL="redis://127.0.0.1:6379"

# 鉴权 & 站点配置
AUTH_SECRET="请生成随机字符串"
NEXTAUTH_URL="http://localhost:3000"
NODE_ENV=development

# LLM / AI 服务
OPENAI_API_KEY="sk-xxxx"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_API_MODEL="gpt-4o-mini"

# 对象存储 & 资源
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=deeptrans

# 其他服务
STUDIO_HOST=localhost        # Traefik/HTTPS 部署时使用

# 可选：GitHub OAuth、SMTP、Milvus 访问信息等
```

> 💡 生产环境请将数据库、Redis、Milvus、对象存储改为专用实例，并妥善保管密钥。

### 初始化数据库

```bash
yarn prisma migrate deploy      # 或 yarn db:push 初始化结构
yarn prisma generate            # 生成 Prisma Client
yarn db:seed                    # 可选：导入示例数据
```

### 启动本地开发环境

1. 启动依赖服务（推荐使用 Docker Compose 中的服务）：
   ```bash
   docker compose up -d db redis etcd milvus minio pdfmath worker
   # 如需 Attu UI 或 Traefik，请追加 attu traefik
   ```
2. 启动 Next.js 应用（热更新）：
   ```bash
yarn dev
   ```
3. 若希望在本地 Node 环境运行 Worker，可执行 `yarn dev:worker`（默认通过 compose 的 `worker` 容器运行）。

访问 [http://localhost:3000](http://localhost:3000) 即可进入 Studio；Attu（Milvus UI）默认暴露在 [http://localhost:8001](http://localhost:8001)。

### 使用 Docker Compose 运行

1. 准备 `.env` / `.env.production` 并确保 `STUDIO_HOST` 指向对外域名。
2. 构建镜像：
   ```bash
   docker compose build studio worker pdfmath
   ```
3. 启动主要服务：
   ```bash
   docker compose up -d traefik studio worker
   ```
Traefik 会将 80/443 端口映射到 Studio，Milvus/MinIO/Attu 等依赖组件可按需启动。

## 后台服务与任务

- **BullMQ 队列**：Studio 将批翻译、术语抽取、质量评估和文件解析任务推入 Redis，Worker 负责消费并回写结果。
- **Milvus 向量库**：用于翻译记忆与语义检索，需要同步启动 etcd 与 MinIO。
- **MinIO**：存储解析产物、结构化 JSON、静态资源等，可通过 S3 兼容协议访问。
- **PDFMath 服务**：提供 PDF → Markdown/JSON 的解析能力，由 `pdfmath` 容器维护。
- **Attu**：Milvus 官方 UI，便于查询向量、排查记忆数据。

## 目录结构

```
deeptrans-studio/
├── src/
│   ├── app/                      # Next.js App Router 页面
│   │   ├── (app)/                # 业务页面：dashboard / ide / memories 等
│   │   ├── api/                  # Route Handlers（逐步迁移至 Server Actions）
│   │   └── layout.tsx            # 根布局、主题与 providers
│   ├── actions/                  # Server Actions（数据库、AI、文件处理）
│   ├── agents/                   # AI Agent 定义、提示词、i18n
│   ├── components/               # 通用 UI 与业务组件
│   ├── hooks/                    # 自定义 Hook、右侧面板、对话框管理
│   ├── lib/                      # 工具方法（Redis、向量、LLM 客户端）
│   ├── store/                    # Zustand / Redux store 配置
│   ├── db/                       # Prisma client 与 repository 方法
│   ├── types/                    # TypeScript 类型与枚举
│   └── worker/                   # Worker 端入口、任务处理、BullMQ 队列
├── prisma/                       # Prisma schema & migrations
├── scripts/                      # 开发脚本、临时工具
├── public/                       # 静态资源
├── docker-compose.yml            # 开发/部署所需容器编排
└── package.json / tsconfig.*     # 构建配置
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `yarn dev` | 启动 Next.js 开发服务器 |
| `yarn dev:worker` | 在本地启动 Worker（如不使用 Docker） |
| `yarn build` | 构建生产版本 Next.js 应用 |
| `yarn build:worker` | 编译 Worker（esbuild → `dist/worker.cjs`） |
| `yarn start` | 启动生产模式 Next.js |
| `yarn lint` | 运行 ESLint 检查 |
| `yarn prisma studio` | 打开 Prisma Studio GUI |
| `yarn test:segment` / `yarn test:docx` | 针对分段解析 / 文档解析的调试脚本 |
| `yarn queue:ui` | 启动 Bull Board 监控队列（若有配置） |

## 国际化

项目使用 [next-intl](https://next-intl-docs.vercel.app/) 管理多语言文案：

- `src/i18n/en.json` / `zh.json` 为主文案文件。
- 通过 `useTranslations('命名空间')` 获取文案；新增键时请同步维护多语言文件。
- 组件层已增加兜底逻辑以防文案缺失，但正式环境建议完善翻译。

## 贡献指引

1. **分支策略**：`feat/*`、`fix/*`、`chore/*` 等前缀，保持 PR 粒度可控。
2. **代码规范**：遵循 ESLint/Prettier；类型尽量完整，避免滥用 `any`。
3. **提交信息**：推荐 [Conventional Commits](https://www.conventionalcommits.org/) 规范（如 `feat: add translation memory import`）。
4. **代码审查**：提交 PR 前请运行 `yarn lint`、必要的 `test:*` 脚本及数据库迁移检查。
5. **文档更新**：新增/修改模块请同步更新 README、架构图或内网文档。

## 项目说明

- 本仓库由上海大学 CogNLP Lab 开发，用于 ACL Demo Paper（2025）投稿与复现示范。
- 仓库默认不包含生产密钥与敏感配置，若需部署请自建 `.env` 并替换相应服务凭据。
- 如在复现过程中遇到问题，可在 GitHub Issues 或通过论文中提供的联系方式与我们沟通。

---

💡 如对系统有改进建议，欢迎提交 Issue / PR，与我们一起完善智能翻译平台。

**CogNLP Lab, Shanghai University** © 2025
