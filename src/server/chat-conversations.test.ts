import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAX_CHAT_HISTORY_CHARS,
    MAX_CHAT_HISTORY_MESSAGE_CHARS,
    MAX_CHAT_HISTORY_MESSAGES,
} from '@/lib/chat-context';
import { GuardError } from '@/lib/guards';
import {
    appendChatConversationTurnForOwner,
    boundedChatHistoryFromRows,
    chatConversationScopeKey,
    claimChatConversationGenerationForOwner,
    clearChatConversationForOwner,
    createNewChatConversationWithTurnForOwner,
    ensureChatConversationScopeForOwner,
    resolveChatConversationForOwner,
} from './chat-conversations';

const owner = { userId: 'owner-a' };
const segmentScope = { projectId: 'project-a', documentItemId: 'item-a' };
const scopeRow = {
    id: 'scope-a',
    userId: owner.userId,
    scopeKey: chatConversationScopeKey(segmentScope),
    projectId: segmentScope.projectId,
    documentItemId: segmentScope.documentItemId,
    activeConversationId: 'conversation-a',
};
const conversation = {
    id: 'conversation-a',
    userId: owner.userId,
    scopeId: scopeRow.id,
    nextMessageSequence: 0,
};

function withTransaction(db: Record<string, unknown>) {
    return {
        ...db,
        $transaction: async <T>(callback: (tx: any) => Promise<T>) => callback(db as any),
    } as any;
}

function bareDb(overrides: Record<string, unknown> = {}) {
    return withTransaction({
        chatConversationScope: {
            upsert: async () => scopeRow,
            update: async () => scopeRow,
        },
        chatConversation: {
            findFirst: async () => conversation,
            findMany: async () => [conversation],
            create: async () => conversation,
            updateMany: async () => ({ count: 1 }),
        },
        chatConversationMessage: {
            findMany: async () => [],
            create: async () => ({ id: 'message-a' }),
            deleteMany: async () => ({ count: 0 }),
        },
        ...overrides,
    });
}

test('scope key separates a project chat from each segment chat', () => {
    assert.notEqual(
        chatConversationScopeKey(segmentScope),
        chatConversationScopeKey({ projectId: 'project-a', documentItemId: 'item-b' })
    );
    assert.notEqual(
        chatConversationScopeKey(segmentScope),
        chatConversationScopeKey({ projectId: 'project-a', documentItemId: null })
    );
});

test('scope creation uses the unique user and exact server-derived scope key', async () => {
    const calls: unknown[] = [];
    const db = bareDb({
        chatConversationScope: {
            upsert: async (args: unknown) => {
                calls.push(args);
                return scopeRow;
            },
            update: async () => scopeRow,
        },
    });

    await ensureChatConversationScopeForOwner(owner, segmentScope, db);

    assert.deepEqual(calls, [
        {
            where: {
                userId_scopeKey: {
                    userId: owner.userId,
                    scopeKey: chatConversationScopeKey(segmentScope),
                },
            },
            create: {
                userId: owner.userId,
                scopeKey: chatConversationScopeKey(segmentScope),
                projectId: segmentScope.projectId,
                documentItemId: segmentScope.documentItemId,
            },
            update: {},
        },
    ]);
});

test('an explicit conversation from another scope is rejected instead of falling back to active', async () => {
    const db = bareDb({
        chatConversation: {
            findFirst: async () => null,
            findMany: async () => [],
            create: async () => {
                throw new Error('must not create when an explicit id is invalid');
            },
            updateMany: async () => ({ count: 1 }),
        },
    });

    await assert.rejects(
        () =>
            resolveChatConversationForOwner(
                {
                    authCtx: owner,
                    scope: segmentScope,
                    conversationId: 'foreign-conversation',
                },
                db
            ),
        error => error instanceof GuardError && error.status === 404
    );
});

test('history is reconstructed by durable sequence rather than timestamp ordering', () => {
    const history = boundedChatHistoryFromRows([
        { sequence: 4, role: 'ASSISTANT', content: 'answer two', createdAt: new Date(0) },
        { sequence: 1, role: 'USER', content: 'question one', createdAt: new Date(0) },
        { sequence: 3, role: 'USER', content: 'question two', createdAt: new Date(0) },
        { sequence: 2, role: 'ASSISTANT', content: 'answer one', createdAt: new Date(0) },
    ]);

    assert.deepEqual(history, [
        { role: 'user', content: 'question one' },
        { role: 'assistant', content: 'answer one' },
        { role: 'user', content: 'question two' },
        { role: 'assistant', content: 'answer two' },
    ]);
});

test('durable history is reduced to the strict model window before routes consume it', () => {
    const history = boundedChatHistoryFromRows(
        Array.from({ length: 50 }, (_, index) => ({
            sequence: index + 1,
            role: index % 2 === 0 ? 'USER' : 'ASSISTANT',
            content: `turn-${index + 1}: ${'x'.repeat(MAX_CHAT_HISTORY_MESSAGE_CHARS + 100)}`,
        }))
    );

    assert.ok(history.length <= MAX_CHAT_HISTORY_MESSAGES);
    assert.ok(history.every(message => message.content.length <= MAX_CHAT_HISTORY_MESSAGE_CHARS));
    assert.ok(
        history.reduce((total, message) => total + message.content.length, 0) <=
            MAX_CHAT_HISTORY_CHARS
    );
    assert.equal(history.at(-1)?.content.startsWith('turn-50:'), true);
});

test('durable history never begins with an assistant answer whose user turn was outside the char window', () => {
    const orphan = `orphan-a1:${'x'.repeat(3_990)}`;
    const history = boundedChatHistoryFromRows([
        { sequence: 1, role: 'USER', content: `old-u1:${'x'.repeat(3_993)}` },
        { sequence: 2, role: 'ASSISTANT', content: `older-a1:${'x'.repeat(3_991)}` },
        { sequence: 3, role: 'USER', content: `long-u2:${'x'.repeat(3_992)}` },
        { sequence: 4, role: 'ASSISTANT', content: orphan },
        { sequence: 5, role: 'USER', content: 'recent question 3' },
        { sequence: 6, role: 'ASSISTANT', content: `recent-a3:${'x'.repeat(3_890)}` },
        { sequence: 7, role: 'USER', content: 'recent question 4' },
        { sequence: 8, role: 'ASSISTANT', content: `recent-a4:${'x'.repeat(3_890)}` },
        { sequence: 9, role: 'USER', content: 'recent question 5' },
        { sequence: 10, role: 'ASSISTANT', content: `recent-a5:${'x'.repeat(3_890)}` },
    ]);

    assert.equal(history[0]?.role, 'user');
    assert.equal(history[0]?.content, 'recent question 3');
    assert.equal(history.some(message => message.content.startsWith('orphan-a1:')), false);
});

test('a completed turn writes user and assistant together with adjacent sequences', async () => {
    const writes: unknown[] = [];
    const db = bareDb({
        chatConversation: {
            findFirst: async () => ({ ...conversation, nextMessageSequence: 2 }),
            findMany: async () => [conversation],
            create: async () => conversation,
            updateMany: async () => ({ count: 1 }),
        },
        chatConversationMessage: {
            findMany: async () => [],
            create: async (args: unknown) => {
                writes.push(args);
                return { id: `message-${writes.length}` };
            },
            deleteMany: async () => ({ count: 0 }),
        },
    });

    await appendChatConversationTurnForOwner(
        {
            authCtx: owner,
            conversation,
            userContent: 'question',
            assistantContent: 'answer',
            generationToken: 'generation-a',
        },
        db
    );

    assert.deepEqual(writes, [
        {
            data: {
                conversationId: conversation.id,
                sequence: 1,
                role: 'USER',
                content: 'question',
            },
        },
        {
            data: {
                conversationId: conversation.id,
                sequence: 2,
                role: 'ASSISTANT',
                content: 'answer',
            },
        },
    ]);
});

test('a new thread becomes active only with its first complete turn and matching draft snapshot', async () => {
    const scopeUpdates: unknown[] = [];
    const writes: unknown[] = [];
    const newConversation = { ...conversation, id: 'conversation-new', nextMessageSequence: 0 };
    const db = bareDb({
        chatConversationScope: {
            upsert: async () => ({ ...scopeRow, activeConversationId: 'conversation-a' }),
            update: async (args: unknown) => {
                scopeUpdates.push(args);
                return { ...scopeRow, activeConversationId: 'conversation-a' };
            },
        },
        chatConversation: {
            findFirst: async () => ({ ...newConversation, nextMessageSequence: 2 }),
            findMany: async () => [conversation, newConversation],
            create: async () => newConversation,
            updateMany: async () => ({ count: 1 }),
        },
        chatConversationMessage: {
            findMany: async () => [],
            create: async (args: unknown) => {
                writes.push(args);
                return { id: `message-${writes.length}` };
            },
            deleteMany: async () => ({ count: 0 }),
        },
    });

    const created = await createNewChatConversationWithTurnForOwner(
        {
            authCtx: owner,
            scope: segmentScope,
            userContent: 'new question',
            assistantContent: 'new answer',
            expectedActiveConversationId: 'conversation-a',
        },
        db
    );

    assert.equal(created.id, 'conversation-new');
    assert.deepEqual(scopeUpdates.at(-1), {
        where: { id: scopeRow.id },
        data: { activeConversationId: 'conversation-new' },
    });
    assert.equal(writes.length, 2);
});

test('a late new-draft completion persists its turn without stealing another tab active thread', async () => {
    const scopeUpdates: unknown[] = [];
    const writes: unknown[] = [];
    const otherTabConversation = 'conversation-selected-in-other-tab';
    const newConversation = { ...conversation, id: 'conversation-new', nextMessageSequence: 0 };
    const db = bareDb({
        chatConversationScope: {
            upsert: async () => ({
                ...scopeRow,
                activeConversationId: otherTabConversation,
            }),
            update: async (args: unknown) => {
                scopeUpdates.push(args);
                return { ...scopeRow, activeConversationId: otherTabConversation };
            },
        },
        chatConversation: {
            findFirst: async () => ({ ...newConversation, nextMessageSequence: 2 }),
            findMany: async () => [conversation, newConversation],
            create: async () => newConversation,
            updateMany: async () => ({ count: 1 }),
        },
        chatConversationMessage: {
            findMany: async () => [],
            create: async (args: unknown) => {
                writes.push(args);
                return { id: `message-${writes.length}` };
            },
            deleteMany: async () => ({ count: 0 }),
        },
    });

    const created = await createNewChatConversationWithTurnForOwner(
        {
            authCtx: owner,
            scope: segmentScope,
            userContent: 'new question',
            assistantContent: 'new answer',
            // The draft began while conversation-a was active. Before its
            // model result returned, a second tab selected another thread.
            expectedActiveConversationId: 'conversation-a',
        },
        db
    );

    assert.equal(created.id, 'conversation-new');
    assert.equal(writes.length, 2);
    assert.deepEqual(
        scopeUpdates.filter(value =>
            Boolean(
                (value as { data?: { activeConversationId?: unknown } }).data?.activeConversationId
            )
        ),
        []
    );
});

test('a new thread without a draft snapshot never mutates the shared active pointer', async () => {
    const scopeUpdates: unknown[] = [];
    const newConversation = { ...conversation, id: 'conversation-new', nextMessageSequence: 0 };
    const db = bareDb({
        chatConversationScope: {
            upsert: async () => ({ ...scopeRow, activeConversationId: 'conversation-a' }),
            update: async (args: unknown) => {
                scopeUpdates.push(args);
                return { ...scopeRow, activeConversationId: 'conversation-a' };
            },
        },
        chatConversation: {
            findFirst: async () => ({ ...newConversation, nextMessageSequence: 2 }),
            findMany: async () => [conversation, newConversation],
            create: async () => newConversation,
            updateMany: async () => ({ count: 1 }),
        },
    });

    await createNewChatConversationWithTurnForOwner(
        {
            authCtx: owner,
            scope: segmentScope,
            userContent: 'new question',
            assistantContent: 'new answer',
        },
        db
    );

    assert.deepEqual(
        scopeUpdates.filter(value =>
            Boolean(
                (value as { data?: { activeConversationId?: unknown } }).data?.activeConversationId
            )
        ),
        []
    );
});

test('a concurrent generation is rejected before it can reuse stale history', async () => {
    const db = bareDb({
        chatConversation: {
            findFirst: async () => conversation,
            findMany: async () => [conversation],
            create: async () => conversation,
            updateMany: async () => ({ count: 0 }),
        },
    });

    await assert.rejects(
        () =>
            claimChatConversationGenerationForOwner(
                { authCtx: owner, conversation, generationToken: 'generation-b' },
                db
            ),
        error => error instanceof GuardError && error.status === 409
    );
});

test('clear requires an explicit loaded thread and never falls back to a latest scope thread', async () => {
    let deleted = 0;
    const db = bareDb({
        chatConversationMessage: {
            findMany: async () => [],
            create: async () => ({ id: 'message-a' }),
            deleteMany: async () => {
                deleted += 1;
                return { count: 1 };
            },
        },
    });

    await assert.rejects(
        () =>
            clearChatConversationForOwner(
                { authCtx: owner, scope: segmentScope, conversationId: '' },
                db
            ),
        error => error instanceof GuardError && error.status === 400
    );
    assert.equal(deleted, 0);
});

test('clear refuses an active generation and cannot let a late turn recreate messages', async () => {
    let deleted = 0;
    const db = bareDb({
        chatConversation: {
            findFirst: async () => conversation,
            findMany: async () => [conversation],
            create: async () => conversation,
            updateMany: async () => ({ count: 0 }),
        },
        chatConversationMessage: {
            findMany: async () => [],
            create: async () => ({ id: 'message-a' }),
            deleteMany: async () => {
                deleted += 1;
                return { count: 1 };
            },
        },
    });

    await assert.rejects(
        () =>
            clearChatConversationForOwner(
                { authCtx: owner, scope: segmentScope, conversationId: conversation.id },
                db
            ),
        error => error instanceof GuardError && error.status === 409
    );
    assert.equal(deleted, 0);
});

test('clear invalidates a stale generation with the same lease window used by claiming', async () => {
    const updates: unknown[] = [];
    let deleted = 0;
    const now = new Date('2026-07-26T00:20:00.000Z');
    const db = bareDb({
        chatConversation: {
            findFirst: async () => conversation,
            findMany: async () => [conversation],
            create: async () => conversation,
            updateMany: async (args: unknown) => {
                updates.push(args);
                return { count: 1 };
            },
        },
        chatConversationMessage: {
            findMany: async () => [],
            create: async () => ({ id: 'message-a' }),
            deleteMany: async () => {
                deleted += 1;
                return { count: 1 };
            },
        },
    });

    await clearChatConversationForOwner(
        { authCtx: owner, scope: segmentScope, conversationId: conversation.id, now },
        db
    );

    assert.equal(deleted, 1);
    assert.deepEqual(updates, [
        {
            where: {
                id: conversation.id,
                userId: owner.userId,
                scopeId: scopeRow.id,
                OR: [
                    { generationToken: null },
                    { generationStartedAt: null },
                    { generationStartedAt: { lt: new Date('2026-07-26T00:10:00.000Z') } },
                ],
            },
            data: { updatedAt: now, generationToken: null, generationStartedAt: null },
        },
    ]);
});
