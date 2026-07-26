import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveUncommittedChatTurnReconciliation } from './chat-turn-reconciliation';

test('an uncommitted existing turn reloads its exact authoritative thread', () => {
    assert.deepEqual(
        resolveUncommittedChatTurnReconciliation({
            requestScopeKey: 'project=a;item=b',
            currentScopeKey: 'project=a;item=b',
            isRequestFresh: true,
            isNewConversation: false,
            conversationId: 'conversation-a',
        }),
        { kind: 'reload-existing', conversationId: 'conversation-a' }
    );
});

test('an uncommitted new thread stays a blank draft instead of loading a latest thread', () => {
    assert.deepEqual(
        resolveUncommittedChatTurnReconciliation({
            requestScopeKey: 'project=a;item=b',
            currentScopeKey: 'project=a;item=b',
            isRequestFresh: true,
            isNewConversation: true,
        }),
        { kind: 'reset-new-draft' }
    );
});

test('stale scope and missing explicit ids both fail closed', () => {
    assert.deepEqual(
        resolveUncommittedChatTurnReconciliation({
            requestScopeKey: 'project=a;item=old',
            currentScopeKey: 'project=a;item=new',
            isRequestFresh: true,
            isNewConversation: false,
            conversationId: 'conversation-a',
        }),
        { kind: 'ignore' }
    );
    assert.deepEqual(
        resolveUncommittedChatTurnReconciliation({
            requestScopeKey: 'project=a;item=b',
            currentScopeKey: 'project=a;item=b',
            isRequestFresh: true,
            isNewConversation: false,
        }),
        { kind: 'fail-closed' }
    );
});
