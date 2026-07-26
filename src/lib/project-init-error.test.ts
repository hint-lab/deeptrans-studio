import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createProjectInitApiError,
    createProjectInitStateError,
    resolveProjectInitErrorKind,
    resolveProjectInitParseFailureCode,
} from '@/lib/project-init-error';

test('only the explicit project-init API contract produces actionable UI states', () => {
    assert.equal(
        resolveProjectInitErrorKind(
            createProjectInitApiError({ error: '术语提取任务已更新，请刷新后重试' })
        ),
        'terms-cancel-updated'
    );
    assert.equal(
        resolveProjectInitErrorKind(createProjectInitApiError({ requiresNewBatch: true })),
        'terms-new-batch'
    );
    assert.equal(
        resolveProjectInitErrorKind(
            createProjectInitApiError({
                error: '文档已有分段或已进入后续阶段，禁止覆盖现有翻译内容',
            })
        ),
        'segment-conflict'
    );
});

test('parse state remains explicit while unknown request errors never retain server text', () => {
    const emptyDocument = createProjectInitApiError({ code: 'EMPTY_DOCUMENT' });
    assert.equal(resolveProjectInitErrorKind(emptyDocument), 'empty-document');
    assert.equal(resolveProjectInitParseFailureCode(emptyDocument), 'EMPTY_DOCUMENT');

    const unknown = createProjectInitApiError({
        error: 'database password rejected at internal-host:5432',
    });
    assert.equal(resolveProjectInitErrorKind(unknown), 'retry');
    assert.equal(unknown.message, 'project-init-request-failed');
    assert.equal(resolveProjectInitErrorKind(new Error('network socket closed')), 'retry');
});

test('local stage conflicts are explicit without borrowing a raw Error message', () => {
    assert.equal(
        resolveProjectInitErrorKind(createProjectInitStateError('document-stage-changed')),
        'document-stage-changed'
    );
});
