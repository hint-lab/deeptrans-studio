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

// 更新
export const updateUserByIdDB = async (id: string, data: UserUpdateInput): Promise<User | null> => {
    return await dbTry(() => prisma.user.update({ where: { id }, data: data as any }));
};

// 删除
export const deleteUserByIdDB = async (id: string): Promise<User | null> => {
    return await dbTry(() => prisma.user.delete({ where: { id } }));
};
