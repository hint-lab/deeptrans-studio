import { prisma } from '@/lib/db';
import { Prisma, type DocumentItem as PrismaDocumentItem } from '@prisma/client';

export type DocumentItem = PrismaDocumentItem;

export type DocumentItemCreateInput = {
    documentId: string;
    order: number;
    sourceText: string;
    targetText?: string | null;
    status?: string | null;
    type: string;
    metadata?: any;
    preTranslateTerms?: any;
    preTranslateDict?: any;
    preTranslateEmbedded?: any;
    qualityAssureBiTerm?: any;
    qualityAssureSyntax?: any;
    qualityAssureSyntaxEmbedded?: any;
    postEditDiscourse?: any;
    postEditEmbedded?: any;
    needsReview?: boolean;
    locked?: boolean;
};

export type DocumentItemUpdateInput = Partial<{
    sourceText: string;
    targetText: string | null;
    status: string | null;
    type: string;
    metadata: any;
    preTranslateTerms: any;
    preTranslateDict: any;
    preTranslateEmbedded: any;
    qualityAssureBiTerm: any;
    qualityAssureSyntax: any;
    qualityAssureSyntaxEmbedded: any;
    postEditDiscourse: any;
    postEditEmbedded: any;
    needsReview: boolean;
    locked: boolean;
}>;

// 创建单条
export async function createDocumentItemDB(data: DocumentItemCreateInput): Promise<DocumentItem> {
    return prisma.documentItem.create({ data });
}

// 批量创建
export async function createDocumentItemsBulkDB(
    items: DocumentItemCreateInput[]
): Promise<{ count: number }> {
    return prisma.documentItem.createMany({ data: items });
}

/**
 * Runs the replacement through a supplied transaction runner.
 * The count check remains inside the transaction so a partial create rolls
 * the preceding delete back. Exported for transaction-boundary tests.
 * @internal
 */
export async function replaceDocumentItemsAtomicWithRunner(
    database: {
        $transaction: <T>(operation: (tx: any) => Promise<T>) => Promise<T>;
    },
    documentId: string,
    items: DocumentItemCreateInput[]
): Promise<{ count: number }> {
    if (!documentId) throw new Error('missing document id');
    if (!Array.isArray(items) || !items.length) throw new Error('no document items to replace');

    return database.$transaction(async (tx: any) => {
        await tx.documentItem.deleteMany({ where: { documentId } });
        const created = await tx.documentItem.createMany({ data: items });
        if (Number(created?.count || 0) !== items.length) {
            throw new Error(
                `document item replacement incomplete: expected ${items.length}, created ${Number(created?.count || 0)}`
            );
        }
        return { count: created.count };
    });
}

export async function replaceDocumentItemsAtomicDB(
    documentId: string,
    items: DocumentItemCreateInput[]
): Promise<{ count: number }> {
    return replaceDocumentItemsAtomicWithRunner(prisma, documentId, items);
}

export const DOCUMENT_INITIALIZATION_CONFLICT = 'DOCUMENT_INITIALIZATION_CONFLICT';

/**
 * Re-segmentation is destructive, so claim the document stage and inspect the
 * existing items in the same transaction that replaces them.
 */
export async function replaceDocumentItemsForInitializationWithRunner(
    database: {
        $transaction: <T>(operation: (tx: any) => Promise<T>) => Promise<T>;
    },
    documentId: string,
    items: DocumentItemCreateInput[]
): Promise<{ count: number }> {
    if (!documentId) throw new Error('missing document id');
    if (!Array.isArray(items) || !items.length) throw new Error('no document items to replace');

    return database.$transaction(async (tx: any) => {
        const document = await tx.document.findUnique({
            where: { id: documentId },
            select: { status: true },
        });
        const currentStatus = String(document?.status || '');
        if (!['PARSING', 'SEGMENTING'].includes(currentStatus)) {
            throw new Error(DOCUMENT_INITIALIZATION_CONFLICT);
        }

        const [existingCount, progressedCount] = await Promise.all([
            tx.documentItem.count({ where: { documentId } }),
            tx.documentItem.count({
                where: {
                    documentId,
                    OR: [{ status: { not: 'NOT_STARTED' } }, { targetText: { not: null } }],
                },
            }),
        ]);
        if (progressedCount > 0 || (currentStatus === 'PARSING' && existingCount > 0)) {
            throw new Error(DOCUMENT_INITIALIZATION_CONFLICT);
        }

        const claimed = await tx.document.updateMany({
            where: { id: documentId, status: currentStatus },
            data: { status: 'SEGMENTING' },
        });
        if (claimed.count !== 1) throw new Error(DOCUMENT_INITIALIZATION_CONFLICT);

        await tx.documentItem.deleteMany({ where: { documentId } });
        const created = await tx.documentItem.createMany({ data: items });
        if (Number(created?.count || 0) !== items.length) {
            throw new Error(
                `document item replacement incomplete: expected ${items.length}, created ${Number(created?.count || 0)}`
            );
        }
        return { count: created.count };
    });
}

export async function replaceDocumentItemsForInitializationDB(
    documentId: string,
    items: DocumentItemCreateInput[]
): Promise<{ count: number }> {
    return replaceDocumentItemsForInitializationWithRunner(prisma, documentId, items);
}

// 查找：按 id
export async function findDocumentItemByIdDB(id: string): Promise<DocumentItem | null> {
    return prisma.documentItem.findUnique({ where: { id } });
}

// 查找：按 documentId 分页
export async function findDocumentItemsByDocumentIdDB(
    documentId: string,
    opts?: { skip?: number; take?: number; order?: 'asc' | 'desc' }
): Promise<DocumentItem[]> {
    const skip = Math.max(0, Number(opts?.skip || 0));
    const take = Math.max(1, Math.min(500, Number(opts?.take || 100)));
    const order = (opts?.order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
    return prisma.documentItem.findMany({ where: { documentId }, orderBy: { order }, skip, take });
}

// 计数：按 documentId
export async function countDocumentItemsByDocumentIdDB(documentId: string): Promise<number> {
    return prisma.documentItem.count({ where: { documentId } });
}

// 更新：按 id 部分字段
export async function updateDocumentItemByIdDB(
    id: string,
    data: DocumentItemUpdateInput
): Promise<DocumentItem> {
    const payload: any = {};
    const keys = [
        'sourceText',
        'targetText',
        'status',
        'type',
        'metadata',
        'preTranslateTerms',
        'preTranslateDict',
        'preTranslateEmbedded',
        'qualityAssureBiTerm',
        'qualityAssureSyntax',
        'qualityAssureSyntaxEmbedded',
        'postEditDiscourse',
        'postEditEmbedded',
        'needsReview',
        'locked',
    ] as const;
    for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(data, k)) (payload as any)[k] = (data as any)[k];
    }
    if (Object.keys(payload).length === 0) {
        return prisma.documentItem.findUniqueOrThrow({ where: { id } });
    }
    return prisma.documentItem.update({ where: { id }, data: payload });
}

// 删除：按 id
export async function deleteDocumentItemByIdDB(id: string): Promise<DocumentItem> {
    return prisma.documentItem.delete({ where: { id } });
}

// 删除：按 documentId 批量
export async function deleteDocumentItemsByDocumentIdDB(
    documentId: string
): Promise<{ count: number }> {
    return prisma.documentItem.deleteMany({ where: { documentId } });
}

// 通过一组 id 批量查询（轻量字段）
export async function findDocumentItemsLiteByIdsDB(ids: string[]): Promise<
    Array<{
        id: string;
        sourceText: string | null;
        targetText?: string | null;
        documentId?: string;
    }>
> {
    if (!Array.isArray(ids) || !ids.length) return [] as any[];
    return prisma.documentItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, sourceText: true, targetText: true, documentId: true },
    }) as any;
}

// 按 id 查询并携带所属文档
export async function findDocumentItemWithDocumentByIdDB(id: string) {
    if (!id) return null;
    return prisma.documentItem.findUnique({ where: { id }, include: { document: true } });
}

// 按文档导出源文/译文文本
export async function findDocumentItemTextPairsByDocumentIdDB(
    documentId: string
): Promise<Array<{ sourceText: string | null; targetText: string | null }>> {
    if (!documentId) return [];
    return prisma.documentItem.findMany({
        where: { documentId },
        orderBy: { order: 'asc' as any },
        select: { sourceText: true, targetText: true },
    });
}

// 仅元数据
export async function findDocumentItemMetadataByIdDB(id: string): Promise<any | null> {
    if (!id) return null;
    const row = await prisma.documentItem.findUnique({ where: { id }, select: { metadata: true } });
    return row?.metadata ?? null;
}

// 中间结果（读取）
export async function fetchDocumentItemIntermediateResultsDB(id: string) {
    return prisma.documentItem.findUnique({
        where: { id },
        select: {
            sourceText: true,
            targetText: true,
            preTranslateTerms: true,
            preTranslateDict: true,
            preTranslateEmbedded: true,
            qualityAssureBiTerm: true,
            qualityAssureSyntax: true,
            qualityAssureSyntaxEmbedded: true,
            postEditDiscourse: true,
            postEditEmbedded: true,
            needsReview: true,
            locked: true,
            createdAt: true,
            updatedAt: true,
            document: true,
            metadata: true,
        },
    });
}

// 中间结果（清空）
export async function clearDocumentItemIntermediateResultsDB(id: string) {
    return prisma.documentItem.update({
        where: { id },
        data: {
            preTranslateTerms: Prisma.DbNull,
            preTranslateDict: Prisma.DbNull,
            preTranslateEmbedded: Prisma.DbNull,
            qualityAssureBiTerm: Prisma.DbNull,
            qualityAssureSyntax: Prisma.DbNull,
            qualityAssureSyntaxEmbedded: Prisma.DbNull,
            postEditDiscourse: Prisma.DbNull,
            postEditEmbedded: Prisma.DbNull,
            needsReview: false,
            locked: false,
            metadata: Prisma.DbNull,
        },
    });
}

// 读取 needsMtReview 标志
export async function fetchDocumentItemNeedsMtReviewByIdDB(id: string): Promise<boolean> {
    const row = await prisma.documentItem.findUnique({
        where: { id },
        select: { needsMtReview: true },
    });
    return !!row?.needsMtReview;
}
