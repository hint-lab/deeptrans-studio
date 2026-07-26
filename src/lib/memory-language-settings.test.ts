import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
    buildMemoryLanguageUpdateInput,
    hasMemoryLanguageUpdate,
    normalizeMemoryLanguagePair,
    sanitizeMemoryLanguageUpdateInput,
} from './memory-language-settings';

test('keeps an unchanged language pair from producing a write', () => {
    const pair = { sourceLang: 'en', targetLang: 'zh' };

    assert.deepEqual(buildMemoryLanguageUpdateInput(pair, pair), {});
    assert.equal(hasMemoryLanguageUpdate(pair, pair), false);
});

test('does not turn empty placeholder fields into a language metadata clear', () => {
    assert.deepEqual(
        buildMemoryLanguageUpdateInput(
            { sourceLang: 'en', targetLang: 'zh' },
            { sourceLang: '', targetLang: '' }
        ),
        {}
    );
    assert.deepEqual(sanitizeMemoryLanguageUpdateInput({ sourceLang: ' ', targetLang: '' }), {});
});

test('only sends non-empty language fields that actually changed', () => {
    assert.deepEqual(
        buildMemoryLanguageUpdateInput(
            { sourceLang: 'en', targetLang: 'zh' },
            { sourceLang: ' de ', targetLang: 'zh' }
        ),
        { sourceLang: 'de' }
    );
    assert.deepEqual(
        sanitizeMemoryLanguageUpdateInput({ sourceLang: ' en ', targetLang: ' zh ' }),
        { sourceLang: 'en', targetLang: 'zh' }
    );
    assert.deepEqual(normalizeMemoryLanguagePair({ sourceLang: null, targetLang: ' zh ' }), {
        sourceLang: '',
        targetLang: 'zh',
    });
});

test('the server action uses the no-blank-write guard before updating entries', () => {
    const actionSource = fs.readFileSync(
        path.join(process.cwd(), 'src', 'actions', 'memories.ts'),
        'utf8'
    );

    assert.match(actionSource, /const data = sanitizeMemoryLanguageUpdateInput\(input\)/);
    assert.doesNotMatch(actionSource, /input\.sourceLang\s*\|\|\s*null/);
    assert.doesNotMatch(actionSource, /input\.targetLang\s*\|\|\s*null/);
});
