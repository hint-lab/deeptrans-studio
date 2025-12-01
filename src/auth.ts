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

// 直接将配置内联在此文件中，不再依赖外部 authConfig
export const {
    handlers,
    signIn,
    signOut,
    auth
} = NextAuth({
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
            name: "Credentials",
            credentials: {
                phone: { label: "Phone", type: "text" },
                email: { label: "Email", type: "text" },
                code: { label: "Code", type: "text" },
            },
            async authorize(credentials) {
                // 同时支持 phone+code 与 email+code
                const { phone, email, code } = credentials as any;
                if (process.env.IS_DEMO === 'yes'){
                    if(code === '123456' && email === 'test@example.com'){
                        const user = await findUserByEmailDB(email as string);
                        return user || null;
                    }else{
                        return null;
                    }
                }else{
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
        strategy: "jwt",
    },
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
            if (account?.provider !== "credentials") {
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
                //token.role = user.role;
                //token.emailVerified = user.emailVerified;
                
                // 只在首次登录时查询账户信息
                const existingAccount = user.id ? await findAccountByUserIdDB(user.id as string) : null;
                token.isOAuth = !!existingAccount;
            }
            
            // 当用户更新个人信息时，刷新 token
            if (trigger === "update" && session) {
                token.name = session.user?.name;
                token.email = session.user?.email;
                // 可以在这里添加其他需要更新的字段
            }
            
            // 只有在 token 中没有用户信息时才查询数据库
            if (!token.id && token.sub) {
                const existingUser = await findUserByIdDB(token.sub);
                if (existingUser) {
                    token.id = existingUser.id;
                    token.name = existingUser.name;
                    token.email = existingUser.email;
                    token.role = existingUser.role;
                    token.emailVerified = existingUser.emailVerified;
                    
                    const existingAccount = await findAccountByUserIdDB(existingUser.id);
                    token.isOAuth = !!existingAccount;
                }
            }
            
            return token;
        },

        async session({ session, token }) {
            if (token.sub) {
                session.user.id = token.sub;
            }
            if (token.role) {
                session.user.role = token.role as UserRole;
            }
            if (token.name) {
                session.user.name = token.name;
            }
            if (token.email) {
                session.user.email = token.email as string;
            }
            session.user.isOAuth = token.isOAuth as boolean;
            
            return session;
        },
    },
});