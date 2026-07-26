import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
    resolveChatClientErrorMessage,
    resolveRichTextEditorSaveFailure,
} from './ide-client-error';
import { chatStatus } from './chat-status';
import { MEMORY_SEARCH_INCOMPLETE_MESSAGE } from './memory-search';

test('chat client error boundary preserves only the route status vocabulary', () => {
    const statuses = chatStatus('zh');

    assert.equal(
        resolveChatClientErrorMessage(
            new Error('connect ECONNREFUSED 10.0.0.4:6379 queue=chat'),
            'zh',
            statuses.unavailable
        ),
        statuses.unavailable
    );
    assert.equal(
        resolveChatClientErrorMessage(
            new Error(statuses.persistenceFailed),
            'zh',
            statuses.requestFailed
        ),
        statuses.persistenceFailed
    );
    assert.equal(
        resolveChatClientErrorMessage(
            new Error(statuses.interrupted),
            'zh',
            statuses.requestFailed
        ),
        statuses.interrupted
    );
    assert.equal(
        resolveChatClientErrorMessage(
            new Error(MEMORY_SEARCH_INCOMPLETE_MESSAGE),
            'zh',
            statuses.unavailable
        ),
        MEMORY_SEARCH_INCOMPLETE_MESSAGE
    );
    assert.equal(
        resolveChatClientErrorMessage(
            new Error('database password rejected by private-host'),
            'zh',
            statuses.unavailable
        ),
        statuses.unavailable
    );
});

test('rich text editor maps only explicit optimistic-concurrency states', () => {
    assert.equal(
        resolveRichTextEditorSaveFailure(
            new Error(
                '当前原文或译文已被其他窗口更新；本次修改未保存也未签发。请刷新后查看最新版本，再重新编辑。'
            )
        ),
        'changed-elsewhere'
    );
    assert.equal(
        resolveRichTextEditorSaveFailure(new Error('当前分段不处于译后复核，请刷新后再保存或签发')),
        'review-state-changed'
    );
    assert.equal(
        resolveRichTextEditorSaveFailure(new Error('PrismaClientKnownRequestError: P1001')),
        null
    );
});

test('IDE chat, explorer, and editor route failures through stable UI messages', () => {
    const chat = readFileSync(
        resolve(process.cwd(), 'src', 'app', '(app)', 'ide', '[id]', 'components', 'chat.tsx'),
        'utf8'
    );
    const explorer = readFileSync(
        resolve(process.cwd(), 'src', 'app', '(app)', 'ide', '[id]', 'components', 'explorer.tsx'),
        'utf8'
    );
    const editor = readFileSync(
        resolve(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'ide',
            '[id]',
            'components',
            'parallel-editor',
            'rich-text',
            'editor.tsx'
        ),
        'utf8'
    );

    assert.match(chat, /resolveChatClientErrorMessage/);
    assert.doesNotMatch(chat, /toast\.error\(error instanceof Error \? error\.message/);
    assert.doesNotMatch(chat, /input\.error instanceof Error\s*\?\s*input\.error\.message/);
    assert.doesNotMatch(chat, /throw new Error\(String\(payload\.error/);
    assert.doesNotMatch(explorer, /toast\.error\(error instanceof Error \? error\.message/);
    assert.match(editor, /resolveRichTextEditorSaveFailure/);
    assert.doesNotMatch(editor, /String\(e\)/);
});
