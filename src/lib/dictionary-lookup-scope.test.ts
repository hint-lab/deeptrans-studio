import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDictionaryLookupScopes } from './dictionary-lookup-scope';

test('an unscoped lookup never broadens into tenant project dictionaries', () => {
    assert.deepEqual(buildDictionaryLookupScopes({ userId: 'user-a' }), [
        { visibility: 'PUBLIC' },
        { visibility: 'PRIVATE', userId: 'user-a' },
    ]);
});

test('a project lookup includes only its resolved bound project dictionaries', () => {
    const scopes = buildDictionaryLookupScopes({ userId: 'user-a' }, [
        'project-dictionary-a',
        '',
        'project-dictionary-b',
        'project-dictionary-a',
    ]);

    assert.deepEqual(scopes, [
        { visibility: 'PUBLIC' },
        {
            visibility: 'PROJECT',
            id: { in: ['project-dictionary-a', 'project-dictionary-b'] },
        },
        { visibility: 'PRIVATE', userId: 'user-a' },
    ]);
    assert.equal(JSON.stringify(scopes).includes('tenantId'), false);
    assert.equal(JSON.stringify(scopes).includes('projectBindings'), false);
});
