# 构建阶段 - 使用完整版 Node 而非 Alpine
FROM node:20-slim AS builder
WORKDIR /app 

# 安装yarn（如果镜像中没有）
RUN corepack enable && \
    corepack prepare yarn@1.22.22 \
    --activate && \
    yarn config set registry https://registry.npmmirror.com

# 复制 package.json 和 yarn.lock
COPY package.json yarn.lock* ./

# 创建 prisma 目录
RUN mkdir -p prisma

# 复制 prisma 目录
COPY prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl libssl-dev
# 使用yarn安装（与本地一致）
RUN yarn install --frozen-lockfile --production=false
# 手动运行 prisma generate（如果 schema.prisma 存在）
RUN if [ -f ./prisma/schema.prisma ]; then npx prisma generate; fi

# 复制源代码
COPY . .

# 使用更高效的构建选项
RUN yarn build

# 用于一次性生产迁移；保留完整 Prisma CLI 与 migrations，不进入应用运行镜像。
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]

# 生产阶段
FROM node:20-slim AS runner
WORKDIR /app

# 安装 OpenSSL (Prisma 需要)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 设置环境变量
ENV NODE_ENV production

# 复制 standalone 目录
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 复制 Prisma 生成的客户端
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 暴露端口
EXPOSE 3000

# This confirms that the Next.js Web process can serve a request. It is not a
# database, object-storage, queue, or Worker readiness claim.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

# 启动应用
CMD ["node", "server.js"]
