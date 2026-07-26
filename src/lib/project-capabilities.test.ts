import assert from 'node:assert/strict';
import test from 'node:test';
import { canWriteProjectForUser, withProjectWriteCapability } from './project-capabilities';

test('a tenant-visible project is writable only by its creator', () => {
    assert.equal(canWriteProjectForUser('project-creator', 'project-creator'), true);
    assert.equal(canWriteProjectForUser('project-creator', 'tenant-colleague'), false);
});

test('the dashboard capability is attached from the project owner and current user', () => {
    const project = withProjectWriteCapability(
        { id: 'project-1', userId: 'project-creator', tenantId: 'tenant-1' },
        'tenant-colleague'
    );

    assert.deepEqual(project, {
        id: 'project-1',
        userId: 'project-creator',
        tenantId: 'tenant-1',
        canWrite: false,
    });
});
