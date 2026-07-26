import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { getSnapshotlessWorkflowStatusRejection } from './workflow-status-route-policy';

test('a snapshotless workflow request cannot bypass post-edit sign-off', () => {
    assert.deepEqual(getSnapshotlessWorkflowStatusRejection('SIGN_OFF'), {
        status: 409,
        error: '译后复核签发需要保存当前译文，请在工作台中保存或单项签发后重试',
    });
});

test('other workflow transitions remain available to their guarded route', () => {
    assert.equal(getSnapshotlessWorkflowStatusRejection('QA_REVIEW'), undefined);
});

test('workflow route delegates snapshotless SIGN_OFF requests to the 409 policy', () => {
    const route = fs.readFileSync(
        path.join(process.cwd(), 'src', 'app', 'api', 'items', '[id]', 'workflow', 'route.ts'),
        'utf8'
    );

    assert.match(route, /getSnapshotlessWorkflowStatusRejection\(status\)/);
    assert.match(route, /status:\s*protectedTransition\.status/);
    assert.doesNotMatch(route, /updateDocItemStatusAction\(id,\s*['"]SIGN_OFF['"]\)/);
});
