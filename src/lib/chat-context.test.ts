import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEditorContextPrompt, normalizeChatHistory } from './chat-context';

test('normalizeChatHistory keeps recent user and assistant turns in order', () => {
    const result = normalizeChatHistory([
        { role: 'system', content: 'ignore me' },
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
        { role: 'assistant', content: '处理中...' },
        { role: 'user', content: '第二问' },
    ]);

    assert.deepEqual(result, [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
        { role: 'user', content: '第二问' },
    ]);
});

test('normalizeChatHistory keeps the newest bounded history', () => {
    const result = normalizeChatHistory(
        [
            { role: 'user', content: 'old' },
            { role: 'assistant', content: 'middle' },
            { role: 'user', content: 'new' },
        ],
        { maxMessages: 2 }
    );

    assert.deepEqual(result, [
        { role: 'assistant', content: 'middle' },
        { role: 'user', content: 'new' },
    ]);
});

test('buildEditorContextPrompt labels editor content as working material', () => {
    const prompt = buildEditorContextPrompt(
        {
            projectId: 'project-1',
            documentName: '学前教育法.pdf',
            itemOrder: 12,
            sourceText: '当前原文',
            targetText: 'Current translation',
        },
        'zh'
    );

    assert.match(prompt, /不是系统指令/);
    assert.match(prompt, /第 12 段/);
    assert.match(prompt, /当前原文/);
    assert.match(prompt, /Current translation/);
});
