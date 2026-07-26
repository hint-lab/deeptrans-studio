import assert from 'node:assert/strict';
import test from 'node:test';

import { chatStatus } from './chat-status';

test('chat terminal status text follows the requested locale', () => {
    assert.match(chatStatus('en-US').protocolFailed, /invalid response/i);
    assert.match(chatStatus('zh-CN').protocolFailed, /无效响应/);
    assert.match(chatStatus('en').busy, /still generating/i);
    assert.match(chatStatus('zh').busy, /仍在生成/);
});
