import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
    resolveSingleQaClientErrorMessage,
    resolveTextTranslationErrorMessage,
} from './translation-client-error';

test('text translation keeps only its locally-created empty-result state', () => {
    assert.equal(
        resolveTextTranslationErrorMessage(new Error('翻译服务未返回结果')),
        '翻译服务未返回结果'
    );
    assert.equal(
        resolveTextTranslationErrorMessage(
            new Error('ECONNREFUSED provider.internal apiKey=not-for-browser')
        ),
        '翻译失败，请稍后重试'
    );
});

test('single QA keeps exact workflow conflicts and suppresses remote details', () => {
    assert.equal(
        resolveSingleQaClientErrorMessage(
            new Error('当前分段译文已变化，请保存并刷新后再启动质检'),
            false
        ),
        '当前分段译文已变化，请保存并刷新后再启动质检'
    );
    assert.equal(
        resolveSingleQaClientErrorMessage(
            new Error('provider timeout while reading database password=unsafe'),
            false
        ),
        '质检失败：请检查网络连接或稍后再试'
    );
    assert.equal(
        resolveSingleQaClientErrorMessage(new Error('API validation failed'), true),
        '质检运行未完成，分段仍停留在质检阶段。请刷新确认后显式驳回再重试。'
    );
});

test('the two translation views resolve errors before rendering them', () => {
    const root = process.cwd();
    const table = readFileSync(
        resolve(
            root,
            'src',
            'app',
            '(app)',
            'dashboard',
            'translation',
            'components',
            'text-translation-table.tsx'
        ),
        'utf8'
    );
    const actionSection = readFileSync(
        resolve(
            root,
            'src',
            'app',
            '(app)',
            'ide',
            '[id]',
            'components',
            'menu',
            'action-section.tsx'
        ),
        'utf8'
    );

    assert.match(table, /resolveTextTranslationErrorMessage/);
    assert.doesNotMatch(table, /error instanceof Error \? error\.message/);
    assert.match(actionSection, /resolveSingleQaClientErrorMessage/);
    assert.doesNotMatch(actionSection, /error\.message\?\.includes\('timeout'\)/);
});
