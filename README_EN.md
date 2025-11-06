# DeepTrans Studio · Intelligent Translation Workbench

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1-149eca?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.1-2D3748?logo=prisma)](https://prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 🚀 DeepTrans Studio is an intelligent translation platform designed for professional translation and localization teams, offering end-to-end capabilities including Translation IDE, terminology management, translation memory, quality assessment, and automated workflows.

**Developed by**: [CogNLP Lab](https://hint-lab.github.io/people/wang_hao/), Shanghai University

[中文文档](./README.md) | **English**

---

## 📚 Table of Contents

- [Introduction](#introduction)
- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Database Initialization](#database-initialization)
  - [Local Development](#local-development)
  - [Docker Compose Deployment](#docker-compose-deployment)
- [Background Services](#background-services)
- [Directory Structure](#directory-structure)
- [Common Scripts](#common-scripts)
- [Internationalization](#internationalization)
- [Contributing](#contributing)
- [About](#about)

---

## Introduction

DeepTrans Studio integrates AI translation, localization engineering, and team collaboration capabilities into a unified platform. The system is built around the complete translation project lifecycle, including:

- Multi-scenario translation workbench (IDE, instant translation, batch operations)
- Domain-specific dictionaries, translation memory, and knowledge base
- AI-assisted quality assessment, terminology extraction, and discourse review
- Workflow automation and queue-based task processing
- Unified authentication, logging, operational configuration, and external APIs

## Core Features

- **Translation IDE**: Provides segment alignment, version tracking, keyboard shortcuts, and multi-agent collaborative translation workbench.
- **AI Assistance**: Built-in translation, terminology extraction, grammar/discourse evaluation, word counting, and multi-engine comparison.
- **Terminology & Memory**: Supports project/personal dictionaries, translation memory import/export, Milvus vector retrieval, and Attu visualization.
- **Project Management**: Full project lifecycle, file segmentation, status transitions, document preview, and task distribution.
- **Automated Workflows**: BullMQ queue-driven workers handle batch translation, evaluation, document parsing, vector writing, and other time-consuming tasks.
- **Open & Extensible**: Extensible with custom AI services, reports, or external integrations through MinIO, Milvus, Redis, and other components.

## System Architecture

The platform adopts a unified Next.js App Router architecture, combined with queue and service components to form the following structure:

- **Studio (Next.js App)**: Handles frontend UI, Server Actions, NextAuth authentication, and API gateway capabilities.
- **Worker (Node Service)**: Interacts with BullMQ/Redis, responsible for batch processing, embedding generation, vector writing, and task scheduling.
- **PDFMath Service**: Handles PDF/mathematical document parsing, called by Studio and Worker.
- **Traefik**: Reverse proxy and certificate management, unified exposure of Studio, Attu, and other sub-services.
- **Supporting Components**: PostgreSQL, Redis, Milvus (with etcd), MinIO, Attu UI.

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

## Tech Stack

| Module | Technology |
| --- | --- |
| Application Framework | Next.js 15 (App Router), React 19, TypeScript 5 |
| Backend Capabilities | Next.js Server Actions, Prisma 6, NextAuth, BullMQ |
| Data Storage | PostgreSQL, Redis, Milvus + etcd, MinIO |
| AI Capabilities | OpenAI-compatible API, Self-developed PDFMath Service, AI Agents |
| Build & Tools | Yarn 1, corepack, Docker Compose, Traefik, ESLint, Prettier |

## Quick Start

### Prerequisites

- **Node.js** ≥ 18.18 (recommended to use `corepack` to manage Yarn 1.22.22)
- **Yarn** (enabled via `corepack enable`)
- **Docker / Docker Compose** (for local dependency services or one-click deployment)
- **Git** and other common tools

### Installation

```bash
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
```

### Environment Configuration

Copy or create `.env.local` and fill in according to your actual environment:

```dotenv
# Database & Cache
DATABASE_URL="postgresql://postgres:123456@localhost:5432/deeptrans"
REDIS_URL="redis://127.0.0.1:6379"

# Authentication & Site Configuration
AUTH_SECRET="please_generate_random_string"
NEXTAUTH_URL="http://localhost:3000"
NODE_ENV=development

# LLM / AI Services
OPENAI_API_KEY="sk-xxxx"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_API_MODEL="gpt-4o-mini"

# Object Storage & Resources
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=deeptrans

# Other Services
STUDIO_HOST=localhost        # Used for Traefik/HTTPS deployment

# Optional: GitHub OAuth, SMTP, Milvus access info, etc.
```

> 💡 For production environments, please use dedicated instances for database, Redis, Milvus, and object storage, and properly secure credentials.

### Database Initialization

```bash
yarn prisma migrate deploy      # Or yarn db:push to initialize structure
yarn prisma generate            # Generate Prisma Client
yarn db:seed                    # Optional: Import sample data
```

### Local Development

1. Start dependency services (recommended to use services in Docker Compose):
   ```bash
   docker compose up -d db redis etcd milvus minio pdfmath worker
   # Add attu traefik if needed
   ```
2. Start Next.js application (hot reload):
   ```bash
yarn dev
   ```
3. If you want to run Worker in local Node environment, execute `yarn dev:worker` (by default runs through compose's `worker` container).

Visit [http://localhost:3000](http://localhost:3000) to enter Studio; Attu (Milvus UI) is exposed at [http://localhost:8001](http://localhost:8001) by default.

### Docker Compose Deployment

1. Prepare `.env` / `.env.production` and ensure `STUDIO_HOST` points to the external domain.
2. Build images:
   ```bash
   docker compose build studio worker pdfmath
   ```
3. Start main services:
   ```bash
   docker compose up -d traefik studio worker
   ```
Traefik will map ports 80/443 to Studio, and dependent components like Milvus/MinIO/Attu can be started as needed.

## Background Services

- **BullMQ Queues**: Studio pushes batch translation, terminology extraction, quality assessment, and file parsing tasks to Redis, consumed by Worker with results written back.
- **Milvus Vector Database**: Used for translation memory and semantic retrieval, requires synchronous startup of etcd and MinIO.
- **MinIO**: Stores parsing artifacts, structured JSON, static resources, etc., accessible via S3-compatible protocol.
- **PDFMath Service**: Provides PDF → Markdown/JSON parsing capability, maintained by `pdfmath` container.
- **Attu**: Official Milvus UI for querying vectors and troubleshooting memory data.

## Directory Structure

```
deeptrans-studio/
├── src/
│   ├── app/                      # Next.js App Router pages
│   │   ├── (app)/                # Business pages: dashboard / ide / memories, etc.
│   │   ├── api/                  # Route Handlers (gradually migrating to Server Actions)
│   │   └── layout.tsx            # Root layout, theme, and providers
│   ├── actions/                  # Server Actions (database, AI, file processing)
│   ├── agents/                   # AI Agent definitions, prompts, i18n
│   ├── components/               # Common UI and business components
│   ├── hooks/                    # Custom hooks, side panels, dialog management
│   ├── lib/                      # Utility methods (Redis, vectors, LLM clients)
│   ├── store/                    # Zustand / Redux store configuration
│   ├── db/                       # Prisma client and repository methods
│   ├── types/                    # TypeScript types and enums
│   └── worker/                   # Worker entry, task processing, BullMQ queues
├── prisma/                       # Prisma schema & migrations
├── scripts/                      # Development scripts, temporary tools
├── public/                       # Static resources
├── docker-compose.yml            # Container orchestration for dev/deployment
└── package.json / tsconfig.*     # Build configuration
```

## Common Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Start Next.js development server |
| `yarn dev:worker` | Start Worker locally (if not using Docker) |
| `yarn build` | Build production version of Next.js app |
| `yarn build:worker` | Compile Worker (esbuild → `dist/worker.cjs`) |
| `yarn start` | Start production mode Next.js |
| `yarn lint` | Run ESLint checks |
| `yarn prisma studio` | Open Prisma Studio GUI |
| `yarn test:segment` / `yarn test:docx` | Debug scripts for segmentation / document parsing |
| `yarn queue:ui` | Start Bull Board to monitor queues (if configured) |

## Internationalization

The project uses [next-intl](https://next-intl-docs.vercel.app/) to manage multilingual content:

- `src/i18n/en.json` / `zh.json` are the main content files.
- Use `useTranslations('namespace')` to get content; synchronize multilingual files when adding new keys.
- Component layer has fallback logic to prevent missing content, but formal environments should complete translations.

## Contributing

1. **Branch Strategy**: Use prefixes like `feat/*`, `fix/*`, `chore/*`, keep PR granularity manageable.
2. **Code Standards**: Follow ESLint/Prettier; keep types complete, avoid overusing `any`.
3. **Commit Messages**: Recommend [Conventional Commits](https://www.conventionalcommits.org/) format (e.g., `feat: add translation memory import`).
4. **Code Review**: Run `yarn lint`, necessary `test:*` scripts, and database migration checks before submitting PR.
5. **Documentation Updates**: Update README, architecture diagrams, or internal documentation when adding/modifying modules.

## About

- This repository is developed by CogNLP Lab at Shanghai University for ACL Demo Paper (2025) submission and reproduction demonstration.
- The repository does not include production keys and sensitive configurations by default. For deployment, create your own `.env` and replace service credentials.
- If you encounter issues during reproduction, please communicate via GitHub Issues or contact information provided in the paper.

---

💡 If you have suggestions for improvement, welcome to submit Issues / PRs to help us improve the intelligent translation platform together.

**CogNLP Lab, Shanghai University** © 2025

