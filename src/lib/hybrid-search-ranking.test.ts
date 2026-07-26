import assert from 'node:assert/strict';
import test from 'node:test';

import { fuseHybridSearchResults, normalizeHybridSearchConfig } from './hybrid-search-ranking';
import type { BM25Result, VectorResult } from '@/types/hybrid-search';

function vector(id: string, score: number): VectorResult {
    return { id, score, similarity: score, text: id };
}

function keyword(id: string, score: number): BM25Result {
    return { id, score, text: id };
}

test('normalizes nested search config without losing defaults or zero weights', () => {
    const config = normalizeHybridSearchConfig({
        mode: 'hybrid',
        vectorSearch: { enabled: false, topK: 9999 },
        keywordSearch: { enabled: true, topK: -1, matchType: 'fuzzy', boostFactor: 99 },
        fusionStrategy: {
            method: 'weighted_sum',
            weights: { vectorWeight: 0, keywordWeight: 1 },
        },
        finalTopK: 9999,
    });

    assert.deepEqual(config.vectorSearch, {
        enabled: false,
        topK: 200,
        metric: 'COSINE',
        ef: 128,
        weight: 0.7,
    });
    assert.deepEqual(config.keywordSearch, {
        enabled: true,
        topK: 1,
        matchType: 'fuzzy',
        boostFactor: 10,
        weight: 0.3,
    });
    assert.deepEqual(config.fusionStrategy.weights, { vectorWeight: 0, keywordWeight: 1 });
    assert.equal(config.finalTopK, 200);

    const untrusted = normalizeHybridSearchConfig({
        vectorSearch: { enabled: 'false' as unknown as boolean, topK: 10 },
        keywordSearch: { enabled: 'true' as unknown as boolean, topK: 10 },
    });
    assert.equal(untrusted.vectorSearch.enabled, true);
    assert.equal(untrusted.keywordSearch.enabled, true);

    const legacyLegWeights = normalizeHybridSearchConfig({
        vectorSearch: { enabled: true, topK: 10, weight: 0 },
        keywordSearch: { enabled: true, topK: 10, weight: 1 },
    });
    assert.deepEqual(legacyLegWeights.fusionStrategy.weights, {
        vectorWeight: 0,
        keywordWeight: 1,
    });
});

test('weighted sum honours a zero vector weight and preserves raw evidence', () => {
    const results = fuseHybridSearchResults(
        [vector('vector-first', 0.99), vector('keyword-first', 0.2)],
        [keyword('keyword-first', 0.95)],
        {
            fusionStrategy: {
                method: 'weighted_sum',
                weights: { vectorWeight: 0, keywordWeight: 1 },
            },
            finalTopK: 2,
        }
    );

    assert.deepEqual(
        results.map(result => result.id),
        ['keyword-first', 'vector-first']
    );
    assert.equal(results[0]?.vectorScore, 0.2);
    assert.equal(results[0]?.keywordScore, 0.95);
    assert.equal(results[0]?.source, 'hybrid');
});

test('rank fusion changes the ordering relative to weighted sum', () => {
    const vectors = [vector('a', 0.95), vector('b', 0.8), vector('c', 0.3)];
    const keywords = [keyword('b', 0.99), keyword('c', 0.6), keyword('a', 0.1)];

    const weighted = fuseHybridSearchResults(vectors, keywords, {
        fusionStrategy: {
            method: 'weighted_sum',
            weights: { vectorWeight: 0.9, keywordWeight: 0.1 },
        },
    });
    const ranked = fuseHybridSearchResults(vectors, keywords, {
        fusionStrategy: { method: 'rank_fusion' },
    });

    assert.equal(weighted[0]?.id, 'a');
    assert.equal(ranked[0]?.id, 'b');
});

test('reciprocal-rank fusion uses its k parameter', () => {
    const vectors = Array.from({ length: 20 }, (_, index) =>
        vector(index === 0 ? 'a' : index === 4 ? 'b' : `v-${index}`, 1 - index / 100)
    );
    const keywords = Array.from({ length: 20 }, (_, index) =>
        keyword(index === 4 ? 'b' : index === 19 ? 'a' : `k-${index}`, 1 - index / 100)
    );

    const smallK = fuseHybridSearchResults(vectors, keywords, {
        fusionStrategy: { method: 'reciprocal_rank_fusion', rankFusion: { k: 1 } },
        finalTopK: 40,
    });
    const largeK = fuseHybridSearchResults(vectors, keywords, {
        fusionStrategy: { method: 'reciprocal_rank_fusion', rankFusion: { k: 100 } },
        finalTopK: 40,
    });

    assert.ok(
        smallK.findIndex(result => result.id === 'a') <
            smallK.findIndex(result => result.id === 'b')
    );
    assert.ok(
        largeK.findIndex(result => result.id === 'b') <
            largeK.findIndex(result => result.id === 'a')
    );
});
