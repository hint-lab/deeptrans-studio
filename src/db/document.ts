import { prisma } from '@/lib/db';
import { type Document as PrismaDocument, type Prisma } from '@prisma/client';
import { dbTry } from './utils';
import { DocumentStatus } from '@/types/enums';
import { DocumentStatus as PrismaDocumentStatus } from '@prisma/client';

export type Document = PrismaDocument;

export type DocumentStatusValue =
    | 'WAITING'
    | 'PARSING'
    | 'SEGMENTING'
    | 'TERMS_EXTRACTING'
    | 'PREPROCESSED'
    | 'TRANSLATING'
    | 'COMPLETED'
    | 'ERROR';

export type DocumentCreateInput = {
    name: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    projectId: string;
    status?: DocumentStatus;
    userId?: string | null;
    structured?: any;
};

export type DocumentUpdateInput = Partial<
    Pick<
        Document,
        'name' | 'originalName' | 'mimeType' | 'size' | 'url' | 'status' | 'structured' | 'userId'
    >
>;

// ==================== 文档操作 ====================

// 创建
export const createDocumentDB = async (data: DocumentCreateInput): Promise<Document> => {
    const payload: Prisma.DocumentCreateInput = {
        name: data.name,
        originalName: data.originalName,
        mimeType: data.mimeType,
        size: data.size,
        url: data.url,
        project: { connect: { id: data.projectId } },
        status: (data.status as any) ?? 'WAITING',
        user: data.userId ? { connect: { id: data.userId } } : undefined,
        structured: data.structured as any,
    } as any;
    return prisma.document.create({ data: payload });
};

// 查找
export const findDocumentByIdDB = async (id: string): Promise<Document | null> => {
    return dbTry(() => findDocumentDB(id));
};

export const findDocumentWithItemsByIdDB = async (id: string) => {
    return dbTry(() => findDocumentDB(id, { includeItems: true }));
};

export const findDocumentDB = async (id: string, opts?: { includeItems?: boolean }) => {
    return prisma.document.findUnique({
        where: { id },
        ...(opts?.includeItems
            ? { include: { documentItems: { orderBy: { order: 'asc' } } } }
            : {}),
    } as any);
};

export const findDocumentsByProjectIdDB = async (projectId: string): Promise<Document[] | null> => {
    return dbTry(() =>
        prisma.document.findMany({ where: { projectId }, orderBy: { uploadedAt: 'desc' } })
    );
};

// 更新
export const updateDocumentStructuredDB = async (
    id: string,
    structured: any
): Promise<Document | null> => {
    return dbTry(() =>
        prisma.document.update({ where: { id }, data: { structured: structured as any } })
    );
};

export const updateDocumentStructuredIfCurrentDB = async (
    id: string,
    structured: any,
    allowedCurrentStatuses: readonly DocumentStatusValue[]
): Promise<boolean> => {
    const updated = await dbTry<{ count: number }>(() =>
        prisma.document.updateMany({
            where: { id, status: { in: [...allowedCurrentStatuses] as any } },
            data: { structured: structured as any },
        })
    );
    return Number(updated?.count || 0) === 1;
};

export const updateDocumentStatusDB = async (
    id: string,
    status: DocumentStatusValue
): Promise<Document | null> => {
    return dbTry(() => updateDocumentByIdDB(id, { status }));
};

type DocumentStatusUpdateRunner = {
    document: {
        updateMany: (args: unknown) => Promise<{ count: number }>;
    };
};

export async function updateDocumentStatusIfCurrentWithRunner(
    database: DocumentStatusUpdateRunner,
    id: string,
    status: DocumentStatusValue,
    allowedCurrentStatuses: readonly DocumentStatusValue[]
): Promise<boolean> {
    if (!id || !allowedCurrentStatuses.length) return false;
    const result = await database.document.updateMany({
        where: {
            id,
            status: { in: [...allowedCurrentStatuses] },
        },
        data: { status },
    });
    return result.count === 1;
}

export const updateDocumentStatusIfCurrentDB = async (
    id: string,
    status: DocumentStatusValue,
    allowedCurrentStatuses: readonly DocumentStatusValue[]
): Promise<boolean> => {
    const updated = await dbTry(() =>
        updateDocumentStatusIfCurrentWithRunner(
            prisma as unknown as DocumentStatusUpdateRunner,
            id,
            status,
            allowedCurrentStatuses
        )
    );
    return updated === true;
};

export const updateDocumentByIdDB = async (
    id: string,
    data: DocumentUpdateInput
): Promise<Document | null> => {
    return dbTry(() => prisma.document.update({ where: { id }, data: data as any }));
};

// 删除
export const deleteDocumentByIdDB = async (id: string): Promise<Document | null> => {
    return dbTry(() => prisma.document.delete({ where: { id } }));
};
