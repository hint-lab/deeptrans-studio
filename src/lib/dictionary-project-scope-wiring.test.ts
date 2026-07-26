import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

test('dictionary lookup resolves project dictionary IDs from the authorized current project', () => {
    const dictionary = read('src', 'server', 'dictionary.ts');

    assert.match(dictionary, /where: \{ id, \.\.\.ownedProjectWhere\(owner\) \}/);
    assert.match(dictionary, /projectDictionaries: \{\s*select: \{ dictionaryId: true \}/);
    assert.match(dictionary, /buildDictionaryLookupScopes\(authCtx, projectDictionaryIds\)/);
});

test('IDE and worker pre-translation propagate an authorized project scope to dictionary lookup', () => {
    const preTranslate = read('src', 'server', 'pre-translate.ts');
    const agent = read('src', 'agents', 'pre-translate', 'DictLookupAgent.ts');
    const tool = read('src', 'agents', 'tools', 'dictionary.ts');
    const worker = read('src', 'worker', 'index.ts');
    const editor = read(
        'src',
        'app',
        '(app)',
        'ide',
        '[id]',
        'components',
        'parallel-editor',
        'index.tsx'
    );

    assert.match(preTranslate, /projectId: options\?\.projectId/);
    assert.match(agent, /projectId: input\.projectId/);
    assert.match(tool, /projectId: options\.projectId/);
    assert.match(worker, /projectId: item\.document\.projectId/);
    assert.match(editor, /lookupDictionaryAction\(termCandidates, \{\s*projectId:/);
});

test('chat and direct dictionary lookup routes use the same scoped server service', () => {
    const chat = read('src', 'server', 'chat-agent.ts');
    const route = read('src', 'app', 'api', 'dictionary', 'lookup', 'route.ts');

    assert.match(chat, /queryDictionaryEntriesWithOwner\(query, authCtx, \{/);
    assert.match(chat, /projectId: workspace\.projectId/);
    assert.match(route, /queryDictionaryEntriesExactWithOwner\(q, authCtx, \{/);
    assert.match(route, /projectId,/);
});
