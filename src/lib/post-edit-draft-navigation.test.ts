import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canLeaveCurrentPostEditDraft,
    hasUnsavedPostEditDraft,
} from './post-edit-draft-navigation';

const dirtyReview = {
    activeItemId: 'item-1',
    currentStage: 'POST_EDIT_REVIEW',
    editorItemId: 'item-1',
    editorJob: 'translation',
    editorDirty: 'true',
};

test('recognizes only the active post-edit target editor as an unsaved draft', () => {
    assert.equal(hasUnsavedPostEditDraft(dirtyReview), true);
    assert.equal(hasUnsavedPostEditDraft({ ...dirtyReview, currentStage: 'SIGN_OFF' }), false);
    assert.equal(hasUnsavedPostEditDraft({ ...dirtyReview, editorItemId: 'item-2' }), false);
    assert.equal(hasUnsavedPostEditDraft({ ...dirtyReview, editorDirty: 'false' }), false);
});

test('keeps the current segment when the user cancels draft discard', () => {
    let prompted = 0;
    const allowed = canLeaveCurrentPostEditDraft(dirtyReview, () => {
        prompted += 1;
        return false;
    });

    assert.equal(allowed, false);
    assert.equal(prompted, 1);
});

test('does not prompt when the current editor has no unsaved post-edit draft', () => {
    let prompted = 0;
    const allowed = canLeaveCurrentPostEditDraft({ ...dirtyReview, editorDirty: 'false' }, () => {
        prompted += 1;
        return false;
    });

    assert.equal(allowed, true);
    assert.equal(prompted, 0);
});
