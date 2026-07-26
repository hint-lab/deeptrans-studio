import assert from 'node:assert/strict';
import test from 'node:test';

import {
    INITIAL_PREVIEW_DEPENDENCY_STATES,
    PreviewTimeoutError,
    arePreviewDependenciesReady,
    getFailedPreviewDependencies,
    getPreviewDependencies,
    withPreviewTimeout,
} from './preview-dependencies';

test('requires only the CDN dependency needed by each preview format', () => {
    assert.deepEqual(getPreviewDependencies('pdf'), ['pdfjs']);
    assert.deepEqual(getPreviewDependencies('docx'), ['jszip', 'docx']);
    assert.deepEqual(getPreviewDependencies('text'), []);
    assert.deepEqual(getPreviewDependencies('unknown'), []);
});

test('does not mark a format ready until every required dependency is ready', () => {
    assert.equal(arePreviewDependenciesReady('pdf', INITIAL_PREVIEW_DEPENDENCY_STATES), false);
    assert.equal(arePreviewDependenciesReady('docx', INITIAL_PREVIEW_DEPENDENCY_STATES), false);
    assert.equal(
        arePreviewDependenciesReady('pdf', {
            ...INITIAL_PREVIEW_DEPENDENCY_STATES,
            pdfjs: 'ready',
        }),
        true
    );
    assert.equal(
        arePreviewDependenciesReady('docx', {
            ...INITIAL_PREVIEW_DEPENDENCY_STATES,
            jszip: 'ready',
            docx: 'loading',
        }),
        false
    );
    assert.equal(
        arePreviewDependenciesReady('docx', {
            ...INITIAL_PREVIEW_DEPENDENCY_STATES,
            jszip: 'ready',
            docx: 'ready',
        }),
        true
    );
});

test('reports only failed dependencies that affect the current preview format', () => {
    const states = {
        ...INITIAL_PREVIEW_DEPENDENCY_STATES,
        pdfjs: 'failed' as const,
        jszip: 'failed' as const,
        docx: 'ready' as const,
    };

    assert.deepEqual(getFailedPreviewDependencies('pdf', states), ['pdfjs']);
    assert.deepEqual(getFailedPreviewDependencies('docx', states), ['jszip']);
    assert.deepEqual(getFailedPreviewDependencies('text', states), []);
});

test('bounds a stalled worker or renderer instead of leaving preview loading forever', async () => {
    await assert.rejects(
        withPreviewTimeout(new Promise<never>(() => {}), 5),
        error => error instanceof PreviewTimeoutError
    );
    await assert.doesNotReject(withPreviewTimeout(Promise.resolve('ready'), 5));
});
