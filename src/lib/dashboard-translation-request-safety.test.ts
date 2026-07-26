import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readPage = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), 'src', 'app', '(app)', 'dashboard', ...segments), 'utf8');

test('instant translate invalidates both queued and active work before input or configuration changes', () => {
    const page = readPage('instant-translate', 'page.tsx');

    assert.match(page, /const invalidateTranslation = useCallback\(\(\) =>/);
    assert.match(page, /requestIdRef\.current \+= 1/);
    assert.match(page, /activeTranslationRequestRef\.current = null/);
    assert.match(page, /setTranslatedText\(''\)/);
    assert.match(page, /if \(activeTranslationRequestRef\.current !== null\) return/);
    assert.match(page, /if \(localRequestId !== requestIdRef\.current\) return;/);
    assert.match(page, /if \(!String\(result \|\| ''\)\.trim\(\)\) \{\s*throw new Error\(t\('translationFailed'\)\);/);
    assert.match(page, /onChange=\{e => handleSourceTextChange\(e\.target\.value\)\}/);
    assert.match(page, /onValueChange=\{handleSourceLanguageChange\}/);
    assert.match(page, /onValueChange=\{handleTargetLanguageChange\}/);
});

test('image translate clears prior output, snapshots settings, and ignores stale work', () => {
    const page = readPage('image-intelligence', 'page.tsx');

    assert.match(page, /const activeTranslationRequestRef = useRef<number \| null>\(null\)/);
    assert.match(page, /if \(activeTranslationRequestRef\.current !== null\) return/);
    assert.match(page, /setRecognizedText\(null\);\s*setTranslatedContent\(null\);\s*setTranslationResult\(null\);/);
    assert.match(page, /const sourceLanguageAtStart = sourceLanguage/);
    assert.match(page, /const targetLanguageAtStart = targetLanguage/);
    assert.match(page, /requestId !== translationRequestRef\.current/);
    assert.match(page, /onValueChange=\{handleSourceLanguageChange\}/);
    assert.match(page, /onValueChange=\{handleTargetLanguageChange\}/);
});

test('image and document translations apply selected dictionaries and a bounded style', () => {
    for (const pageName of ['image-intelligence', 'document-intelligence']) {
        const page = readPage(pageName, 'page.tsx');

        assert.match(page, /embedAndTranslateAction/);
        assert.match(page, /for \(const dictionaryId of selectedDictionaries\)/);
        assert.match(page, /requireSelectedDictionaryEntries<DictionaryEntryItem>\(result\)/);
        assert.match(page, /const dictionaryEntries = await getSelectedDictionaryEntries\(\)/);
        assert.match(
            page,
            /embedAndTranslateAction\([\s\S]{0,280}dictionaryEntries,[\s\S]{0,120}\{ style: translationStyleAtStart \}/
        );
        assert.match(page, /if \(error instanceof SelectedDictionaryEntriesLoadError\) throw error/);
        assert.match(page, /const handleTranslationStyleChange = \(value: string\)/);
        assert.match(page, /const onToggleUseDictionary = \(dictionaryId: string\) => \{\s*invalidateTranslation\(\)/);
        assert.doesNotMatch(page, /preserveFormatting|translationEngine|qualityLevel|showAdvancedOptions/);
    }
});

test('document translate rejects blank output instead of constructing a fake success result', () => {
    const page = readPage('document-intelligence', 'page.tsx');

    assert.match(page, /const activeTranslationRequestRef = useRef<number \| null>\(null\)/);
    assert.match(page, /if \(activeTranslationRequestRef\.current !== null\) return/);
    assert.match(page, /setTranslatedContent\(null\);\s*setTranslationResult\(null\);/);
    assert.match(page, /const translatedContent = String\(\s*await embedAndTranslateAction\(/);
    assert.match(page, /if \(!translatedContent\) \{\s*throw new Error\(t\('translationFailed'\)\);/);
    assert.doesNotMatch(page, /const result = \{\s*success: true/);
    assert.match(page, /requestId !== translationRequestRef\.current/);
    assert.match(page, /onValueChange=\{handleSourceLanguageChange\}/);
    assert.match(page, /onValueChange=\{handleTargetLanguageChange\}/);
});
