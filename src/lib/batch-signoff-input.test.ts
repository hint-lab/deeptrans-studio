import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBatchSignoffInput } from './batch-signoff-input';

test('batch sign-off uses the just-read server target as both CAS base and signed target', () => {
    assert.deepEqual(
        buildBatchSignoffInput({
            sourceText: '<p>Article 1</p>',
            targetText: '<p>第一条</p>',
        }),
        {
            expectedSourceText: '<p>Article 1</p>',
            expectedTargetText: '<p>第一条</p>',
            targetText: '<p>第一条</p>',
        }
    );
});

test('batch sign-off refuses incomplete server content before attempting CAS', () => {
    assert.throws(
        () => buildBatchSignoffInput({ sourceText: 'Article 1', targetText: '' }),
        /为空/
    );
});
