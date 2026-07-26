import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectInitRequestScopeGate } from './project-init-request-scope';

test('a project switch invalidates every older initialization response', () => {
    const gate = createProjectInitRequestScopeGate();
    gate.sync('project-a', 'batch-a');
    const request = gate.capture();

    gate.sync('project-b', 'batch-b');

    assert.equal(gate.isCurrent(request), false);
});

test('a retry batch invalidates a response from the canceled batch', () => {
    const gate = createProjectInitRequestScopeGate();
    gate.sync('project-a', 'batch-before-cancel');
    const request = gate.capture();

    gate.sync('project-a', 'batch-retry');

    assert.equal(gate.isCurrent(request), false);
});

test('a scope remains valid until its project or batch changes', () => {
    const gate = createProjectInitRequestScopeGate();
    gate.sync('project-a', 'batch-a');
    const request = gate.capture();
    gate.sync('project-a', 'batch-a');

    assert.equal(gate.isCurrent(request), true);
});
