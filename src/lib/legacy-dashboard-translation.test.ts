import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const legacyTranslationPage = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', '(app)', 'dashboard', 'translation', 'page.tsx'),
    'utf8'
);

test('legacy text-translation bookmarks use the supported instant-translation surface', () => {
    assert.match(legacyTranslationPage, /import \{ redirect \} from 'next\/navigation';/);
    assert.match(legacyTranslationPage, /redirect\('\/dashboard\/instant-translate'\);/);

    // The old table advertised controls that never reached a real workflow.
    // Keep it out of the routed page so a legacy bookmark cannot revive it.
    assert.doesNotMatch(legacyTranslationPage, /TextTranslationTable/);
    assert.doesNotMatch(legacyTranslationPage, /runPreTranslateAction/);
});
