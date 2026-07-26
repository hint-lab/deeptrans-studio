import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EXPLORER_TABS_UNAVAILABLE_MESSAGE,
    getExplorerTabsApiErrorMessage,
} from './explorer-tabs-api-error';

test('does not expose unexpected Explorer tabs errors through the API', () => {
    assert.equal(
        getExplorerTabsApiErrorMessage(500, 'database password rejected for internal-host'),
        EXPLORER_TABS_UNAVAILABLE_MESSAGE
    );
    assert.equal(
        getExplorerTabsApiErrorMessage(503, 'redis connection refused'),
        EXPLORER_TABS_UNAVAILABLE_MESSAGE
    );
});

test('keeps actionable client errors intact', () => {
    assert.equal(getExplorerTabsApiErrorMessage(401, '未授权'), '未授权');
    assert.equal(
        getExplorerTabsApiErrorMessage(404, '项目不存在或无权访问'),
        '项目不存在或无权访问'
    );
});
