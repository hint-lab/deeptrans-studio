import assert from 'node:assert/strict';
import test from 'node:test';
import { getEditorContentSyncDecision } from './editor-content-sync';

test('does not reset the editor or write the store for its own Redux echo', () => {
    assert.deepEqual(
        getEditorContentSyncDecision({
            previousEditorId: 'item-1',
            editorId: 'item-1',
            incomingContent: '<p>typed text</p>',
            lastLocalContent: '<p>typed text</p>',
            currentEditorContent: '<p>typed text</p>',
        }),
        {
            isLocalEcho: true,
            shouldSetEditorContent: false,
            shouldSyncStore: false,
        }
    );
});

test('replaces the editor for genuine external content changes', () => {
    assert.deepEqual(
        getEditorContentSyncDecision({
            previousEditorId: 'item-1',
            editorId: 'item-1',
            incomingContent: '<p>saved remotely</p>',
            lastLocalContent: '<p>local draft</p>',
            currentEditorContent: '<p>local draft</p>',
        }),
        {
            isLocalEcho: false,
            shouldSetEditorContent: true,
            shouldSyncStore: true,
        }
    );
});

test('synchronizes an empty document when switching items', () => {
    assert.deepEqual(
        getEditorContentSyncDecision({
            previousEditorId: 'item-1',
            editorId: 'item-2',
            incomingContent: '',
            lastLocalContent: '<p>item one</p>',
            currentEditorContent: '<p>item one</p>',
        }),
        {
            isLocalEcho: false,
            shouldSetEditorContent: true,
            shouldSyncStore: true,
        }
    );
});
