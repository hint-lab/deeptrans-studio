import assert from 'node:assert/strict';
import test from 'node:test';

import { expectedChatActiveConversationId } from './chat-active-conversation';

test('new-thread active snapshots preserve the distinction between absent and explicit empty', () => {
    assert.equal(expectedChatActiveConversationId({}), undefined);
    assert.equal(expectedChatActiveConversationId({ expectedActiveConversationId: null }), null);
    assert.equal(
        expectedChatActiveConversationId({ expectedActiveConversationId: ' conversation-a ' }),
        'conversation-a'
    );
});

test('malformed or blank active snapshots never guess a shared default', () => {
    assert.equal(expectedChatActiveConversationId({ expectedActiveConversationId: '' }), undefined);
    assert.equal(
        expectedChatActiveConversationId({ expectedActiveConversationId: 123 }),
        undefined
    );
});
