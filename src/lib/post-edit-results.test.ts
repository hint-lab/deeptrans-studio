import assert from 'node:assert/strict';
import test from 'node:test';

import { deserializePostEditResults, serializePostEditResults } from './post-edit-results';

test('round-trips discourse references, evaluation, and rewrite through persisted fields', () => {
    const persisted = serializePostEditResults({
        query: [{ id: 'reference-1', source: '原文', target: '译文' }],
        evaluation: { overallScore: 0.9 },
        rewrite: 'Rewritten target',
    });

    assert.equal(persisted.hasResults, true);
    if (!persisted.hasResults) return;

    assert.deepEqual(
        deserializePostEditResults(persisted.postEditDiscourse, persisted.postEditEmbedded),
        {
            query: [{ id: 'reference-1', source: '原文', target: '译文' }],
            evaluation: { overallScore: 0.9 },
            rewrite: 'Rewritten target',
        }
    );
});

test('keeps legacy evaluation and rewrite rows readable', () => {
    assert.deepEqual(deserializePostEditResults({ overallScore: 0.72 }, 'Legacy rewrite'), {
        query: undefined,
        evaluation: { overallScore: 0.72 },
        rewrite: 'Legacy rewrite',
    });
});

test('marks an all-empty undo payload for database clearing', () => {
    assert.deepEqual(serializePostEditResults({ query: undefined, evaluation: undefined }), {
        hasResults: false,
    });
});
