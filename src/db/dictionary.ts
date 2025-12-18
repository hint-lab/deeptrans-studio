import { prisma } from '@/lib/db';
import { type Dictionary as PrismaDictionary } from '@prisma/client';
import { dbTry } from './utils';

export type Dictionary = PrismaDictionary;
export type DictionaryCreateInput = {
    name: string;
    description?: string;
    domain: string;
    visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE';
    userId?: string;
    tenantId?: string;
};

// 创建词典
export const createDictionaryDB = async (
    data: DictionaryCreateInput
): Promise<Dictionary | null> => {
    return dbTry(() =>
        prisma.dictionary.create({
            data: {
                name: data.name,
                description: data.description,
                domain: data.domain,
                visibility: (data.visibility as any) ?? 'PRIVATE',
                userId: data.userId,
                tenantId: data.tenantId,
            },
        })
    );
};

// 查找
export const findAllDictionariesDB = async (): Promise<Dictionary[] | null> => {
    return dbTry(() =>
        prisma.dictionary.findMany({
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
        })
    );
};

export const findAllDictionariesWithEntriesDB = async (): Promise<Dictionary[] | null> => {
    return dbTry(() =>
        prisma.dictionary.findMany({
            include: {
                entries: true,
                user: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        })
    );
};

export const findDictionariesGivenVisibilityDB = async (
    visibility: 'PUBLIC' | 'PROJECT' | 'PRIVATE',
    order: string = 'desc',
    userId?: string
): Promise<Dictionary[] | null> => {
    return dbTry(() =>
        prisma.dictionary.findMany({
            where: { visibility: visibility, ...(userId ? { userId: userId } : {}) },
            orderBy: { createdAt: order },
            include: { _count: { select: { entries: true } } },
        })
    );
};
export const findDictionariesGivenVisibilityWithEntriesDB = async (
    visibility: 'PUBLIC' | 'PROJECT' | 'PRIVATE',
    order: string = 'desc'
): Promise<Dictionary[] | null> => {
    return dbTry(() =>
        prisma.dictionary.findMany({
            where: { visibility: visibility },
            orderBy: { createdAt: order },
            include: { _count: { select: { entries: true } } },
        })
    );
};

export const findDictionaryByIdDB = async (id: string): Promise<Dictionary | null> => {
    return dbTry(() =>
        prisma.dictionary.findUnique({
            where: { id },
        })
    );
};
// 根据项目ID查找关联的词典ID
export const findDictionaryIdByProjectIdDB = async (projectId: string): Promise<string | null> => {
    return dbTry(async () => {
        const projectDictionary = await prisma.projectDictionary.findFirst({
            where: { projectId },
            select: { dictionaryId: true },
        });

        return projectDictionary?.dictionaryId || null;
    });
};
export const findDictionaryByProjectIdDB = async (
    projectId: string
): Promise<Dictionary | null> => {
    return dbTry(async () => {
        const dictionaryId = await findDictionaryIdByProjectIdDB(projectId);

        if (!dictionaryId) {
            return null;
        }

        const dictionary = await prisma.dictionary.findUnique({
            where: { id: dictionaryId },
        });

        return dictionary;
    });
};
export const findDictionaryByIdWithEntriesDB = async (id: string): Promise<Dictionary | null> => {
    return dbTry(() =>
        prisma.dictionary.findUnique({
            where: { id },
            include: {
                entries: { orderBy: { createdAt: 'desc' } },
                user: { select: { id: true, name: true } },
            },
        })
    );
};

// 更新
export const updateDictionaryByIdDB = async (
    id: string,
    data: {
        name?: string;
        description?: string;
        domain?: string;
        visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE';
    }
) => {
    return dbTry(() =>
        prisma.dictionary.update({ where: { id }, data: { ...data, updatedAt: new Date() } })
    );
};

// 删除
export const deleteDictionaryByIdDB = async (id: string): Promise<Dictionary | null> => {
    return dbTry(() => prisma.dictionary.delete({ where: { id } }));
};

export const findOrCreateDictionaryDB = async (
    projectId: string,
    opts?: { scope?: 'PROJECT' | 'PRIVATE'; userId?: string }
) => {
    const scope = (opts?.scope || 'PROJECT') as 'PROJECT' | 'PRIVATE';

    // 1. 优先：查找已存在的绑定
    try {
        const bound = await prisma.projectDictionary.findFirst({
            where: { projectId },
            select: { dictionaryId: true },
        });
        if (bound?.dictionaryId) {
            console.log(`项目 ${projectId} 已有绑定词典: ${bound.dictionaryId}`);
            return { id: bound.dictionaryId, created: false } as const;
        }
    } catch (error) {
        console.error('查找项目绑定失败:', error);
    }

    // 2. 直接为项目创建专属词典
    let projectName = '';
    let projectDomain = 'general';

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                name: true,
                domain: true,
            },
        });

        if (project) {
            projectName = project.name?.trim() || '';
            projectDomain = project.domain || 'general';
        }
    } catch (error) {
        console.error('获取项目信息失败:', error);
    }

    // 生成唯一名称
    const timestamp = Date.now().toString();
    const name = projectName
        ? `${projectName} · 术语清单-${timestamp}`
        : `项目术语清单-${timestamp}`;

    const data: any = {
        name,
        description: `项目 ${projectName || projectId} 的专属术语词典`,
        domain: projectDomain, // 使用项目的领域
        visibility: scope as any,
    };

    if (scope === 'PRIVATE' && opts?.userId) {
        data.userId = opts.userId;
    }

    try {
        const created = await prisma.dictionary.create({
            data,
            select: { id: true, name: true },
        });

        const createdId = created.id;

        // 创建绑定关系
        await prisma.projectDictionary.create({
            data: { projectId, dictionaryId: createdId },
        });

        console.log(
            `为项目 ${projectId} (${projectName}) 创建新词典: ${createdId} - ${created.name}`
        );
        return { id: createdId, created: true } as const;
    } catch (error) {
        console.error('创建词典失败:', error);
        throw new Error(`无法为项目 ${projectId} 创建词典`);
    }
};
