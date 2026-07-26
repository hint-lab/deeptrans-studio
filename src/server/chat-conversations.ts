import {
    normalizeChatAssistantResponse,
    normalizeChatConversationHistory,
    normalizeChatUserPrompt,
} from '@/lib/chat-context';
import { chatConversationScopeKeyFromIds } from '@/lib/chat-conversation-scope';
import { prisma } from '@/lib/db';
import type { ChatMessage } from '@/lib/llm';
import {
    GuardError,
    requireOwnedDocumentItem,
    requireOwnedProject,
    type AuthContext,
} from '@/lib/guards';

const MAX_VISIBLE_CHAT_MESSAGES = 100;
const CHAT_GENERATION_STALE_MS = 10 * 60 * 1000;

export type ChatConversationScope = {
    projectId: string | null;
    documentItemId: string | null;
};

type ChatScopeProject = {
    id: string;
    name: string;
    sourceLanguage: string;
    targetLanguage: string;
};

type ChatScopeDocumentItem = {
    id: string;
    order: number;
    status: string;
    sourceText: string;
    targetText: string | null;
    document: { projectId: string; originalName: string; name: string };
};

export type ResolvedChatConversationScope = ChatConversationScope & {
    project?: ChatScopeProject;
    documentItem?: ChatScopeDocumentItem;
};

export type ChatConversationRole = 'user' | 'assistant';

export type ChatConversationSummary = {
    id: string;
    createdAt?: Date;
    updatedAt?: Date;
};

type ScopeRow = {
    id: string;
    userId: string;
    scopeKey: string;
    projectId: string | null;
    documentItemId: string | null;
    activeConversationId: string | null;
};

export type ConversationRow = {
    id: string;
    userId: string;
    scopeId: string;
    nextMessageSequence?: number;
    createdAt?: Date;
    updatedAt?: Date;
};

type ConversationMessageRow = {
    id?: string;
    sequence?: number;
    role: unknown;
    content: unknown;
    createdAt?: Date;
};

export type ConversationDb = {
    chatConversationScope: {
        upsert: (args: unknown) => Promise<ScopeRow>;
        update: (args: unknown) => Promise<ScopeRow>;
    };
    chatConversation: {
        findFirst: (args: unknown) => Promise<ConversationRow | null>;
        findMany: (args: unknown) => Promise<ConversationRow[]>;
        create: (args: unknown) => Promise<ConversationRow>;
        updateMany: (args: unknown) => Promise<{ count: number }>;
    };
    chatConversationMessage: {
        findMany: (args: unknown) => Promise<ConversationMessageRow[]>;
        create: (args: unknown) => Promise<ConversationMessageRow>;
        deleteMany: (args: unknown) => Promise<{ count: number }>;
    };
    $transaction: <T>(callback: (tx: ConversationDb) => Promise<T>) => Promise<T>;
};

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function id(value: unknown) {
    return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function dbOrDefault(db?: ConversationDb) {
    return (db || (prisma as ConversationDb)) as ConversationDb;
}

export function chatConversationScopeKey(scope: ChatConversationScope) {
    return chatConversationScopeKeyFromIds(scope.projectId, scope.documentItemId);
}

function scopeCreateData(authCtx: AuthContext, scope: ChatConversationScope) {
    return {
        userId: authCtx.userId,
        scopeKey: chatConversationScopeKey(scope),
        projectId: scope.projectId,
        documentItemId: scope.documentItemId,
    };
}

/**
 * Resolve editor identifiers before they are ever used as chat scope. Chat
 * scope is always user-owned even when the project itself is tenant-readable.
 */
export async function resolveChatConversationScopeForOwner(
    value: unknown,
    authCtx: AuthContext
): Promise<ResolvedChatConversationScope> {
    const context = record(value);
    const requestedProjectId = id(context.projectId);
    const requestedDocumentItemId = id(context.documentItemId);

    if (requestedDocumentItemId) {
        const documentItem = await requireOwnedDocumentItem(requestedDocumentItemId, authCtx);
        if (requestedProjectId && requestedProjectId !== documentItem.document.projectId) {
            throw new GuardError(404, '当前语段不属于请求中的项目');
        }
        const project = await requireOwnedProject(documentItem.document.projectId, authCtx);
        return {
            projectId: project.id,
            documentItemId: documentItem.id,
            project: project as ChatScopeProject,
            documentItem: documentItem as ChatScopeDocumentItem,
        };
    }

    if (requestedProjectId) {
        const project = await requireOwnedProject(requestedProjectId, authCtx);
        return {
            projectId: project.id,
            documentItemId: null,
            project: project as ChatScopeProject,
        };
    }

    return { projectId: null, documentItemId: null };
}

/**
 * The unique `(userId, scopeKey)` upsert is the first concurrency boundary:
 * two tabs cannot manufacture two initial/default scope records.
 */
export async function ensureChatConversationScopeForOwner(
    authCtx: AuthContext,
    scope: ChatConversationScope,
    db?: ConversationDb
) {
    const client = dbOrDefault(db);
    const data = scopeCreateData(authCtx, scope);
    return client.chatConversationScope.upsert({
        where: {
            userId_scopeKey: {
                userId: authCtx.userId,
                scopeKey: data.scopeKey,
            },
        },
        create: data,
        update: {},
    });
}

async function findOwnedConversation(
    conversationId: unknown,
    authCtx: AuthContext,
    scopeRow: ScopeRow,
    db: ConversationDb
) {
    const normalizedId = id(conversationId);
    if (!normalizedId) return null;
    const conversation = await db.chatConversation.findFirst({
        where: {
            id: normalizedId,
            userId: authCtx.userId,
            scopeId: scopeRow.id,
        },
    });
    if (!conversation) throw new GuardError(404, '对话不存在或不属于当前工作区');
    return conversation;
}

/**
 * Lock the scope row before inspecting/creating its default active thread.
 * The lock plus scope unique key prevents concurrent first requests from
 * creating duplicate default conversations.
 */
async function resolveDefaultConversationInTransaction(
    authCtx: AuthContext,
    scopeRow: ScopeRow,
    tx: ConversationDb
) {
    const lockedScope = await tx.chatConversationScope.update({
        where: { id: scopeRow.id },
        data: { updatedAt: new Date() },
    });
    if (lockedScope.userId !== authCtx.userId) {
        throw new GuardError(404, '对话工作区不存在或无权访问');
    }

    if (lockedScope.activeConversationId) {
        const active = await tx.chatConversation.findFirst({
            where: {
                id: lockedScope.activeConversationId,
                userId: authCtx.userId,
                scopeId: lockedScope.id,
            },
        });
        if (active) return active;
    }

    const conversation = await tx.chatConversation.create({
        data: { userId: authCtx.userId, scopeId: lockedScope.id },
    });
    await tx.chatConversationScope.update({
        where: { id: lockedScope.id },
        data: { activeConversationId: conversation.id },
    });
    return conversation;
}

export async function resolveChatConversationForOwner(
    input: {
        authCtx: AuthContext;
        scope: ChatConversationScope;
        conversationId?: unknown;
    },
    db?: ConversationDb
) {
    const client = dbOrDefault(db);
    const scopeRow = await ensureChatConversationScopeForOwner(input.authCtx, input.scope, client);
    const explicit = await findOwnedConversation(
        input.conversationId,
        input.authCtx,
        scopeRow,
        client
    );
    if (explicit) return { conversation: explicit, scopeRow };

    const conversation = await client.$transaction(tx =>
        resolveDefaultConversationInTransaction(input.authCtx, scopeRow, tx)
    );
    return { conversation, scopeRow };
}

export async function selectChatConversationForOwner(
    input: { authCtx: AuthContext; scope: ChatConversationScope; conversationId: unknown },
    db?: ConversationDb
) {
    const client = dbOrDefault(db);
    const scopeRow = await ensureChatConversationScopeForOwner(input.authCtx, input.scope, client);
    const conversation = await findOwnedConversation(
        input.conversationId,
        input.authCtx,
        scopeRow,
        client
    );
    if (!conversation) throw new GuardError(400, '缺少 conversationId');
    await client.chatConversationScope.update({
        where: { id: scopeRow.id },
        data: { activeConversationId: conversation.id },
    });
    return conversation;
}

export async function listChatConversationsForOwner(
    authCtx: AuthContext,
    scope: ChatConversationScope,
    db?: ConversationDb
) {
    const client = dbOrDefault(db);
    const scopeRow = await ensureChatConversationScopeForOwner(authCtx, scope, client);
    const conversations = await client.chatConversation.findMany({
        where: { userId: authCtx.userId, scopeId: scopeRow.id },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, createdAt: true, updatedAt: true },
    });
    return { scopeRow, conversations: conversations as ChatConversationSummary[] };
}

function roleFromRow(role: unknown): ChatConversationRole | null {
    if (role === 'USER' || role === 'user') return 'user';
    if (role === 'ASSISTANT' || role === 'assistant') return 'assistant';
    return null;
}

export function chatMessagesForClient(rows: ConversationMessageRow[]) {
    return rows
        .map(row => {
            const role = roleFromRow(row.role);
            const content = String(row.content || '').trim();
            if (!role || !content || !row.id || !Number.isInteger(row.sequence)) return null;
            return {
                id: row.id,
                sequence: row.sequence,
                role,
                content,
                createdAt: row.createdAt?.toISOString(),
            };
        })
        .filter(
            (
                row
            ): row is {
                id: string;
                sequence: number;
                role: ChatConversationRole;
                content: string;
                createdAt: string | undefined;
            } => Boolean(row)
        );
}

/** Rows are queried newest-first by durable per-conversation sequence. */
export function boundedChatHistoryFromRows(rows: ConversationMessageRow[]): ChatMessage[] {
    return normalizeChatConversationHistory(
        [...rows]
            .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0))
            .map(row => ({ role: roleFromRow(row.role), content: row.content }))
    );
}

export async function readChatConversationHistory(conversationId: string, db?: ConversationDb) {
    const rows = await dbOrDefault(db).chatConversationMessage.findMany({
        where: { conversationId },
        orderBy: { sequence: 'desc' },
        take: 40,
        select: { sequence: true, role: true, content: true, createdAt: true },
    });
    return boundedChatHistoryFromRows(rows);
}

export async function readChatConversationMessages(conversationId: string, db?: ConversationDb) {
    const rows = await dbOrDefault(db).chatConversationMessage.findMany({
        where: { conversationId },
        orderBy: { sequence: 'desc' },
        take: MAX_VISIBLE_CHAT_MESSAGES,
        select: { id: true, sequence: true, role: true, content: true, createdAt: true },
    });
    return chatMessagesForClient(
        [...rows].sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0))
    );
}

async function appendChatTurnInTransaction(
    authCtx: AuthContext,
    conversation: ConversationRow,
    userContent: unknown,
    assistantContent: unknown,
    tx: ConversationDb,
    generationToken?: string
) {
    const user = normalizeChatUserPrompt(userContent).content;
    const assistant = normalizeChatAssistantResponse(assistantContent).content;
    if (!user || !assistant) throw new GuardError(400, '对话内容不能为空');

    // `updateMany` has an owner predicate and holds the conversation row lock
    // until this interactive transaction commits. The following read observes
    // the incremented sequence, so concurrent turns receive disjoint pairs.
    const ownership = await tx.chatConversation.updateMany({
        where: {
            id: conversation.id,
            userId: authCtx.userId,
            scopeId: conversation.scopeId,
            ...(generationToken ? { generationToken } : {}),
        },
        data: {
            nextMessageSequence: { increment: 2 },
            updatedAt: new Date(),
        },
    });
    if (ownership.count !== 1) {
        if (generationToken) {
            throw new GuardError(409, '当前生成已失效，未保存对话内容');
        }
        throw new GuardError(404, '对话不存在或无权访问');
    }

    const updated = await tx.chatConversation.findFirst({
        where: {
            id: conversation.id,
            userId: authCtx.userId,
            scopeId: conversation.scopeId,
            ...(generationToken ? { generationToken } : {}),
        },
        select: { nextMessageSequence: true },
    });
    const endSequence = Number(updated?.nextMessageSequence || 0);
    if (endSequence < 2) throw new Error('对话序列分配失败');

    await tx.chatConversationMessage.create({
        data: {
            conversationId: conversation.id,
            sequence: endSequence - 1,
            role: 'USER',
            content: user,
        },
    });
    await tx.chatConversationMessage.create({
        data: {
            conversationId: conversation.id,
            sequence: endSequence,
            role: 'ASSISTANT',
            content: assistant,
        },
    });
    return { conversation, user, assistant };
}

/** Successful turns are persisted atomically; failed/cancelled generation has no half turn. */
export async function appendChatConversationTurnForOwner(
    input: {
        authCtx: AuthContext;
        conversation: ConversationRow;
        userContent: unknown;
        assistantContent: unknown;
        generationToken?: string;
    },
    db?: ConversationDb
) {
    const client = dbOrDefault(db);
    return client.$transaction(tx =>
        appendChatTurnInTransaction(
            input.authCtx,
            input.conversation,
            input.userContent,
            input.assistantContent,
            tx,
            input.generationToken
        )
    );
}

/**
 * A new thread is created only after a valid model/agent result exists. Its
 * first complete turn is atomic, and it may conditionally become active in
 * that same transaction when the initiating tab's snapshot is still current.
 */
export async function createNewChatConversationWithTurnForOwner(
    input: {
        authCtx: AuthContext;
        scope: ChatConversationScope;
        userContent: unknown;
        assistantContent: unknown;
        /**
         * The active thread observed when this tab started its local draft.
         * `undefined` deliberately means "do not change the shared default";
         * `null` is an explicit observation that the scope had no default.
         */
        expectedActiveConversationId?: string | null;
    },
    db?: ConversationDb
) {
    const client = dbOrDefault(db);
    const scopeRow = await ensureChatConversationScopeForOwner(input.authCtx, input.scope, client);
    return client.$transaction(async tx => {
        const lockedScope = await tx.chatConversationScope.update({
            where: { id: scopeRow.id },
            data: { updatedAt: new Date() },
        });
        if (lockedScope.userId !== input.authCtx.userId) {
            throw new GuardError(404, '对话工作区不存在或无权访问');
        }
        const conversation = await tx.chatConversation.create({
            data: { userId: input.authCtx.userId, scopeId: lockedScope.id },
        });
        await appendChatTurnInTransaction(
            input.authCtx,
            conversation,
            input.userContent,
            input.assistantContent,
            tx
        );

        // A new draft is local to the initiating tab until its first turn is
        // durable. Do not let a slow generation overwrite a thread selected in
        // another tab after that draft began. The scope-row update above holds
        // the same lock as this comparison and optional pointer write, so the
        // check is atomic with the new conversation and its first complete
        // turn. Older callers that do not provide an observed pointer are safe
        // by default: they create the thread but do not mutate shared state.
        if (
            input.expectedActiveConversationId !== undefined &&
            (lockedScope.activeConversationId || null) === input.expectedActiveConversationId
        ) {
            await tx.chatConversationScope.update({
                where: { id: lockedScope.id },
                data: { activeConversationId: conversation.id },
            });
        }
        return conversation;
    });
}

/**
 * Reject a second generation before it reads history. The generation token is
 * also checked again by the final turn commit, so a stale/aborted request
 * cannot publish after a later request has acquired the conversation.
 */
export async function claimChatConversationGenerationForOwner(
    input: {
        authCtx: AuthContext;
        conversation: ConversationRow;
        generationToken: string;
        now?: Date;
    },
    db?: ConversationDb
) {
    const now = input.now || new Date();
    const staleBefore = new Date(now.getTime() - CHAT_GENERATION_STALE_MS);
    const claimed = await dbOrDefault(db).chatConversation.updateMany({
        where: {
            id: input.conversation.id,
            userId: input.authCtx.userId,
            scopeId: input.conversation.scopeId,
            OR: [{ generationToken: null }, { generationStartedAt: { lt: staleBefore } }],
        },
        data: { generationToken: input.generationToken, generationStartedAt: now },
    });
    if (claimed.count !== 1) {
        throw new GuardError(409, '当前对话正在生成，请等待完成后再发送');
    }
}

export async function releaseChatConversationGenerationForOwner(
    input: { authCtx: AuthContext; conversation: ConversationRow; generationToken: string },
    db?: ConversationDb
) {
    await dbOrDefault(db).chatConversation.updateMany({
        where: {
            id: input.conversation.id,
            userId: input.authCtx.userId,
            scopeId: input.conversation.scopeId,
            generationToken: input.generationToken,
        },
        data: { generationToken: null, generationStartedAt: null },
    });
}

export async function clearChatConversationForOwner(
    input: {
        authCtx: AuthContext;
        scope: ChatConversationScope;
        conversationId: unknown;
        now?: Date;
    },
    db?: ConversationDb
) {
    const conversationId = id(input.conversationId);
    if (!conversationId) throw new GuardError(400, '缺少当前对话标识，请刷新后重试');
    const client = dbOrDefault(db);
    const now = input.now || new Date();
    const staleBefore = new Date(now.getTime() - CHAT_GENERATION_STALE_MS);
    const scopeRow = await ensureChatConversationScopeForOwner(input.authCtx, input.scope, client);
    return client.$transaction(async tx => {
        // Acquiring the same row lock used by turn persistence prevents a
        // delayed generation from recreating messages after clear succeeds.
        // A token beyond the same stale threshold used by generation claiming
        // is no longer allowed to block a user from clearing the thread. Clear
        // it atomically, so any late stale writer fails its token predicate.
        const locked = await tx.chatConversation.updateMany({
            where: {
                id: conversationId,
                userId: input.authCtx.userId,
                scopeId: scopeRow.id,
                OR: [
                    { generationToken: null },
                    { generationStartedAt: null },
                    { generationStartedAt: { lt: staleBefore } },
                ],
            },
            data: { updatedAt: now, generationToken: null, generationStartedAt: null },
        });
        if (locked.count !== 1) {
            const existing = await tx.chatConversation.findFirst({
                where: {
                    id: conversationId,
                    userId: input.authCtx.userId,
                    scopeId: scopeRow.id,
                },
            });
            if (!existing) throw new GuardError(404, '对话不存在或不属于当前工作区');
            throw new GuardError(409, '当前对话正在生成，无法清空');
        }
        await tx.chatConversationMessage.deleteMany({ where: { conversationId } });
        return { id: conversationId };
    });
}
