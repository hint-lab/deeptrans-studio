import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assertEmbeddingBatch,
    assertEmbeddingVector,
    resolveEmbeddingDimensions,
    TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS,
} from './embedding-contract';
import { embedBatch, embedText, resolveEmbeddingConfig } from './embedding';

function makeVector(value = 0): number[] {
    return Array.from({ length: TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS }, () => value);
}

function restoreEnvironmentVariable(name: string, previous: string | undefined) {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
}

test('fixes the translation-memory embedding contract at 2048 dimensions', () => {
    assert.equal(TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS, 2048);
    assert.equal(resolveEmbeddingDimensions(), 2048);
    assert.equal(resolveEmbeddingDimensions(null), 2048);
    assert.equal(resolveEmbeddingDimensions(''), 2048);
    assert.equal(resolveEmbeddingDimensions(2048), 2048);
    assert.equal(resolveEmbeddingDimensions('2048'), 2048);

    assert.throws(() => resolveEmbeddingDimensions(1536), /expected 2048, received 1536/);
    assert.throws(() => resolveEmbeddingDimensions('not-a-number'), /EMBEDDING_DIMENSION_MISMATCH/);
});

test('rejects wrong-sized and non-finite vectors and incorrect batch cardinality', () => {
    const valid = makeVector(0.25);
    assert.doesNotThrow(() => assertEmbeddingVector(valid, 'test vector'));
    assert.doesNotThrow(() => assertEmbeddingBatch([valid], 1, 'test batch'));

    assert.throws(
        () => assertEmbeddingVector(valid.slice(1), 'test vector'),
        /expected 2048 dimensions, received 2047/
    );

    const nonFinite = makeVector();
    nonFinite[17] = Number.POSITIVE_INFINITY;
    assert.throws(
        () => assertEmbeddingVector(nonFinite, 'test vector'),
        /value at index 17 must be a finite number/
    );

    assert.throws(
        () => assertEmbeddingBatch([valid], 2, 'test batch'),
        /expected 2 vectors, received 1/
    );

    const sparse = Array.from({ length: 1 }, () => undefined);
    assert.throws(
        () => assertEmbeddingBatch(sparse, 1, 'test batch'),
        /test batch\[0\]: expected an embedding vector array/
    );
});

test('defaults to 2048 and clearly rejects pref or environment mismatches', t => {
    const previous = process.env.EMBEDDING_DIMENSIONS;
    t.after(() => restoreEnvironmentVariable('EMBEDDING_DIMENSIONS', previous));

    delete process.env.EMBEDDING_DIMENSIONS;
    assert.equal(resolveEmbeddingConfig().dimensions, 2048);

    assert.throws(
        () =>
            resolveEmbeddingConfig({
                providerKey: 'openai',
                model: 'embedding-model',
                dimensions: 1536,
            }),
        /Invalid embedding preference dimensions:.*expected 2048, received 1536/
    );

    process.env.EMBEDDING_DIMENSIONS = '1024';
    assert.throws(
        () =>
            resolveEmbeddingConfig({
                providerKey: 'openai',
                model: 'embedding-model',
                dimensions: 2048,
            }),
        /Invalid EMBEDDING_DIMENSIONS environment value:.*expected 2048, received "1024"/
    );
});

test('explicitly requests 2048 dimensions for multimodal embeddings', async t => {
    const previous = process.env.EMBEDDING_DIMENSIONS;
    t.after(() => restoreEnvironmentVariable('EMBEDDING_DIMENSIONS', previous));
    delete process.env.EMBEDDING_DIMENSIONS;

    let requestBody: any;
    t.mock.method(
        globalThis,
        'fetch',
        async (_input: string | URL | Request, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body));
            return new Response(JSON.stringify({ data: { embedding: makeVector(0.5) } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    );

    const vector = await embedText('测试文本', {
        providerKey: 'openai',
        model: 'doubao-embedding-vision-251215',
        apiKey: 'test-key',
        baseUrl: 'https://embedding.example.test/api/v3',
        apiPath: '/embeddings/multimodal',
    });

    assert.equal(vector.length, 2048);
    assert.equal(requestBody.dimensions, 2048);
    assert.deepEqual(requestBody.input, [{ type: 'text', text: '测试文本' }]);
});

test('restores non-multimodal batch order without filtering missing vectors', async t => {
    let requestBody: any;
    t.mock.method(
        globalThis,
        'fetch',
        async (_input: string | URL | Request, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body));
            return new Response(
                JSON.stringify({
                    data: [
                        { index: 1, embedding: makeVector(2) },
                        { index: 0, embedding: makeVector(1) },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }
    );

    const vectors = await embedBatch(['first', 'second'], {
        providerKey: 'openai',
        model: 'text-embedding-model',
        apiKey: 'test-key',
        baseUrl: 'https://embedding.example.test/v1',
        apiPath: '/embeddings',
        dimensions: 2048,
    });

    assert.equal(requestBody.dimensions, 2048);
    assert.deepEqual(requestBody.input, ['first', 'second']);
    assert.equal(vectors.length, 2);
    assert.equal(vectors[0]?.[0], 1);
    assert.equal(vectors[1]?.[0], 2);
});

test('rejects incomplete batch responses instead of shifting later vectors', async t => {
    t.mock.method(globalThis, 'fetch', async () => {
        return new Response(JSON.stringify({ data: [{ index: 1, embedding: makeVector(2) }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    });

    await assert.rejects(
        embedBatch(['first', 'second'], {
            providerKey: 'openai',
            model: 'text-embedding-model',
            apiKey: 'test-key',
            baseUrl: 'https://embedding.example.test/v1',
            apiPath: '/embeddings',
        }),
        /expected 2 vectors, received 1/
    );
});

test('rejects malformed vectors and duplicate response indexes', async t => {
    let responseBody: unknown = {
        data: [{ index: 0, embedding: makeVector().slice(1) }],
    };
    t.mock.method(globalThis, 'fetch', async () => {
        return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    });

    const pref = {
        providerKey: 'openai',
        model: 'text-embedding-model',
        apiKey: 'test-key',
        baseUrl: 'https://embedding.example.test/v1',
        apiPath: '/embeddings',
    };

    await assert.rejects(embedBatch(['only'], pref), /expected 2048 dimensions, received 2047/);

    responseBody = {
        data: [
            { index: 0, embedding: makeVector(1) },
            { index: 0, embedding: makeVector(2) },
        ],
    };
    await assert.rejects(embedBatch(['first', 'second'], pref), /duplicate index 0/);
});
