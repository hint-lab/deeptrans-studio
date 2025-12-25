import { prisma } from '@/lib/db';
import { type Account } from '@prisma/client';
import { dbTry } from './utils';

export type AccountCreateInput = {
    userId: string;
    type: string;
    provider: string;
    providerAccountId: string;
    refresh_token: string;
    access_token: string;
    id_token: string;
    expires_at: number;
    token_type: string;
    scope: string;
    session_state: string;
};

export type AccountUpdateInput = {
    userId: string;
    type: string;
    provider: string;
    providerAccountId: string;
    refresh_token: string;
    access_token: string;
    id_token: string;
    expires_at: number;
    token_type: string;
    scope: string;
    session_state: string;
};

//
export const findAccountByUserIdDB = async (userId: string): Promise<Account | null> => {
    return dbTry(() => prisma.account.findFirst({ where: { userId } }));
};

export const createAccountDB = async (data: AccountCreateInput): Promise<Account | null> => {
    return dbTry(() => prisma.account.create({ data }));
};

export const updateAccountById = async (id: string, data: any): Promise<Account | null> => {
    return dbTry(() => prisma.account.update({ where: { id }, data }));
};

export const deleteAccountByIdDB = async (id: string): Promise<Account | null> => {
    return dbTry(() => prisma.account.delete({ where: { id } }));
};

export const upsertAccountByUserIdDB = async (
    userId: string,
    data: AccountUpdateInput
): Promise<Account | null> => {
    return dbTry(async () => {
        const existing = await prisma.account.findFirst({
            where: { userId },
            select: { id: true },
        });
        if (existing) return prisma.account.update({ where: { id: existing.id }, data });
        return prisma.account.create({ data: { ...(data || {}), userId } });
    });
};
