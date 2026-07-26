import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

test('dictionary imports lock the parent and keep overwrite delete plus writes in one transaction', () => {
    const action = read('src', 'actions', 'dictionary.ts');
    const importStart = action.indexOf('async function importEntries');
    const importEnd = action.indexOf('async function parseDictionaryImportFile', importStart);
    const importSection = action.slice(importStart, importEnd);

    assert.match(action, /FROM "Dictionary"/);
    assert.match(action, /FOR UPDATE/);
    assert.match(importSection, /return withLockedDictionary\(dictionaryId, async transaction =>/);
    assert.match(
        importSection,
        /transaction\.dictionaryEntry\.deleteMany\(\{ where: \{ dictionaryId \} \}\)/
    );
    assert.match(
        importSection,
        /createEntriesInTransaction\(\s*transaction,\s*dictionaryId,\s*entries,\s*input\s*\)/
    );
    assert.doesNotMatch(importSection, /deleteDictionaryEntriesByDictionaryIdDB/);
    assert.doesNotMatch(importSection, /createDictionaryEntryDB/);
    assert.doesNotMatch(importSection, /findExistingDictionaryEntriesMapDB/);
});

test('dictionary imports fail closed on ambiguous source rows and write an exact import origin', () => {
    const action = read('src', 'actions', 'dictionary.ts');
    const normalization = read('src', 'lib', 'dictionary-entry-normalization.ts');

    assert.match(normalization, /存在冲突的译文，请修正后重试/);
    assert.match(action, /词库中存在历史重复原文，请先清理后再导入/);
    assert.match(action, /origin: dictionaryImportOriginForFilename\(input\.file\.name\)/);
    assert.match(action, /origin: 'import:xlsx'/);
    assert.match(action, /origin: 'import:tbx'/);
    assert.match(action, /enabled: input\.allowBlankTarget \? Boolean\(entry\.targetText\) : true/);
});

test('public dictionary maintenance uses the same server-authorized canWrite state in the UI', () => {
    const action = read('src', 'actions', 'dictionary.ts');
    const guards = read('src', 'lib', 'guards.ts');
    const manager = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'dictionaries',
        'components',
        'dictionary-entries-manager.tsx'
    );

    assert.match(action, /authCtx\.role === 'ADMIN' \|\| dictionary\.userId === authCtx\.userId/);
    assert.match(guards, /ctx\.role === 'ADMIN'/);
    assert.match(guards, /\{ visibility: 'PUBLIC' as const, userId: ctx\.userId \}/);
    assert.match(manager, /const canWrite = dictionary\.canWrite === true/);
});

test('dictionary entry manager never renders or applies a previous dictionary response after retargeting', () => {
    const manager = read(
        'src',
        'app',
        '(app)',
        'dashboard',
        'dictionaries',
        'components',
        'dictionary-entries-manager.tsx'
    );

    assert.match(
        manager,
        /const listBelongsToCurrentDictionary = loadedDictionaryId === dictionary\.id/
    );
    assert.match(
        manager,
        /const visibleEntries = listBelongsToCurrentDictionary \? entries : \[\]/
    );
    assert.match(manager, /requestDictionaryId !== activeDictionaryIdRef\.current/);
    assert.match(manager, /setLoadedDictionaryId\(null\)/);
});

test('dictionary retrieval keeps disabled or failed database reads distinct from an empty result', () => {
    const db = read('src', 'db', 'dictionaryEntry.ts');
    const server = read('src', 'server', 'dictionary.ts');

    assert.match(
        db,
        /sourceText: \{ in: sourceList \},\s*enabled: true,\s*targetText: \{ not: '' \}/
    );
    assert.match(db, /if \(!rows\) return null/);
    assert.match(
        server,
        /if \(rows === null\) return \{ success: false, error: '词库检索暂不可用，请稍后重试' \}/
    );
});
