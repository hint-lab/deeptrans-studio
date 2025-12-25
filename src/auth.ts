//auth.ts
import { findAccountByUserIdDB } from '@/db/account';
import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { type PrismaClient, type UserRole } from '@prisma/client';
import NextAuth from 'next-auth';

import CredentialsProvider from 'next-auth/providers/credentials';
import Github from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { findUserByEmailDB, findUserByIdDB, updateUserByIdDB } from './db/user';
import { getVerificationCodeByEmail, getVerificationCodeByPhone } from './db/verificationCode';
// 直接将配置内联在此文件中，不再依赖外部 authConfig
const MAX_AGE = Number(process.env.AUTH_SESSION_MAX_AGE ?? 3600);
const logger = createLogger({
    type: 'auth',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Github({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
        }),
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            allowDangerousEmailAccountLinking: true,
        }),
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
                if (process.env.IS_DEMO === 'yes') {
                    if (code === '123456' && email === 'test@example.com') {
                        const user = await findUserByEmailDB(email as string);
                        return user || null;
                    } else {
                        return null;
                    }
                } else {
                    if (email) {
                        const record = await getVerificationCodeByEmail(email as string);
                        if (!record || record.code !== code) {
                            return null;
                        }
                        const user = await findUserByEmailDB(email as string);
                        return user || null;
                    }
                    if (phone) {
                        const record = await getVerificationCodeByPhone(phone as string);
                        if (!record || record.code !== code) {
                            return null;
                        }
                        const user = await findUserByIdDB(record.phone);
                        return user || null;
                    }
                    return null;
                }
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
        signIn({ user, account, profile, isNewUser }) {
            logger.info('User: ', user, 'Account: ', account, 'Profile: ', profile, 'isNewUser: ', isNewUser);
        },

        async linkAccount({ user }) {
            if (user.id) {
                await updateUserByIdDB(user.id, {
                    emailVerified: new Date(),
                });
            }
        },
    },

    callbacks: {
        async signIn({ user, account }) {
            if (account?.provider !== 'credentials') {
                return true;
            }
            return true;
        },

        async jwt({ token, account, user, profile, trigger, session }) {
            if (account) {
                token.accessToken = account.access_token;
                token.id = profile?.id;
                logger.debug('JWT token:', token);
            }
            // 用户首次登录时，将用户信息存入 token
            if (user) {
                token.id = user.id;
                token.name = user.name;
                token.email = user.email;
                token.isOAuth = !!(await findAccountByUserIdDB(token.id as string));
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
            if (token.name) session.user.name = token.name;
            if (token.email) session.user.email = token.email as string;
            //session.accessToken = token.accessToken as string;
            /* 统一过期字段 */
            (session as any).expires = token.expires
                ? new Date((token.expires as number) * 1000).toLocaleString()
                : new Date(Date.now() + MAX_AGE * 1000).toLocaleString();

            if (token.expired) (session as any).expires = new Date().toLocaleString();
            return session;
        },
    },
});
