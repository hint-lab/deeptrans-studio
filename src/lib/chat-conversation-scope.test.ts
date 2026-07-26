import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canOperateChatConversation,
    chatConversationScopeKeyFromIds,
    resolveChatConversationLoadState,
    resolveVisibleChatConversationScope,
} from './chat-conversation-scope';

test('a newly rendered editor scope cannot operate on a previous loaded scope', () => {
    const previous = chatConversationScopeKeyFromIds('project-a', 'item-a');
    const current = chatConversationScopeKeyFromIds('project-a', 'item-b');

    assert.notEqual(previous, current);
    assert.equal(
        canOperateChatConversation({
            currentScopeKey: current,
            loadedScopeKey: previous,
            isLoading: false,
        }),
        false
    );
    assert.equal(
        canOperateChatConversation({
            currentScopeKey: current,
            loadedScopeKey: current,
            isLoading: false,
        }),
        true
    );
});

test('a selected segment owns chat scope before its next editor payload arrives', () => {
    const scope = resolveVisibleChatConversationScope({
        projectId: 'project-a',
        activeDocumentItemId: 'item-new',
        loadedDocumentItemId: 'item-old',
    });

    assert.deepEqual(scope, {
        projectId: 'project-a',
        documentItemId: 'item-new',
        usesLoadedDocumentItem: false,
    });
});

test('an unselected stale editor item does not silently become the chat scope', () => {
    const scope = resolveVisibleChatConversationScope({
        projectId: ' project-a ',
        activeDocumentItemId: '',
        loadedDocumentItemId: ' item-current ',
    });

    assert.deepEqual(scope, {
        projectId: 'project-a',
        documentItemId: '',
        usesLoadedDocumentItem: false,
    });
});

test('a failed saved-history request is never rendered as an empty ready conversation', () => {
    const current = chatConversationScopeKeyFromIds('project-a', 'item-new');
    const previous = chatConversationScopeKeyFromIds('project-a', 'item-old');

    assert.equal(
        resolveChatConversationLoadState({
            currentScopeKey: current,
            loadedScopeKey: null,
            isLoading: false,
            errorScopeKey: current,
        }),
        'error'
    );
    assert.equal(
        resolveChatConversationLoadState({
            currentScopeKey: current,
            loadedScopeKey: previous,
            isLoading: false,
            errorScopeKey: previous,
        }),
        'loading'
    );
    assert.equal(
        resolveChatConversationLoadState({
            currentScopeKey: current,
            loadedScopeKey: current,
            isLoading: false,
            errorScopeKey: null,
        }),
        'ready'
    );
});
