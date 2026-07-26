//auth.ts
import { findAccountByUserIdDB } from '@/db/account';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { ensureUserTenant } from '@/lib/user-tenant';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { type PrismaClient, type UserRole } from '@prisma/client';
import NextAuth from 'next-auth';

import CredentialsProvider from 'next-auth/providers/credentials';

import { findUserByIdDB, findUserByNormalizedEmailDB, updateUserByIdDB } from './db/user';
import { DEMO_CODE, ensureDemoUser, isDemoAccount } from './lib/demo-user';
// 直接将配置内联在此文件中，不再依赖外部 authConfig
const MAX_AGE = Number(process.env.AUTH_SESSION_MAX_AGE ?? 3600);
const logger = createLogger(
    {
        type: 'auth',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                phone: { label: 'Phone', type: 'text' },
                email: { label: 'Email', type: 'text' },
                code: { label: 'Code', type: 'text' },
            },
            async authorize(credentials) {
                // 同时支持 phone+code 与 email+code
                const { phone, email, code } = credentials as any;
                if (isDemoAccount(email)) {
                    if (code === DEMO_CODE) {
                        return ensureDemoUser();
                    }
                    return null;
                }
                if (process.env.IS_DEMO === 'yes') {
                    return null;
                }
                if (email) {
                    const { consumeEmailVerificationCode, normalizeEmailForVerification } =
                        await import('./db/verificationCode');
                    const normalizedEmail = normalizeEmailForVerification(String(email));
                    const normalizedCode = String(code || '').trim();
                    const user = await findUserByNormalizedEmailDB(normalizedEmail);
                    // Do not consume a registration code unless an account
                    // already exists. The registration flow verifies first,
                    // creates the user, then reaches this final sign-in step.
                    if (
                        !user ||
                        !(await consumeEmailVerificationCode(normalizedEmail, normalizedCode))
                    ) {
                        return null;
                    }
                    await updateUserByIdDB(user.id, { emailVerified: new Date() });
                    return user;
                }
                if (phone) {
                    const { getVerificationCodeByPhone } = await import('./db/verificationCode');
                    const record = await getVerificationCodeByPhone(phone as string);
                    if (!record || record.code !== code) {
                        return null;
                    }
                    const user = await findUserByIdDB(record.phone);
                    return user || null;
                }
                return null;
            },
        }),
    ],
    adapter: PrismaAdapter(prisma as PrismaClient),
    session: {
        strategy: 'jwt',
        maxAge: MAX_AGE,
        updateAge: MAX_AGE / 2,
    },
    pages: {
        signIn: '/auth/login',
        error: '/auth/error',
    },

    events: {
        signIn({ user, account, isNewUser }) {
            logger.info('User signed in', {
                userId: user.id,
                provider: account?.provider,
                isNewUser,
            });
        },

        async linkAccount({ user }) {
            if (user.id) {
                await ensureUserTenant(user.id);
                await updateUserByIdDB(user.id, {
                    emailVerified: new Date(),
                });
            }
        },
    },

    callbacks: {
        async signIn({ user, account }) {
            if (user.id) await ensureUserTenant(user.id);
            if (account?.provider !== 'credentials') {
                return true;
            }
            return true;
        },

        async jwt({ token, user, trigger, session }) {
            // 用户首次登录时，将用户信息存入 token
            if (user) {
                token.id = user.id;
                token.name = user.name;
                token.email = user.email;
                token.isOAuth = !!(await findAccountByUserIdDB(token.id as string));
            }
            if (token.id) {
                const freshUser = await findUserByIdDB(token.id as string);
                token.role = freshUser?.role;
                token.tenantId = freshUser?.tenantId;
            }
            token.expires = Math.floor(Date.now() / 1000) + MAX_AGE; // ← 统一变量
            // 当用户更新个人信息时，刷新 token
            if (trigger === 'update' && session) {
                token = { ...token, ...session };
                // 可以在这里添加其他需要更新的字段
            }
            // 检查 JWT 是否过期
            if (token.expires && Date.now() / 1000 > (token.expires as number)) {
                return { ...token, expired: true };
            }
            return token;
        },

        async session({ session, token }) {
            if (token.sub) session.user.id = token.sub;
            if (token.role) session.user.role = token.role as UserRole;
            if (token.tenantId) (session.user as any).tenantId = token.tenantId as string;
            if (token.name) session.user.name = token.name;
            if (token.email) session.user.email = token.email as string;
            /* 统一过期字段 */
            (session as any).expires = token.expires
                ? new Date((token.expires as number) * 1000).toISOString()
                : new Date(Date.now() + MAX_AGE * 1000).toISOString();

            if (token.expired) (session as any).expires = new Date().toISOString();
            return session;
        },
    },
});
