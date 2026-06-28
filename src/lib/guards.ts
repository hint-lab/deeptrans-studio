import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { findWritableDocumentItemForOwner } from '@/server/document-item-access';

export class GuardError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'GuardError';
        this.status = status;
    }
}

export type AuthContext = {
    userId: string;
    tenantId?: string | null;
    role?: string | null;
};

export function guardStatus(error: unknown) {
    return error instanceof GuardError ? error.status : 500;
}

export function guardMessage(error: unknown) {
    if (error instanceof GuardError) return error.message;
    return error instanceof Error ? error.message : 'Internal error';
}

export async function requireUser(): Promise<AuthContext> {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new GuardError(401, '未授权');

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, tenantId: true, role: true },
    });
    if (!user) throw new GuardError(401, '未授权');

    return { userId: user.id, tenantId: user.tenantId, role: user.role };
}

export function ownedBy(ctx: AuthContext) {
    return [
        { userId: ctx.userId },
        ...(ctx.tenantId ? [{ tenantId: ctx.tenantId }] : []),
    ];
}

export function ownedWhere(ctx: AuthContext) {
    return { OR: ownedBy(ctx) };
}

export function userOwnedWhere(ctx: AuthContext) {
    return { userId: ctx.userId };
}

export async function requireOwnedProject(projectId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!projectId) throw new GuardError(400, '缺少 projectId');

    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            OR: ownedBy(authCtx),
        },
        include: { documents: { orderBy: { uploadedAt: 'desc' } } },
    });
    if (!project) throw new GuardError(404, '项目不存在或无权访问');
    return project;
}

export async function requireWritableProject(projectId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!projectId) throw new GuardError(400, '缺少 projectId');

    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            userId: authCtx.userId,
        },
        include: { documents: { orderBy: { uploadedAt: 'desc' } } },
    });
    if (!project) throw new GuardError(404, '项目不存在或无权写入');
    return project;
}

export async function requireOwnedDocument(documentId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!documentId) throw new GuardError(400, '缺少 documentId');

    const document = await prisma.document.findFirst({
        where: {
            id: documentId,
            project: { OR: ownedBy(authCtx) },
        },
        include: { project: true },
    });
    if (!document) throw new GuardError(404, '文档不存在或无权访问');
    return document;
}

export async function requireWritableDocument(documentId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!documentId) throw new GuardError(400, '缺少 documentId');

    const document = await prisma.document.findFirst({
        where: {
            id: documentId,
            project: { userId: authCtx.userId },
        },
        include: { project: true },
    });
    if (!document) throw new GuardError(404, '文档不存在或无权写入');
    return document;
}

export async function requireOwnedProjectDocument(
    projectId: string,
    documentId: string,
    ctx?: AuthContext
) {
    const authCtx = ctx ?? (await requireUser());
    if (!projectId) throw new GuardError(400, '缺少 projectId');
    const document = await requireOwnedDocument(documentId, authCtx);
    if (document.projectId !== projectId) {
        throw new GuardError(404, '文档不属于当前项目');
    }
    return document;
}

export async function requireOwnedDocumentItem(itemId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!itemId) throw new GuardError(400, '缺少 itemId');

    const item = await prisma.documentItem.findFirst({
        where: {
            id: itemId,
            document: { project: { OR: ownedBy(authCtx) } },
        },
        include: { document: true },
    });
    if (!item) throw new GuardError(404, '文档段落不存在或无权访问');
    return item;
}

export async function requireWritableDocumentItem(itemId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!itemId) throw new GuardError(400, '缺少 itemId');

    const item = await findWritableDocumentItemForOwner(itemId, authCtx);
    if (!item) throw new GuardError(404, '文档段落不存在或无权写入');
    return item;
}

export async function requireOwnedMemory(memoryId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!memoryId) throw new GuardError(400, '缺少 memoryId');

    const memory = await prisma.translationMemory.findFirst({
        where: {
            id: memoryId,
            userId: authCtx.userId,
        },
    });
    if (!memory) throw new GuardError(404, '记忆库不存在或无权访问');
    return memory;
}

export async function requireAccessibleDictionary(dictionaryId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!dictionaryId) throw new GuardError(400, '缺少 dictionaryId');

    const dictionary = await prisma.dictionary.findFirst({
        where: {
            id: dictionaryId,
            OR: [
                { visibility: 'PUBLIC' },
                { visibility: 'PRIVATE', userId: authCtx.userId },
                ...(authCtx.tenantId
                    ? [{ visibility: 'PROJECT' as const, tenantId: authCtx.tenantId }]
                    : []),
                {
                    visibility: 'PROJECT',
                    projectBindings: {
                        some: {
                            project: {
                                OR: ownedBy(authCtx),
                            },
                        },
                    },
                },
            ],
        },
    });
    if (!dictionary) throw new GuardError(404, '词典不存在或无权访问');
    return dictionary;
}

export async function requireWritableDictionary(dictionaryId: string, ctx?: AuthContext) {
    const authCtx = ctx ?? (await requireUser());
    if (!dictionaryId) throw new GuardError(400, '缺少 dictionaryId');

    const dictionary = await prisma.dictionary.findFirst({
        where: {
            id: dictionaryId,
            OR: [
                { visibility: 'PRIVATE', userId: authCtx.userId },
                {
                    visibility: 'PROJECT',
                    projectBindings: {
                        some: {
                            project: {
                                userId: authCtx.userId,
                            },
                        },
                    },
                },
            ],
        },
    });
    if (!dictionary) throw new GuardError(404, '词典不存在或无权写入');
    return dictionary;
}
