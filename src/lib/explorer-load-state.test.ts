import assert from 'node:assert/strict';
import test from 'node:test';

import {
    completeExplorerLoad,
    failExplorerLoad,
    initialExplorerLoadState,
    isCurrentExplorerLoadRequest,
    startExplorerLoad,
} from './explorer-load-state';

test('distinguishes first load, a verified empty project, and a failed load', () => {
    assert.deepEqual(initialExplorerLoadState, {
        phase: 'loading',
        hasLoadedResult: false,
        isRefreshing: false,
        hasError: false,
    });

    assert.deepEqual(completeExplorerLoad(0), {
        phase: 'empty',
        hasLoadedResult: true,
        isRefreshing: false,
        hasError: false,
    });

    assert.deepEqual(failExplorerLoad(initialExplorerLoadState), {
        phase: 'error',
        hasLoadedResult: false,
        isRefreshing: false,
        hasError: true,
    });
});

test('keeps a loaded tree visible when a later refresh fails', () => {
    const ready = completeExplorerLoad(3);
    const refreshing = startExplorerLoad(ready);

    assert.deepEqual(refreshing, {
        phase: 'ready',
        hasLoadedResult: true,
        isRefreshing: true,
        hasError: false,
    });

    assert.deepEqual(failExplorerLoad(refreshing), {
        phase: 'ready',
        hasLoadedResult: true,
        isRefreshing: false,
        hasError: true,
    });
});

test('accepts only the newest response for the displayed project', () => {
    assert.equal(isCurrentExplorerLoadRequest(2, 2, 'project-current', 'project-current'), true);
    assert.equal(isCurrentExplorerLoadRequest(1, 2, 'project-current', 'project-current'), false);
    assert.equal(isCurrentExplorerLoadRequest(2, 2, 'project-current', 'project-old'), false);
});
