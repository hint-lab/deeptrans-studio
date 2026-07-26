import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readAction = (filename: string) =>
    readFileSync(resolve(process.cwd(), 'src/actions', filename), 'utf8');

const preTranslate = readAction('pre-translate.ts');
const qualityAssure = readAction('quality-assure.ts');
const postedit = readAction('postedit.ts');

test('workflow actions do not merge a client options.prompt into a stored personal prompt', () => {
    for (const source of [preTranslate, qualityAssure, postedit]) {
        assert.doesNotMatch(source, /resolveWorkflowPrompt\([\s\S]{0,180}options\?\.prompt/);
        assert.doesNotMatch(source, /prompt:\s*options\?\.prompt/);
    }

    assert.match(preTranslate, /omitClientWorkflowPrompt\(options\)/);
    assert.match(qualityAssure, /omitClientWorkflowPrompt\(options\)/);
    assert.match(postedit, /omitClientWorkflowPrompt\(options\)/);
});

test('the instant-translate style remains a bounded server-derived instruction', () => {
    assert.match(preTranslate, /resolveTranslationStyleInstruction\(style\)/);
    const instantTranslate = readFileSync(
        resolve(process.cwd(), 'src/app/(app)/dashboard/instant-translate/page.tsx'),
        'utf8'
    );
    assert.match(instantTranslate, /\{ style \}/);
    assert.match(
        instantTranslate,
        /const style = translationStyle|\{ style: translationStyle \}/
    );
    assert.doesNotMatch(instantTranslate, /prompt:\s*`使用\$\{.*?\}风格翻译`/);
});
