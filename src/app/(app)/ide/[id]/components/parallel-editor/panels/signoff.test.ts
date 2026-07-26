import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSignoffTimeline, buildSignoffTimelineForLoadState } from './signoff';

test('preserves an explicit failed event when the current workflow status is later', () => {
    const timeline = buildSignoffTimeline(
        [
            {
                id: 'qa-failed',
                stepKey: 'QA',
                actorType: 'AGENT',
                status: 'FAILED',
                finishedAt: '2026-07-26T10:00:00.000Z',
            },
        ],
        'POST_EDIT'
    );

    assert.equal(timeline.get('QA')?.status, 'FAILED');
    assert.equal(timeline.get('QA')?.actor, 'Agent');
});

test('fills an idle or unclosed prior stage from a later current status', () => {
    const timeline = buildSignoffTimeline(
        [
            {
                id: 'qa-review-started',
                stepKey: 'QA_REVIEW',
                actorType: 'USER',
                status: 'STARTED',
                startedAt: '2026-07-26T10:00:00.000Z',
            },
        ],
        'POST_EDIT_REVIEW'
    );

    assert.equal(timeline.get('MT')?.status, 'SUCCESS');
    assert.equal(timeline.get('MT')?.actor, 'System');
    assert.equal(timeline.get('NOT_STARTED')?.status, 'IDLE');
    assert.equal(timeline.get('NOT_STARTED')?.actor, '—');
    assert.equal(timeline.get('QA_REVIEW')?.status, 'SUCCESS');
    assert.equal(timeline.get('QA_REVIEW')?.actor, 'Human');
    assert.equal(timeline.get('POST_EDIT_REVIEW')?.status, 'STARTED');
});

test('treats a current review as in progress when a legacy event marked it successful early', () => {
    const timeline = buildSignoffTimeline(
        [
            {
                id: 'post-edit-review-success-too-early',
                stepKey: 'POST_EDIT_REVIEW',
                actorType: 'USER',
                status: 'SUCCESS',
                finishedAt: '2026-07-26T10:00:00.000Z',
            },
        ],
        'POST_EDIT_REVIEW'
    );

    assert.equal(timeline.get('POST_EDIT_REVIEW')?.status, 'STARTED');
    assert.equal(timeline.get('POST_EDIT_REVIEW')?.actor, 'Human');
});

test('does not infer success when the audit-event read failed', () => {
    const unavailableTimeline = buildSignoffTimelineForLoadState([], 'QA', 'error');
    const emptyTimeline = buildSignoffTimelineForLoadState([], 'QA', 'ready');

    // A failed fetch contains no evidence that MT completed or QA started.
    assert.equal(unavailableTimeline.get('MT')?.status, 'IDLE');
    assert.equal(unavailableTimeline.get('QA')?.status, 'IDLE');

    // A confirmed empty audit trail retains the documented current-stage fallback.
    assert.equal(emptyTimeline.get('MT')?.status, 'SUCCESS');
    assert.equal(emptyTimeline.get('QA')?.status, 'STARTED');
});
