export const TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS = 2048;

function describeValue(value: unknown) {
    if (typeof value === 'string') return JSON.stringify(value);
    return String(value);
}

export function resolveEmbeddingDimensions(value?: number | string | null): number {
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
        return TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed !== TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS) {
        throw new Error(
            `EMBEDDING_DIMENSION_MISMATCH: expected ${TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS}, received ${describeValue(value)}`
        );
    }

    return TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS;
}

export function assertEmbeddingVector(
    vector: unknown,
    context = 'embedding vector'
): asserts vector is number[] {
    if (!Array.isArray(vector)) {
        throw new Error(`${context}: expected an embedding vector array`);
    }

    if (vector.length !== TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS) {
        throw new Error(
            `${context}: expected ${TRANSLATION_MEMORY_EMBEDDING_DIMENSIONS} dimensions, received ${vector.length}`
        );
    }

    const invalidIndex = vector.findIndex(
        value => typeof value !== 'number' || !Number.isFinite(value)
    );
    if (invalidIndex >= 0) {
        throw new Error(`${context}: value at index ${invalidIndex} must be a finite number`);
    }
}

export function assertEmbeddingBatch(
    vectors: unknown,
    expectedCount: number,
    context = 'embedding batch'
): asserts vectors is number[][] {
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
        throw new Error(`${context}: expectedCount must be a non-negative safe integer`);
    }
    if (!Array.isArray(vectors)) {
        throw new Error(`${context}: expected an array of embedding vectors`);
    }
    if (vectors.length !== expectedCount) {
        throw new Error(
            `${context}: expected ${expectedCount} vectors, received ${vectors.length}`
        );
    }

    for (let index = 0; index < vectors.length; index += 1) {
        assertEmbeddingVector(vectors[index], `${context}[${index}]`);
    }
}
