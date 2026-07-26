import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), 'utf8');
const page = read('src', 'app', '(app)', 'dashboard', 'memories', '[memoryId]', 'page.tsx');

test('memory detail keeps draft search controls separate from the submitted retrieval request', () => {
    assert.match(page, /const \[draftQuery, setDraftQuery\] = useState\(''\);/);
    assert.match(
        page,
        /const \[submittedQuery, setSubmittedQuery\] = useState<string \| null>\(null\);/
    );
    assert.match(page, /function snapshotMemorySearchConfig/);
    assert.match(page, /setSubmittedQuery\(nextQuery\.trim\(\)\);/);
    assert.match(page, /value=\{draftQuery\}/);
    assert.match(page, /onChange=\{e => setDraftQuery\(e\.target\.value\)\}/);
    assert.match(page, /mode: submittedQueryValue \? 'search' : 'browse'/);
    assert.match(page, /searchMemoryInLibraryAction\([\s\S]*?submittedSearchConfig/);
    assert.match(page, /\}, \[queryRequest, submittedSearchConfig\]\);/);
    assert.doesNotMatch(page, /\[queryRequest, searchConfig\]/);
});

test('memory detail makes explicit empty submissions and pending drafts visible without changing result highlights', () => {
    assert.match(page, /t\('searchReady'\)/);
    assert.match(page, /t\('searchDraftPending'\)/);
    assert.match(page, /t\('emptyQuerySubmitted'\)/);
    assert.match(page, /searchQuery=\{submittedQueryValue\}/);
    assert.match(page, /if \(e\.key === 'Enter'\)/);
    assert.match(page, /handleSearch\(''\)/);

    for (const locale of ['zh', 'en']) {
        const messages = JSON.parse(read('src', 'i18n', `${locale}.json`));
        const memories = messages.Dashboard.Memories;
        for (const key of ['searchReady', 'searchDraftPending', 'emptyQuerySubmitted']) {
            assert.equal(typeof memories[key], 'string', `${locale}:${key}`);
        }
    }
});
