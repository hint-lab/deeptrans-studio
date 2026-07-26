import assert from 'node:assert/strict';
import test from 'node:test';

import { isDemoAccount } from './demo-user';

test('the fixed demo account is active only in an explicit demo environment', () => {
    assert.equal(isDemoAccount('test@example.com', { IS_DEMO: 'yes' }), true);
    assert.equal(isDemoAccount(' TEST@EXAMPLE.COM ', { IS_DEMO: 'yes' }), true);
    assert.equal(isDemoAccount('test@example.com', { IS_DEMO: 'no' }), false);
    assert.equal(isDemoAccount('test@example.com', {}), false);
    assert.equal(isDemoAccount('other@example.com', { IS_DEMO: 'yes' }), false);
});
