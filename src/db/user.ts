import { prisma } from '@/lib/db';
import { UserRole, type User as PrismaUser } from '@prisma/client';
import { dbTry } from './utils';
export type User = PrismaUser;

export type UserCreateInput = {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
    password?: string | null;
    role?: UserRole;
    tenantId?: string | null;
};

export type UserUpdateInput = Partial<{
    name: string | null;
    email: string | null;
    avatar: string | null;
    password: string | null;
    role: UserRole;
    tenantId: string | null;
    emailVerified: Date | null;
}>;

// 创建
export const createUserDB = async (data: UserCreateInput): Promise<User | null> => {
    return dbTry(() =>
        prisma.user.create({
            data: {
                name: data.name ?? null,
                email: data.email ?? null,
                avatar: data.avatar ?? null,
                password: data.password ?? null,
                role: data.role ?? UserRole.USER,
                tenantId: data.tenantId ?? null,
            },
        })
    );
};

// 查找
export const findUserByIdDB = async (id: string): Promise<User | null> => {
    return dbTry(() => prisma.user.findUnique({ where: { id } }));
};

export const findUserByEmailDB = async (email: string): Promise<User | null> => {
    return dbTry(() => prisma.user.findUnique({ where: { email } }));
};

/**
 * Authentication treats email addresses as case-insensitive. Keep this lookup
 * separate from the exact-key helper so historical mixed-case accounts remain
 * usable while new authentication flows store the canonical lower-case value.
 */
export const findUserByNormalizedEmailDB = async (email: string): Promise<User | null> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return null;

    return dbTry(() =>
        prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: 'insensitive',
                },
            },
        })
    );
};

// 更新
export const updateUserByIdDB = async (id: string, data: UserUpdateInput): Promise<User | null> => {
    return await dbTry(() => prisma.user.update({ where: { id }, data: data as any }));
};

// 删除
export const deleteUserByIdDB = async (id: string): Promise<User | null> => {
    return await dbTry(() => prisma.user.delete({ where: { id } }));
};
