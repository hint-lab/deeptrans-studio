import assert from 'node:assert/strict';
import test from 'node:test';

import { actionableActionError } from './actionable-action-error';
import { publicActionErrorMessage, rethrowPublicActionError } from './action-error-boundary';
import { GuardError } from './guards';

test('only preserves deliberately actionable and guard error messages', () => {
    const guard = new GuardError(404, '文档不存在或无权访问');
    const actionable = actionableActionError('当前分段已被其他操作更新，请刷新后重试');

    assert.equal(publicActionErrorMessage(guard, '服务暂不可用'), guard.message);
    assert.equal(publicActionErrorMessage(actionable, '服务暂不可用'), actionable.message);
    assert.equal(
        publicActionErrorMessage(
            new Error('connect ECONNREFUSED postgres.internal:5432 password=not-safe'),
            '服务暂不可用'
        ),
        '服务暂不可用'
    );
});

test('rethrow boundary retains safe errors and replaces infrastructure details', () => {
    const guard = new GuardError(401, '未授权');
    assert.throws(
        () => rethrowPublicActionError(guard, '操作失败'),
        error => error === guard
    );
    assert.throws(
        () => rethrowPublicActionError(new Error('database password rejected'), '操作失败'),
        /操作失败/
    );
});
