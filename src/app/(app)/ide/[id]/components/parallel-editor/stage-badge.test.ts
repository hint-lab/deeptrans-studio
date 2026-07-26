import assert from 'node:assert/strict';
import test from 'node:test';

import { getAcceptFailureRollbackStage } from './stage-badge';

test('never compensates a failed NOT_STARTED pre-translation claim', () => {
    assert.equal(getAcceptFailureRollbackStage('NOT_STARTED'), undefined);
});

test('does not compensate a failed strict QA claim', () => {
    assert.equal(getAcceptFailureRollbackStage('MT_REVIEW'), undefined);
    assert.equal(getAcceptFailureRollbackStage('QA_REVIEW'), 'QA_REVIEW');
    assert.equal(getAcceptFailureRollbackStage('POST_EDIT'), undefined);
});
