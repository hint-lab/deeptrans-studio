import assert from 'node:assert/strict';
import test from 'node:test';

import { isCurrentHelpPanelRequest } from './help-panel-request';

test('accepts help-panel output only for the latest request and current key', () => {
    assert.equal(isCurrentHelpPanelRequest(2, 2, '/zh/docs/faq', '/zh/docs/faq'), true);
    assert.equal(isCurrentHelpPanelRequest(1, 2, '/zh/docs/faq', '/zh/docs/faq'), false);
    assert.equal(
        isCurrentHelpPanelRequest(2, 2, '/zh/docs/faq', '/zh/docs/getting-started'),
        false
    );
    assert.equal(isCurrentHelpPanelRequest(2, 2, '', ''), false);
});
