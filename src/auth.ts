import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

import { type UserRole } from "@prisma/client";
import { findAccountByUserIdDB } from "@/db/account";

import Github from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

import { LoginSchema } from "./schemes";
import { findUserByIdDB, findUserByEmailDB, updateUserByIdDB } from "./db/user";
import { getVerificationCodeByPhone, getVerificationCodeByEmail } from "./db/verificationCode";
////////////////////////////////////////////

// 直接将配置内联在此文件中，不再依赖外部 authConfig
export const {
    handlers,
    signIn,
    signOut,
    auth
} = NextAuth({
    providers: [  // 添加 providers 数组
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
            name: "Credentials",
            credentials: {
                phone: { label: "Phone", type: "text" },
                email: { label: "Email", type: "text" },
                code: { label: "Code", type: "text" },
            },
            async authorize(credentials) {
                // 同时支持 phone+code 与 email+code
                const { phone, email, code } = credentials as any;

                // 优先走 email 登录（若传入了 email）
                if (email) {
                    // Demo 账户允许使用固定验证码
                    if (code === "123456" && email === "test@example.com") {
                        const user = await findUserByEmailDB(email as string);
                        return user || null;
                    }
                    if (process.env.NODE_ENV === "development" && code === "123456") {
                        const user = await findUserByEmailDB(email as string);
                        return user || null;
                    }
                    const record = await getVerificationCodeByEmail(email as string);
                    if (!record || record.code !== code) {
                        return null;
                    }
                    const user = await findUserByEmailDB(email as string);
                    return user || null;
                }

                // 否则走 phone 登录
                if (!phone) return null;

                if (process.env.NODE_ENV === "development" && code === "123456") {
                    const user = await findUserByEmailDB(phone as string);
                    return user || null;
                }

                const verificationCode = await getVerificationCodeByPhone(phone as string);
                if (!verificationCode || verificationCode.code !== code) {
                    return null;
                }

                const user = await findUserByEmailDB(phone as string);
                return user || null;
            },
        }),
    ],
    adapter: PrismaAdapter(prisma as PrismaClient),
    session: {
        strategy: "jwt",
    },
    // 自定义页面配置
    pages: {
        signIn: "/auth/login",
        error: "/auth/error",
    },

    events: {
        signIn({ user, account, profile, isNewUser }) {
            console.log("User: ", user);
            console.log("Account: ", account);
            console.log("Profile: ", profile);
            console.log("isNewUser: ", isNewUser);
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
            // OAuth 直接通过
            if (account?.provider !== "credentials") {
                return true;
            }
            // credentials 登录已在 authorize 校验通过，这里直接允许
            return true;
        },

        async jwt({ token }) {
            // JWT 处理逻辑不变
            if (!token.sub) {
                return token;
            }

            const existingUser = await findUserByIdDB(token.sub);
            if (!existingUser) {
                return token;
            }

            const existingAccount = await findAccountByUserIdDB(existingUser.id);

            token.isOAuth = !!existingAccount;
            token.name = existingUser.name;
            token.email = existingUser.email;
            token.role = existingUser.role;
            token.emailVerified = existingUser.emailVerified;
            return token;
        },

        async session({ session, token }) {
            // Session 处理逻辑不变
            if (session.user && token.sub) {
                session.user.id = token.sub;
            }
            if (session.user && token.role) {
                session.user.role = token.role as UserRole;
            }
            if (session.user) {
                session.user.name = token.name;
                session.user.email = token.email as string;
                session.user.isOAuth = token.isOAuth as boolean;
            }
            return session;
        },
    },
});