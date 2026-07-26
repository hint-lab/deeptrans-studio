import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectInitDeferredActionGate } from './project-init-deferred-action';

test('a cancelled delayed project-init action cannot start after its timer fires', () => {
    const gate = createProjectInitDeferredActionGate();
    const scheduled = gate.begin();

    gate.cancel();

    assert.equal(gate.isCurrent(scheduled), false);
});

test('a newer delayed project-init action supersedes an older timer', () => {
    const gate = createProjectInitDeferredActionGate();
    const first = gate.begin();
    const second = gate.begin();

    assert.equal(gate.isCurrent(first), false);
    assert.equal(gate.isCurrent(second), true);
});
