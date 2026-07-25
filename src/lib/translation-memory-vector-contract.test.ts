import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readWorkspaceFile = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

test('translation memory storage migrates forward to the 2048-dimensional halfvec index', () => {
    const schema = readWorkspaceFile('prisma', 'schema.prisma');
    const migration = readWorkspaceFile(
        'prisma',
        'migrations',
        '20260725070000_pgvector_2048_halfvec_hnsw',
        'migration.sql'
    );

    assert.match(schema, /embedding\s+Unsupported\("vector\(2048\)"\)\?/);
    assert.match(migration, /SET embedding = NULL\s+WHERE embedding IS NOT NULL;/);
    assert.match(migration, /ALTER COLUMN embedding TYPE vector\(2048\)/);
    assert.match(migration, /USING hnsw \(\(embedding::halfvec\(2048\)\) halfvec_cosine_ops\)/);
    assert.match(migration, /WHERE embedding IS NOT NULL;/);

    const dropIndex = migration.indexOf('DROP INDEX');
    const clearEmbeddings = migration.indexOf('SET embedding = NULL');
    const alterColumn = migration.indexOf('ALTER COLUMN embedding TYPE vector(2048)');
    const createIndex = migration.indexOf('CREATE INDEX');

    assert.ok(dropIndex >= 0);
    assert.ok(dropIndex < clearEmbeddings);
    assert.ok(clearEmbeddings < alterColumn);
    assert.ok(alterColumn < createIndex);
});

test('translation memory vector SQL validates vectors and matches the halfvec index expression', () => {
    const source = readWorkspaceFile('src', 'lib', 'vector', 'postgres.ts');

    assert.match(
        source,
        /assertEmbeddingVector\(point\.vector, 'translation memory vector write'\)/
    );
    assert.match(
        source,
        /assertEmbeddingVector\(params\.vector, 'translation memory vector search'\)/
    );
    assert.match(source, /VALUES \$\{Prisma\.join\(/);
    assert.match(source, /vectorLiteral\(point\.vector\)\}::vector\(2048\)/);
    assert.match(source, /expected \$\{points\.length\} updated rows/);
    assert.match(source, /e\.embedding::halfvec\(2048\)/);
    assert.match(source, /\$\{queryVector\}::halfvec\(2048\)/);

    const vectorLiteral = source.match(/function vectorLiteral[\s\S]*?\n}/)?.[0];
    assert.ok(vectorLiteral);
    assert.doesNotMatch(vectorLiteral, /\.filter\(/);
});
