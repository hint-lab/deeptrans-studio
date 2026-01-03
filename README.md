<div align="center">
  <img src="public/logo.svg" alt="DeepTrans Studio" width="120" height="120">
  
  # DeepTrans Studio
  
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

## ✨ Key Features

### 🎯 Translation IDE
- **Intelligent Editor**: Segment-aligned parallel editing with version control and keyboard shortcuts
- **Multi-Agent Collaboration**: Coordinate multiple AI agents for complex translation tasks
- **Real-time Preview**: Instant document preview with formatting preservation

### 🤖 AI-Powered Translation
- **Multi-Engine Support**: Integration with OpenAI and custom AI models
- **Terminology Extraction**: Automated domain-specific term extraction
- **Quality Assessment**: AI-driven grammar, syntax, and discourse evaluation
- **Translation Memory**: Vector-based semantic search using Milvus

### 📚 Knowledge Management
- **Project Dictionaries**: Project-specific terminology databases
- **Translation Memory**: Import/export translation memory in TMX, CSV, XLSX formats
- **Semantic Search**: Vector similarity search powered by Milvus
- **Visual Management**: Attu UI for vector database inspection

### 🔄 Workflow Automation
- **Queue-Based Processing**: BullMQ-driven asynchronous task processing
- **Batch Operations**: Bulk translation, evaluation, and quality checks
- **Document Parsing**: PDF, DOCX, XLSX document parsing with PDFMath service
- **Status Tracking**: Complete translation lifecycle management

### 🔌 Extensibility
- **Open Architecture**: Modular design with MinIO, Milvus, Redis integration
- **API Gateway**: RESTful APIs for external integration
- **Custom Agents**: Extensible AI agent framework
- **Plugin System**: Support for custom translation engines and processing pipelines

## 🏗️ Architecture

DeepTrans Studio adopts a modern full-stack architecture based on Next.js App Router with distributed queue processing:

```mermaid
graph TD
    Browser[Web Browser] -->|HTTPS| Traefik[Traefik Proxy]
    Traefik -->|HTTP 3000| Studio[Next.js Studio]
    Traefik --> Attu[Attu UI]
    Studio -->|Server Actions| Postgres[(PostgreSQL)]
    Studio -->|Task Queue| Redis[(Redis)]
    Studio -->|API Calls| PDFMath[PDFMath Service]
    Worker[Worker Service] -->|Consume Tasks| Redis
    Worker -->|ORM| Postgres
    Worker -->|Vector Ops| Milvus[(Milvus)]
    Worker -->|Object Storage| MinIO[(MinIO)]
    Milvus --> etcd[(etcd)]
```

### Core Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Studio** | Next.js 15, React 19, TypeScript | Frontend UI, Server Actions, Authentication |
| **Worker** | Node.js, BullMQ | Background job processing, batch operations |
| **Database** | PostgreSQL, Prisma 6 | Relational data storage and ORM |
| **Cache** | Redis | Session management, task queues |
| **Vector DB** | Milvus + etcd | Semantic search, translation memory |
| **Storage** | MinIO (S3-compatible) | Document and asset storage |
| **Parser** | PDFMath Service | PDF and mathematical document parsing |
| **Gateway** | Traefik | Reverse proxy, SSL/TLS termination |

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
REDIS_URL="redis://127.0.0.1:6379"

# Authentication & Site
AUTH_SECRET="your-secret-key-here"  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
NODE_ENV=development

# AI Service Configuration
OPENAI_API_KEY="sk-xxxx"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_API_MODEL="gpt-4o-mini"

# Object Storage
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=deeptrans

# Services
STUDIO_HOST=localhost

# Optional: GitHub OAuth, SMTP, etc.
# GITHUB_ID=your-github-oauth-id
# GITHUB_SECRET=your-github-oauth-secret
```

> 💡 **Security Note**: For production deployments, use dedicated instances for databases and properly secure all credentials.

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
# Start all services
docker compose up -d db redis etcd milvus minio pdfmath worker

# Start Next.js development server
yarn dev

# Access the application at http://localhost:3000
```

**Option 2: Local Services**

```bash
# Start Next.js dev server
yarn dev

# In another terminal, start worker
yarn dev:worker
```

Additional UIs:
- **Studio**: http://localhost:3000
- **Attu (Milvus UI)**: http://localhost:8001
- **Prisma Studio**: Run `yarn prisma studio`

### Production Deployment

```bash
# Configure environment
cp .env.example .env.production
# Edit .env.production with production values

# Build images
docker compose build studio worker pdfmath

# Deploy services
docker compose up -d traefik studio worker db redis milvus minio

# Services will be available on configured domain with SSL via Traefik
```

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

| Command | Description |
|---------|-------------|
| `yarn dev` | Start Next.js development server with hot reload |
| `yarn dev:worker` | Start worker service locally (if not using Docker) |
| `yarn build` | Build production Next.js application |
| `yarn build:worker` | Compile worker service (esbuild → dist/worker.cjs) |
| `yarn start` | Start production Next.js server |
| `yarn lint` | Run ESLint code quality checks |
| `yarn type-check` | Run TypeScript type checking |
| `yarn prisma studio` | Open Prisma Studio database GUI |
| `yarn prisma generate` | Generate Prisma Client |
| `yarn db:push` | Push schema changes to database |
| `yarn db:seed` | Seed database with sample data |
| `yarn test:segment` | Test segmentation parsing |
| `yarn test:docx` | Test document parsing |
| `yarn queue:ui` | Launch Bull Board queue monitoring |

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
- [Milvus](https://milvus.io/) - Vector database
- [BullMQ](https://docs.bullmq.io/) - Job queues
- [MinIO](https://min.io/) - Object storage
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
