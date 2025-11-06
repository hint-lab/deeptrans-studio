import pkg from "@prisma/client";
const { PrismaClient } = pkg as unknown as { PrismaClient: new () => any };

declare global {
    // 使用 any 避免类型错误（与 ESM 兼容方式配合）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    var prisma: any | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = globalThis.prisma || new (PrismaClient as any)();

if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = prisma;
}

// Why doing this: https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
// 这种模式主要是为了解决开发环境中 Next.js 热重载导致创建过多 Prisma Client 实例的问题，而在生产环境中，每个服务实例只会创建一个 Prisma Client 实例，没有这个问题。