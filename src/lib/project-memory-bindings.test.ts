import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveOwnedProjectMemoryBindings } from './project-memory-bindings';

test('keeps foreign project-memory ids server-side and reports a repairable legacy count', () => {
    assert.deepEqual(
        resolveOwnedProjectMemoryBindings(
            [
                { memoryId: 'owner-memory', memory: { userId: 'owner-a' } },
                { memoryId: 'foreign-memory', memory: { userId: 'owner-b' } },
            ],
            'owner-a'
        ),
        { memoryIds: ['owner-memory'], inaccessibleBindingCount: 1 }
    );
});

test('does not treat a failed bindings query as a usable empty selection', () => {
    assert.equal(resolveOwnedProjectMemoryBindings(null, 'owner-a'), null);
});
