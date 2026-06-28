<div align="center">
  <img src="public/logo.svg" alt="DeepTrans Studio" width="240" height="240">
  
  <!-- # DeepTrans Studio -->
  
  ### Professional AI-Powered Translation Workbench
  
  [![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=nextdotjs)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19.1-149eca?logo=react)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
  [![Prisma](https://img.shields.io/badge/Prisma-6.1-2D3748?logo=prisma)](https://prisma.io/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  
  [English](#) | [中文](./README_ZH.md)
  
</div>

---

## 🌟 Overview

**DeepTrans Studio** is an enterprise-grade translation platform that combines AI-powered translation, localization engineering, and team collaboration capabilities. Built for professional translators and localization teams, it provides comprehensive end-to-end translation workflow management.

<div align="center">
  <img src="public/ui.png" alt="DeepTrans Studio Interface" width="900">
  <br/>
  <em>DeepTrans Studio User Interface</em>
</div>

## 📝 Citation

DeepTrans Studio and its document translation stack are described in our ACL '26 System Demonstrations and CSCW '26 Companion Demo papers. If you use this project in academic work, please cite:

> Yang Qi, Xiangyao Ma, Xiao Wang, Hao Wang, and Rui Wang. 2026. [BabelDOC: Better Layout-Preserving PDF Translation via Intermediate Representation](https://aclanthology.org/2026.acl-demo.25/). In _Proceedings of the 64th Annual Meeting of the Association for Computational Linguistics (Volume 3: System Demonstrations)_, pages 253-262, San Diego, California, United States. Association for Computational Linguistics.

> Ziyang Lian, Qingya Zhang, Hao Wang, Huiwen Xiong, Qi Yang, Lingyi Meng, Xiaoyi Gu, and Rui Wang. 2026. DeepTrans Studio: Turning Expert Interventions into Shared Team Knowledge in Agentic Translation Workflows. In _Proceedings of Companion of the 2026 Computer-Supported Cooperative Work and Social Computing (CSCW '26 Demo, CCF-A)_. ACM, New York, NY, USA, 4 pages. DOI forthcoming.

```bibtex
@inproceedings{qi-etal-2026-babeldoc,
  title = {{B}abel{DOC}: Better Layout-Preserving {PDF} Translation via Intermediate Representation},
  author = {Qi, Yang and Ma, Xiangyao and Wang, Xiao and Wang, Hao and Wang, Rui},
  editor = {Durrett, Greg and Jian, Ping},
  booktitle = {Proceedings of the 64th Annual Meeting of the Association for Computational Linguistics (Volume 3: System Demonstrations)},
  month = jul,
  year = {2026},
  address = {San Diego, California, United States},
  publisher = {Association for Computational Linguistics},
  url = {https://aclanthology.org/2026.acl-demo.25/},
  pages = {253--262},
  ISBN = {979-8-89176-392-0}
}

@inproceedings{lian2026deeptrans,
  title = {DeepTrans Studio: Turning Expert Interventions into Shared Team Knowledge in Agentic Translation Workflows},
  author = {Lian, Ziyang and Zhang, Qingya and Wang, Hao and Xiong, Huiwen and Yang, Qi and Meng, Lingyi and Gu, Xiaoyi and Wang, Rui},
  booktitle = {Proceedings of Companion of the 2026 Computer-Supported Cooperative Work and Social Computing (CSCW '26)},
  publisher = {ACM},
  address = {New York, NY, USA},
  year = {2026},
  pages = {4},
  note = {Demo paper; DOI forthcoming}
}
```

## ✨ Key Features

### 🎯 Translation IDE

- **Intelligent Editor**: Segment-aligned parallel editing with version control and keyboard shortcuts
- **Multi-Agent Collaboration**: Coordinate multiple AI agents for complex translation tasks
- **Real-time Preview**: Instant document preview with formatting preservation

### 🤖 AI-Powered Translation

- **Multi-Engine Support**: Integration with OpenAI and custom AI models
- **Terminology Extraction**: Automated domain-specific term extraction
- **Quality Assessment**: AI-driven grammar, syntax, and discourse evaluation
- **Translation Memory**: Vector search with pgvector and CJK keyword search with PGroonga

### 📚 Knowledge Management

- **Project Dictionaries**: Project-specific terminology databases
- **Translation Memory**: Import/export translation memory in TMX, CSV, XLSX formats
- **Semantic Search**: Vector similarity search powered by pgvector, with PGroonga keyword retrieval

### 🔄 Workflow Automation

- **Queue-Based Processing**: BullMQ-driven asynchronous task processing
- **Batch Operations**: Bulk translation, evaluation, and quality checks
- **Document Parsing**: DOCX, PDF, TXT, and Markdown parsing with MinerU online PDF parsing
- **Status Tracking**: Complete translation lifecycle management

### 🔌 Extensibility

- **Open Architecture**: Modular design with PostgreSQL, Valkey, and pluggable object storage
- **API Gateway**: RESTful APIs for external integration
- **Custom Agents**: Extensible AI agent framework
- **Plugin System**: Support for custom translation engines and processing pipelines

## 🏗️ Architecture

DeepTrans Studio adopts a modern full-stack architecture based on Next.js App Router with distributed queue processing:

```mermaid
graph TD
    Browser[Web Browser] -->|HTTPS| Traefik[Traefik Proxy]
    Traefik -->|HTTP 3000| Studio[Next.js Studio]
    Studio -->|Server Actions| Postgres[(PostgreSQL)]
    Studio -->|Task Queue| Valkey[(Valkey)]
    Studio -->|Parse Requests| Parser[Built-in Parsers]
    Worker[Worker Service] -->|Consume Tasks| Valkey
    Worker -->|ORM| Postgres
    Worker -->|Vector Ops| Postgres
    Worker -->|Object Storage Interface| Storage[(MinIO / Tencent COS)]
```

### Core Components

| Component    | Technology                                             | Purpose                                                     |
| ------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| **Studio**   | Next.js 15, React 19, TypeScript                       | Frontend UI, Server Actions, Authentication                 |
| **Worker**   | Node.js, BullMQ                                        | Background job processing, batch operations                 |
| **Database** | PostgreSQL 18, pgvector, PGroonga, Prisma 6            | Relational data, vector search, CJK keyword search, and ORM |
| **Cache**    | Valkey                                                 | Redis-protocol cache, session state, task queues            |
| **Storage**  | StorageService interface, MinIO, Tencent COS           | Document and asset storage                                  |
| **Parser**   | DOCX XML parser, MinerU online PDF parser, text parser | Document parsing for DOCX, PDF, TXT, and Markdown           |
| **Gateway**  | Traefik                                                | Reverse proxy, SSL/TLS termination                          |

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.18 (Recommended: use `corepack` to manage Yarn 1.22.22)
- **Yarn** (Enable via `corepack enable`)
- **Docker** & **Docker Compose** (For services and deployment)
- **Git**

### Installation

```bash
# Enable corepack and setup Yarn
corepack enable
corepack prepare yarn@1.22.22 --activate

# Install dependencies
yarn install
```

### Environment Configuration

Create `.env.local` file with the following configuration:

```env
# Database & Cache
DATABASE_URL="postgresql://postgres:password@localhost:5432/deeptrans"
REDIS_URL="redis://valkey:6379"

# Authentication & Site
AUTH_SECRET="your-secret-key-here"  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
NODE_ENV=development

# AI Service Configuration
OPENAI_API_KEY="sk-xxxx"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_API_MODEL="gpt-4o-mini"

# Dedicated chat/translation LLM config. Falls back to OPENAI_* when unset.
# LLM_API_KEY="sk-xxxx"
# LLM_BASE_URL="https://api.openai.com/v1"
# LLM_MODEL="gpt-4o-mini"

# Embedding provider. EMBEDDING_* falls back to OPENAI_* when unset.
OPENAI_EMBED_MODEL=doubao-embedding-text-240715
# EMBEDDING_API_KEY="sk-xxxx"
# EMBEDDING_BASE_URL="https://api.openai.com/v1"
# EMBEDDING_API_PATH="/embeddings"
# EMBEDDING_MODEL="doubao-embedding-text-240715"
# EMBEDDING_DIMENSIONS=

# MinerU online PDF parser
MINERU_API_MODE=agent
MINERU_AGENT_BASE_URL=https://mineru.net/api/v1/agent
MINERU_API_BASE_URL=https://mineru.net/api/v4
# MINERU_API_TOKEN="token-for-standard-or-precise-mode"
MINERU_MODEL_VERSION=vlm
MINERU_LANGUAGE=ch
MINERU_IS_OCR=false
MINERU_ENABLE_TABLE=true
MINERU_ENABLE_FORMULA=true
MINERU_TIMEOUT_MS=300000
MINERU_POLL_INTERVAL_MS=3000
# MINERU_PAGE_RANGE=1-20
# MINERU_DISABLE=false

# Object Storage: choose MinIO or Tencent COS
STORAGE_TYPE=minio
STORAGE_ENDPOINT=localhost
STORAGE_PORT=9000
STORAGE_USE_SSL=false
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=deeptrans

# Tencent COS example
# STORAGE_TYPE=cos
# COS_SECRET_ID=AKIDxxxxxxxx
# COS_SECRET_KEY=xxxxxxxx
# COS_BUCKET=deeptrans-1250000000
# COS_REGION=ap-guangzhou

# Services
STUDIO_HOST=localhost

# Optional: SMTP, etc.
# EMAIL_SERVER=smtps://deeptrans_studio%40163.com:<your-163-authorization-code>@smtp.163.com:465
# EMAIL_FROM="DeepTrans Studio <deeptrans_studio@163.com>"
```

> 💡 **Production note**: The default database image is PostgreSQL 18 with pgvector and PGroonga. PGroonga is required for CJK keyword search. Production object storage uses Tencent COS; MinIO is only started by the local development compose file.
> PDF parsing uses the MinerU online parser by default. `MINERU_API_MODE=agent` uses the lightweight agent endpoint without a token; `standard`/`precise` uses the token-based v4 endpoint. Set `MINERU_DISABLE=true` only when you intentionally want local PDF text extraction.

### Database Setup

```bash
# Run database migrations
yarn prisma migrate deploy

# Generate Prisma Client
yarn prisma generate

# (Optional) Seed with sample data
yarn db:seed
```

### Development Mode

**Option 1: Using Docker Compose (Recommended)**

```bash
# Start dependency services
docker compose up -d db valkey minio

# Start Next.js development server
yarn dev

# Access the application at http://localhost:3000
```

**Option 2: Local Services**

```bash
# Start Next.js dev server
yarn dev

# In another terminal, start worker
yarn worker
```

Additional UIs:

- **Studio**: http://localhost:3000
- **Prisma Studio**: Run `yarn prisma studio`

### Production Deployment

```bash
# Configure environment
cp .env.example .env.production
# Edit .env.production with production values
#
# Required object storage settings for production:
# STORAGE_TYPE=cos
# COS_SECRET_ID=AKIDxxxxxxxx
# COS_SECRET_KEY=xxxxxxxx
# COS_BUCKET=deeptrans-1250000000
# COS_REGION=ap-guangzhou

# Build images, including PostgreSQL 18 + pgvector + PGroonga
docker compose -f docker-compose-prod.yml build db app app_worker

# Deploy production services. MinIO is intentionally not started in production.
docker compose -f docker-compose-prod.yml up -d traefik app app_worker db valkey

# Services will be available on configured domain with SSL via Traefik
```

Production service set:

- `db`: PostgreSQL 18 with pgvector and PGroonga
- `valkey`: Redis-protocol cache and BullMQ runtime
- `app`: DeepTrans Studio web application
- `app_worker`: background worker
- `traefik`: HTTPS reverse proxy
- Tencent COS: external object storage configured through environment variables

## 📁 Project Structure

```
deeptrans-studio/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (app)/              # Main application pages
│   │   ├── api/                # API routes (migrating to Server Actions)
│   │   └── layout.tsx          # Root layout and providers
│   ├── actions/                # Server Actions (database, AI, files)
│   ├── agents/                 # AI agent definitions and prompts
│   ├── components/             # Reusable UI components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utility functions and clients
│   ├── store/                  # State management (Zustand)
│   ├── db/                     # Database client and repositories
│   ├── types/                  # TypeScript type definitions
│   └── worker/                 # Background worker tasks
├── prisma/                     # Database schema and migrations
│   ├── schema.prisma           # Prisma schema definition
│   └── migrations/             # Database migration files
├── scripts/                    # Development and utility scripts
├── public/                     # Static assets
├── docker-compose.yml          # Docker services orchestration
├── Dockerfile                  # Container image definition
└── package.json                # Project dependencies
```

## 🛠️ Available Scripts

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `yarn dev`          | Start Next.js development server with hot reload   |
| `yarn worker`       | Start worker service locally (if not using Docker) |
| `yarn build`        | Build production Next.js application               |
| `yarn build:worker` | Compile worker service (esbuild → dist/worker.cjs) |
| `yarn start`        | Start production Next.js server                    |
| `yarn lint`         | Run ESLint code quality checks                     |
| `yarn type-check`   | Run TypeScript type checking                       |
| `yarn db:studio`    | Open Prisma Studio database GUI                    |
| `yarn db:migrate`   | Run database migrations                            |
| `yarn db:push`      | Push schema changes to database                    |
| `yarn db:seed`      | Seed database with sample data                     |
| `yarn test:docx`    | Test document parsing                              |
| `yarn queue:ui`     | Launch Bull Board queue monitoring                 |

## 🌍 Internationalization

DeepTrans Studio uses [next-intl](https://next-intl-docs.vercel.app/) for internationalization:

- Translation files: `src/i18n/en.json`, `src/i18n/zh.json`
- Usage: `useTranslations('namespace')` hook
- Supported languages: English, Chinese (extendable)

When adding new translations, ensure all language files are updated consistently.

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Branch Strategy

- `feat/*` - New features
- `fix/*` - Bug fixes
- `chore/*` - Maintenance tasks
- `docs/*` - Documentation updates

### Development Workflow

1. **Fork & Clone**: Fork the repository and clone your fork
2. **Create Branch**: Create a feature branch from `main`
3. **Code Changes**: Make your changes following our coding standards
4. **Quality Checks**: Run linting and type checking
    ```bash
    yarn lint
    yarn type-check
    ```
5. **Commit**: Use [Conventional Commits](https://www.conventionalcommits.org/) format
    ```
    feat: add translation memory import
    fix: resolve authentication bug
    docs: update installation guide
    ```
6. **Pull Request**: Submit PR with clear description

### Code Standards

- Follow ESLint and Prettier configurations
- Write TypeScript with proper types (avoid `any`)
- Add JSDoc comments for complex functions
- Write unit tests for new features
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with modern technologies:

- [Next.js](https://nextjs.org/) - React framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [pgvector](https://github.com/pgvector/pgvector) - PostgreSQL vector search
- [PGroonga](https://pgroonga.github.io/) - CJK-capable PostgreSQL full-text search
- [BullMQ](https://docs.bullmq.io/) - Job queues
- [MinIO](https://min.io/) / Tencent COS - Object storage
- [Traefik](https://traefik.io/) - Reverse proxy

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/deeptrans-studio/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/deeptrans-studio/discussions)
- **Documentation**: Check the `/docs` folder for detailed guides

---

<div align="center">
  
  Made with ❤️ for professional translators and localization teams
  
  ⭐ Star us on GitHub if you find this project useful!
  
</div>
