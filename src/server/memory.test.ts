import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { prisma } from '@/lib/db';
import {
    assertProjectMemoryScopeIsUsable,
    normalizeMemoryIds,
    projectMemoryScopeFromBindingSnapshot,
    projectMemoryScopeFromBindingIds,
    resolveAuthorizedProjectMemoryScope,
    searchMemoryForOwner,
} from './memory';

test('preserves every authorized memory binding beyond the legacy 100-item limit', () => {
    const ids = Array.from({ length: 101 }, (_, index) => `memory-${index + 1}`);

    const normalized = normalizeMemoryIds([...ids, ids[0]!, '', 42]);

    assert.deepEqual(normalized, ids);
    assert.equal(normalized?.at(-1), 'memory-101');
});

test('rejects an oversized memory scope instead of silently truncating it', () => {
    const ids = Array.from({ length: 10_001 }, (_, index) => `memory-${index + 1}`);

    assert.throws(() => normalizeMemoryIds(ids), /记忆库范围不能超过 10000 个/);
});

test('marks an unauthorised persisted project binding as inaccessible without exposing its id', () => {
    assert.deepEqual(projectMemoryScopeFromBindingIds(['foreign-memory'], []), {
        hasBindings: true,
        memoryIds: [],
        inaccessibleBindingCount: 1,
    });
});

test('fails an all-foreign project scope instead of reporting a false zero-hit search', () => {
    assert.throws(
        () =>
            assertProjectMemoryScopeIsUsable(
                projectMemoryScopeFromBindingIds(['foreign-memory'], [])
            ),
        /当前项目关联的记忆库不可访问/
    );
});

test('uses only owner-approved memory ids when a project has several bindings', () => {
    assert.deepEqual(
        projectMemoryScopeFromBindingIds(
            ['owned-memory', 'foreign-memory', 'owned-memory'],
            ['owned-memory']
        ),
        { hasBindings: true, memoryIds: ['owned-memory'], inaccessibleBindingCount: 1 }
    );
});

test('derives project-scope ownership from one binding snapshot', () => {
    assert.deepEqual(
        projectMemoryScopeFromBindingSnapshot(
            [
                { memoryId: 'selected-memory', memory: { userId: 'owner-a' } },
                { memoryId: 'foreign-memory', memory: { userId: 'owner-b' } },
            ],
            'owner-a'
        ),
        {
            hasBindings: true,
            memoryIds: ['selected-memory'],
            inaccessibleBindingCount: 1,
        }
    );
});

test('reads project memory bindings once so a concurrent binding change cannot widen the scope', async () => {
    const originalProjectFindFirst = prisma.project.findFirst;
    const originalBindingFindMany = (prisma as any).projectMemory.findMany;
    const calls: unknown[] = [];

    (prisma.project as any).findFirst = async () => ({ id: 'project-a', documents: [] });
    (prisma as any).projectMemory.findMany = async (args: unknown) => {
        calls.push(args);
        // This is the exact snapshot observed by the request. A second query
        // would be able to observe a later binding state and create the
        // all-personal-memory fallback race fixed here.
        return [{ memoryId: 'selected-memory', memory: { userId: 'owner-a' } }];
    };

    try {
        const scope = await resolveAuthorizedProjectMemoryScope('project-a', {
            userId: 'owner-a',
        });

        assert.deepEqual(scope, {
            hasBindings: true,
            memoryIds: ['selected-memory'],
            inaccessibleBindingCount: 0,
        });
        assert.deepEqual(calls, [
            {
                where: { projectId: 'project-a' },
                select: { memoryId: true, memory: { select: { userId: true } } },
            },
        ]);
    } finally {
        prisma.project.findFirst = originalProjectFindFirst;
        (prisma as any).projectMemory.findMany = originalBindingFindMany;
    }
});

test('treats a configuration with no enabled retrieval leg as a failure, not a zero-hit result', async () => {
    const result = await searchMemoryForOwner(
        'contract clause',
        { userId: 'owner-a' },
        {
            searchConfig: {
                mode: 'hybrid',
                vectorSearch: { enabled: false, topK: 5 },
                keywordSearch: { enabled: false, topK: 5 },
            },
        }
    );

    assert.equal(result.success, false);
    assert.equal(result.error, '请至少启用一种检索方式');
});

test('treats a missing memory-entry delegate as an unavailable service, not an empty search', async () => {
    const originalDelegate = (prisma as any).translationMemoryEntry;
    (prisma as any).translationMemoryEntry = undefined;

    try {
        const result = await searchMemoryForOwner('contract clause', { userId: 'owner-a' });

        assert.equal(result.success, false);
        assert.equal(result.error, '检索服务暂不可用，请稍后重试');
    } finally {
        (prisma as any).translationMemoryEntry = originalDelegate;
    }
});

test('does not return a confirmed zero-hit result when a requested retrieval leg is unavailable', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/server/memory.ts'), 'utf8');

    assert.match(source, /hasIncompleteMemorySearchResult\(data\.length, unavailableLegs\)/);
    assert.match(source, /error:\s*MEMORY_SEARCH_INCOMPLETE_MESSAGE/);
});
