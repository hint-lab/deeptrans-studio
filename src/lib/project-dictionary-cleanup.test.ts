import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
    buildProjectDictionaryCleanupPlan,
    PROJECT_DICTIONARY_CLEANUP_STATUS,
    type ProjectDictionaryForCleanup,
} from './project-dictionary-cleanup';

const context = {
    projectId: 'project-a',
    ownerId: 'user-a',
    tenantId: 'tenant-a',
};

function dictionary(
    overrides: Partial<ProjectDictionaryForCleanup> = {}
): ProjectDictionaryForCleanup {
    return {
        id: 'dictionary-a',
        name: '合同项目 · 术语清单-1',
        visibility: 'PROJECT',
        userId: 'user-a',
        tenantId: 'tenant-a',
        entryCount: 3,
        projectBindings: [{ projectId: 'project-a' }],
        ...overrides,
    };
}

test('selects only an exclusive owner-owned automatic project dictionary', () => {
    const plan = buildProjectDictionaryCleanupPlan({
        ...context,
        deleteEligibleDictionaries: true,
        dictionaries: [
            dictionary(),
            dictionary({
                id: 'shared',
                projectBindings: [{ projectId: 'project-a' }, { projectId: 'project-b' }],
            }),
            dictionary({ id: 'manual', name: '合同术语' }),
            dictionary({ id: 'other-owner', userId: 'user-b' }),
            dictionary({ id: 'other-tenant', tenantId: 'tenant-b' }),
            dictionary({ id: 'private', visibility: 'PRIVATE' }),
            dictionary({ id: 'not-bound', projectBindings: [] }),
        ],
    });

    assert.deepEqual(plan.deleteDictionaryIds, ['dictionary-a']);
    assert.equal(plan.summary.totalBound, 7);
    assert.equal(plan.summary.eligibleForCleanup, 1);
    assert.equal(plan.summary.selectedForDeletion, 1);
    assert.equal(plan.summary.retained, 6);
    assert.equal(plan.summary.statusCounts[PROJECT_DICTIONARY_CLEANUP_STATUS.SHARED], 1);
    assert.equal(plan.summary.statusCounts[PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_AUTOMATIC], 1);
    assert.equal(plan.summary.statusCounts[PROJECT_DICTIONARY_CLEANUP_STATUS.DIFFERENT_OWNER], 1);
    assert.equal(plan.summary.statusCounts[PROJECT_DICTIONARY_CLEANUP_STATUS.DIFFERENT_TENANT], 1);
    assert.equal(
        plan.summary.statusCounts[PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_BOUND_TO_PROJECT],
        1
    );
    assert.equal(
        plan.summary.statusCounts[PROJECT_DICTIONARY_CLEANUP_STATUS.NOT_PROJECT_DICTIONARY],
        1
    );
});

test('preserve-all choice never selects an otherwise eligible dictionary', () => {
    const plan = buildProjectDictionaryCleanupPlan({
        ...context,
        deleteEligibleDictionaries: false,
        dictionaries: [dictionary()],
    });

    assert.deepEqual(plan.deleteDictionaryIds, []);
    assert.equal(plan.dictionaries[0]?.eligibleForCleanup, true);
    assert.equal(plan.dictionaries[0]?.selectedForDeletion, false);
    assert.equal(plan.summary.eligibleForCleanup, 1);
    assert.equal(plan.summary.selectedForDeletion, 0);
    assert.equal(plan.summary.retained, 1);
});

test('project deletion UI exposes set-level cleanup rather than per-dictionary checkboxes', () => {
    const source = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'dashboard',
            'components',
            'project-list.tsx'
        ),
        'utf8'
    );

    assert.match(source, /deleteEligibleDictionaries/);
    assert.match(source, /deleteDictionaries:\s*deleteEligibleDictionaries/);
    assert.match(source, /deleteProjectOnlyAndKeepDictionaries/);
    assert.doesNotMatch(source, /deleteWithDictionary/);
    assert.doesNotMatch(source, /<Checkbox\b/);
});
