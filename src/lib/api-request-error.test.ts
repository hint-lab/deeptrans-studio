import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { API_REQUEST_UNAVAILABLE_MESSAGE, apiRequestFailureMessage } from './api-request-error';

test('maps HTTP failures through a bounded browser-safe vocabulary', () => {
    assert.equal(apiRequestFailureMessage(400), '请求参数无效，请检查后重试');
    assert.equal(apiRequestFailureMessage(401), '登录状态已失效，请重新登录');
    assert.equal(apiRequestFailureMessage(403), '无权执行此操作');
    assert.equal(apiRequestFailureMessage(404), '请求的资源不存在或已不可用');
    assert.equal(apiRequestFailureMessage(409), '请求状态已变化，请刷新后重试');
    assert.equal(apiRequestFailureMessage(413), '请求内容过大，请缩小后重试');
    assert.equal(apiRequestFailureMessage(429), '请求过于频繁，请稍后重试');
    assert.equal(apiRequestFailureMessage(500), API_REQUEST_UNAVAILABLE_MESSAGE);
});

test('legacy API client does not serialize remote detail or caught error text', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/api/api-request.ts'), 'utf8');

    assert.match(source, /apiRequestFailureMessage\(response\.status\)/);
    assert.match(source, /API_REQUEST_UNAVAILABLE_MESSAGE/);
    assert.doesNotMatch(source, /errorData\.detail/);
    assert.doesNotMatch(source, /error\.message/);
    assert.doesNotMatch(source, /console\.error/);
});
