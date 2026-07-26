import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProjectInitPersistOutcome } from './project-init-persist';

test('advances from parse only after a successful artifact persistence response', () => {
    assert.deepEqual(resolveProjectInitPersistOutcome({ ok: true, step: 'persist' }), {
        kind: 'advance-to-segment',
    });
    assert.equal(resolveProjectInitPersistOutcome({ ok: true, step: 'parse' }), null);
    assert.equal(resolveProjectInitPersistOutcome({ ok: false, step: 'persist' }), null);
    assert.equal(resolveProjectInitPersistOutcome(null), null);
});

test('uses the current server document status when persistence was completed elsewhere', () => {
    assert.deepEqual(
        resolveProjectInitPersistOutcome({ ok: true, skipped: true, status: 'SEGMENTING' }),
        { kind: 'resume', target: 'segment' }
    );
    assert.deepEqual(
        resolveProjectInitPersistOutcome({ ok: true, skipped: true, status: 'TERMS_EXTRACTING' }),
        { kind: 'resume', target: 'terms' }
    );
    assert.deepEqual(
        resolveProjectInitPersistOutcome({ ok: true, skipped: true, status: 'COMPLETED' }),
        { kind: 'resume', target: 'ide' }
    );
    assert.equal(
        resolveProjectInitPersistOutcome({ ok: true, skipped: true, status: 'PARSING' }),
        null
    );
});
