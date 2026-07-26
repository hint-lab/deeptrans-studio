import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

test('chat persistence schema keeps the active pointer referential and avoids a duplicate message index', () => {
    const schema = read('prisma', 'schema.prisma');
    const createMigration = read(
        'prisma',
        'migrations',
        '20260726110000_add_chat_conversations',
        'migration.sql'
    );
    const hardeningMigration = read(
        'prisma',
        'migrations',
        '20260726162000_harden_chat_and_memory_import_integrity',
        'migration.sql'
    );

    assert.match(schema, /model ChatConversationScope/);
    assert.match(
        schema,
        /activeConversation\s+ChatConversation\?\s+@relation\("ChatConversationScopeActiveConversation", fields: \[activeConversationId\], references: \[id\], onDelete: SetNull\)/
    );
    assert.match(
        schema,
        /activeForScope\s+ChatConversationScope\?\s+@relation\("ChatConversationScopeActiveConversation"\)/
    );
    assert.match(schema, /activeConversationId\s+String\?\s+@unique/);
    assert.doesNotMatch(schema, /@@index\(\[activeConversationId\]\)/);
    assert.match(schema, /@@unique\(\[conversationId, sequence\]\)/);
    assert.doesNotMatch(schema, /@@index\(\[conversationId, sequence\]\)/);
    assert.match(createMigration, /ChatConversationMessage_conversationId_sequence_key/);
    assert.match(
        hardeningMigration,
        /WHERE conversation\."id" = scope\."activeConversationId"[\s\S]*conversation\."scopeId" = scope\."id"[\s\S]*conversation\."userId" = scope\."userId"/
    );
    assert.match(
        hardeningMigration,
        /ChatConversationScope_activeConversationId_fkey[\s\S]*FOREIGN KEY \("activeConversationId"\) REFERENCES "ChatConversation"\("id"\)[\s\S]*ON DELETE SET NULL/
    );
    assert.match(
        hardeningMigration,
        /DROP INDEX IF EXISTS "ChatConversationScope_activeConversationId_idx"[\s\S]*CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversationScope_activeConversationId_key"/
    );
    assert.match(
        hardeningMigration,
        /DROP INDEX IF EXISTS "ChatConversationMessage_conversationId_sequence_idx"/
    );
});

test('translation-memory import gate index follows the locked memory and acknowledgement predicate', () => {
    const schema = read('prisma', 'schema.prisma');
    const ambiguityModel = schema.slice(
        schema.indexOf('model TranslationMemoryImportAmbiguity'),
        schema.indexOf('model TranslationMemoryImportReservation')
    );
    const hardeningMigration = read(
        'prisma',
        'migrations',
        '20260726162000_harden_chat_and_memory_import_integrity',
        'migration.sql'
    );

    assert.match(ambiguityModel, /@@index\(\[memoryId, acknowledgedAt\]\)/);
    assert.doesNotMatch(ambiguityModel, /@@index\(\[memoryId\]\)/);
    assert.match(
        hardeningMigration,
        /DROP INDEX IF EXISTS "TranslationMemoryImportAmbiguity_memoryId_idx"/
    );
    assert.match(
        hardeningMigration,
        /CREATE INDEX IF NOT EXISTS "TranslationMemoryImportAmbiguity_memoryId_acknowledgedAt_idx"[\s\S]*\("memoryId", "acknowledgedAt"\)/
    );
});
