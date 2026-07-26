import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sourceRevision } from './source-revision';
import { buildPostEditReviewDraftUpdate } from './post-edit-review-draft';
import {
    requiresPostEditReviewDraftCAS,
    resolvePostEditReviewDraft,
} from './post-edit-review-draft-client';

const version = new Date('2026-07-26T09:00:00.000Z');

function reviewItem(overrides: Record<string, unknown> = {}) {
    return {
        id: 'item-1',
        status: 'POST_EDIT_REVIEW',
        sourceText: 'Article 1',
        targetText: 'First translation',
        metadata: { retained: true },
        updatedAt: version,
        ...overrides,
    };
}

test('builds an exact post-edit draft save compare-and-set', () => {
    const update = buildPostEditReviewDraftUpdate(reviewItem(), {
        expectedSourceText: 'Article 1',
        expectedTargetText: 'First translation',
        targetText: 'Edited translation',
        mode: 'save',
    });

    assert.deepEqual(update.where, {
        id: 'item-1',
        status: 'POST_EDIT_REVIEW',
        sourceText: 'Article 1',
        targetText: 'First translation',
        updatedAt: version,
    });
    assert.deepEqual(update.data, {
        targetText: 'Edited translation',
        metadata: {
            retained: true,
            targetSourceRevision: sourceRevision('Article 1'),
        },
    });
});

test('builds one atomic write for a live draft and sign-off transition', () => {
    const update = buildPostEditReviewDraftUpdate(reviewItem(), {
        expectedSourceText: 'Article 1',
        expectedTargetText: 'First translation',
        targetText: 'Visible editor draft',
        mode: 'signoff',
    });

    assert.equal(update.data.targetText, 'Visible editor draft');
    assert.equal(update.data.status, 'SIGN_OFF');
});

test('rejects stale snapshots, a wrong stage, and an empty sign-off draft before writing', () => {
    assert.throws(
        () =>
            buildPostEditReviewDraftUpdate(reviewItem({ targetText: 'Other tab edit' }), {
                expectedSourceText: 'Article 1',
                expectedTargetText: 'First translation',
                targetText: 'Visible editor draft',
                mode: 'signoff',
            }),
        /其他窗口更新/
    );
    assert.throws(
        () =>
            buildPostEditReviewDraftUpdate(reviewItem({ status: 'SIGN_OFF' }), {
                expectedSourceText: 'Article 1',
                expectedTargetText: 'First translation',
                targetText: 'Visible editor draft',
                mode: 'signoff',
            }),
        /不处于译后复核/
    );
    assert.throws(
        () =>
            buildPostEditReviewDraftUpdate(reviewItem(), {
                expectedSourceText: 'Article 1',
                expectedTargetText: 'First translation',
                targetText: '   ',
                mode: 'signoff',
            }),
        /译文为空/
    );
});

test('uses the live editor draft but keeps the persisted snapshot as the CAS precondition', () => {
    assert.deepEqual(
        resolvePostEditReviewDraft({
            liveEditorTargetText: 'Unsaved TipTap draft',
            fallbackTargetText: 'Redux echo',
            persistedTargetText: 'Saved version',
        }),
        {
            targetText: 'Unsaved TipTap draft',
            expectedTargetText: 'Saved version',
        }
    );
});

test('marks generic post-edit review sign-off as a protected transition', () => {
    assert.equal(requiresPostEditReviewDraftCAS('POST_EDIT_REVIEW', 'SIGN_OFF'), true);
    assert.equal(requiresPostEditReviewDraftCAS('SIGN_OFF', 'COMPLETED'), false);
});

test('generic status action rejects the protected post-edit sign-off transition', () => {
    const action = fs.readFileSync(
        path.join(process.cwd(), 'src', 'actions', 'document-item.ts'),
        'utf8'
    );

    assert.match(action, /requiresPostEditReviewDraftCAS\(currentStatus, s\)/);
    assert.match(action, /译后复核签发必须通过受保护的保存流程/);
});
