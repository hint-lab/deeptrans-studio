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

test('fills only a genuinely idle prior stage from a later current status', () => {
    const timeline = buildSignoffTimeline([], 'QA');

    assert.equal(timeline.get('MT')?.status, 'SUCCESS');
    assert.equal(timeline.get('MT')?.actor, 'System');
    assert.equal(timeline.get('QA')?.status, 'STARTED');
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
