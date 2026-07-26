import assert from 'node:assert/strict';
import test from 'node:test';

import { sourceRevision } from '@/lib/source-revision';
import {
    hasCurrentPersistedQualityAssureResult,
    hasCurrentPersistedPreTranslationResult,
    isCurrentQualityAssureRun,
    isCurrentPreTranslationRun,
} from '@/lib/translation-stage-transitions';
import { SYNTAX_CATEGORIES } from '@/lib/syntax-quality';
import {
    completeQualityAssureWithDeps,
    completePreTranslationWithDeps,
    rejectQualityAssureWithDeps,
    savePostEditReviewDraftWithDeps,
    signOffPostEditReviewWithDeps,
    startQualityAssureWithDeps,
    startPreTranslationWithDeps,
} from './document-item';

const version = new Date('2026-07-26T08:00:00.000Z');

function preTranslationItem(overrides: Record<string, unknown> = {}) {
    const sourceText = String(overrides.sourceText ?? 'Article 1');
    const translation = String(overrides.preTranslateEmbedded ?? '第一条');
    return {
        id: 'item-1',
        status: 'NOT_STARTED',
        sourceText,
        targetText: translation,
        preTranslateEmbedded: translation,
        metadata: {
            preTranslateSourceRevision: sourceRevision(sourceText),
            targetSourceRevision: sourceRevision(sourceText),
            preTranslateRunId: 'run-a',
            preTranslateResultRunId: 'run-a',
        },
        updatedAt: version,
        ...overrides,
    };
}

function completeQualitySyntax(sourceText: string, targetText: string) {
    return {
        version: 2,
        status: 'complete',
        legacy: false,
        relations: [],
        issues: [],
        dimensions: SYNTAX_CATEGORIES.map(category => ({
            category,
            status: 'pass',
            issueCount: 0,
        })),
        selectedMap: {},
        evaluation: {
            id: 'evaluation-1',
            sourceRevision: sourceRevision(sourceText),
            targetRevision: sourceRevision(targetText),
            baseSource: sourceText,
            baseTarget: targetText,
            embeddedIssueIds: [],
        },
    };
}

function qualityAssureItem(overrides: Record<string, unknown> = {}) {
    const sourceText = String(overrides.sourceText ?? 'Article 1');
    const targetText = String(overrides.targetText ?? '第一条');
    return {
        id: 'item-1',
        status: 'MT_REVIEW',
        sourceText,
        targetText,
        qualityAssureSyntax: completeQualitySyntax(sourceText, targetText),
        metadata: {
            qaRunId: 'qa-run-a',
            qaResultRunId: 'qa-run-a',
        },
        updatedAt: version,
        ...overrides,
    };
}

function postEditReviewItem(overrides: Record<string, unknown> = {}) {
    return {
        id: 'item-1',
        status: 'POST_EDIT_REVIEW',
        sourceText: 'Article 1',
        targetText: 'Saved translation',
        metadata: { retained: true },
        updatedAt: version,
        ...overrides,
    };
}

test('claims pre-translation with an exact NOT_STARTED compare-and-set', async () => {
    const item = preTranslationItem({ targetText: null });
    let write: any;

    const result = await startPreTranslationWithDeps('item-1', 'Article 1', {
        requireWritableDocumentItem: async () => item,
        updateDocumentItem: async next => {
            write = next;
            return { count: 1 };
        },
        createRunId: () => 'run-a',
    });

    assert.equal(result.status, 'MT');
    assert.deepEqual(write, {
        where: {
            id: 'item-1',
            status: 'NOT_STARTED',
            sourceText: 'Article 1',
            updatedAt: version,
        },
        data: {
            status: 'MT',
            metadata: {
                preTranslateSourceRevision: sourceRevision('Article 1'),
                targetSourceRevision: sourceRevision('Article 1'),
                preTranslateRunId: 'run-a',
            },
        },
    });
});

test('does not let a second tab repeat MT or claim a stale row', async () => {
    await assert.rejects(
        startPreTranslationWithDeps('item-1', 'Article 1', {
            requireWritableDocumentItem: async () => preTranslationItem({ status: 'MT' }),
            updateDocumentItem: async () => ({ count: 1 }),
            createRunId: () => 'run-a',
        }),
        /其他操作启动/
    );

    await assert.rejects(
        startPreTranslationWithDeps('item-1', 'Article 1', {
            requireWritableDocumentItem: async () => preTranslationItem({ targetText: null }),
            updateDocumentItem: async () => ({ count: 0 }),
            createRunId: () => 'run-a',
        }),
        /其他操作更新/
    );

    let staleSourceWrites = 0;
    await assert.rejects(
        startPreTranslationWithDeps('item-1', 'old source', {
            requireWritableDocumentItem: async () => preTranslationItem({ targetText: null }),
            updateDocumentItem: async () => {
                staleSourceWrites += 1;
                return { count: 1 };
            },
            createRunId: () => 'run-a',
        }),
        /原文已变化/
    );
    assert.equal(staleSourceWrites, 0);
});

test('requires a current durable pre-translation before MT_REVIEW', async () => {
    const item = preTranslationItem({ status: 'MT' });
    let write: any;

    assert.equal(hasCurrentPersistedPreTranslationResult(item, 'run-a'), true);
    const result = await completePreTranslationWithDeps('item-1', 'run-a', {
        requireWritableDocumentItem: async () => item,
        updateDocumentItem: async next => {
            write = next;
            return { count: 1 };
        },
    });

    assert.equal(result.status, 'MT_REVIEW');
    assert.deepEqual(write, {
        where: { id: 'item-1', status: 'MT', updatedAt: version },
        data: { status: 'MT_REVIEW' },
    });

    await assert.rejects(
        completePreTranslationWithDeps('item-1', 'run-a', {
            requireWritableDocumentItem: async () => item,
            updateDocumentItem: async () => ({ count: 0 }),
        }),
        /其他操作更新/
    );
});

test('rejects an empty, stale, or mismatched result before review', async () => {
    const staleSource = preTranslationItem({
        status: 'MT',
        metadata: {
            preTranslateSourceRevision: sourceRevision('older source'),
            targetSourceRevision: sourceRevision('older source'),
        },
    });
    const mismatchedTarget = preTranslationItem({ status: 'MT', targetText: 'manual edit' });
    const emptyResult = preTranslationItem({
        status: 'MT',
        preTranslateEmbedded: '   ',
        targetText: '',
    });

    for (const item of [staleSource, mismatchedTarget, emptyResult]) {
        assert.equal(hasCurrentPersistedPreTranslationResult(item, 'run-a'), false);
        await assert.rejects(
            completePreTranslationWithDeps('item-1', 'run-a', {
                requireWritableDocumentItem: async () => item,
                updateDocumentItem: async () => ({ count: 1 }),
            }),
            /结果缺失或已过期/
        );
    }
});

test('fences a late pre-translation run after rollback and retry', async () => {
    let row: any = preTranslationItem({
        status: 'NOT_STARTED',
        targetText: null,
        preTranslateEmbedded: null,
        metadata: {},
    });
    const runIds = ['run-a', 'run-b'];
    const deps = {
        requireWritableDocumentItem: async () => row,
        updateDocumentItem: async (write: any) => {
            Object.assign(row, write.data);
            row.updatedAt = new Date(row.updatedAt.getTime() + 1);
            return { count: 1 };
        },
        createRunId: () => String(runIds.shift() || ''),
    };

    const first = await startPreTranslationWithDeps('item-1', 'Article 1', deps);
    assert.equal(first.preTranslateRunId, 'run-a');

    // The first request has produced a durable result, then the user rolls the
    // segment back and starts a new request with the same source/target text.
    row.preTranslateEmbedded = '第一版';
    row.targetText = '第一版';
    row.metadata = {
        ...row.metadata,
        preTranslateSourceRevision: sourceRevision('Article 1'),
        targetSourceRevision: sourceRevision('Article 1'),
        preTranslateResultRunId: 'run-a',
    };
    row.status = 'NOT_STARTED';
    row.updatedAt = new Date(row.updatedAt.getTime() + 1);

    const second = await startPreTranslationWithDeps('item-1', 'Article 1', deps);
    assert.equal(second.preTranslateRunId, 'run-b');
    assert.equal(isCurrentPreTranslationRun(row, 'run-a'), false);
    assert.equal(isCurrentPreTranslationRun(row, 'run-b'), true);
    assert.equal(hasCurrentPersistedPreTranslationResult(row, 'run-b'), false);

    await assert.rejects(
        completePreTranslationWithDeps('item-1', 'run-a', deps),
        /结果缺失或已过期/
    );

    row.preTranslateEmbedded = '第二版';
    row.targetText = '第二版';
    row.metadata = {
        ...row.metadata,
        preTranslateSourceRevision: sourceRevision('Article 1'),
        targetSourceRevision: sourceRevision('Article 1'),
        preTranslateResultRunId: 'run-b',
    };
    row.updatedAt = new Date(row.updatedAt.getTime() + 1);

    const completed = await completePreTranslationWithDeps('item-1', 'run-b', deps);
    assert.equal(completed.status, 'MT_REVIEW');
});

test('claims QA with an exact MT_REVIEW compare-and-set', async () => {
    const item = qualityAssureItem({
        qualityAssureSyntax: null,
        metadata: { retained: true, qaResultRunId: 'older-run' },
    });
    let write: any;

    const result = await startQualityAssureWithDeps('item-1', 'Article 1', '第一条', {
        requireWritableDocumentItem: async () => item,
        updateDocumentItem: async next => {
            write = next;
            return { count: 1 };
        },
        createRunId: () => 'qa-run-a',
    });

    assert.equal(result.status, 'QA');
    assert.equal(result.qaRunId, 'qa-run-a');
    assert.deepEqual(write, {
        where: {
            id: 'item-1',
            status: 'MT_REVIEW',
            sourceText: 'Article 1',
            targetText: '第一条',
            updatedAt: version,
        },
        data: {
            status: 'QA',
            metadata: { retained: true, qaRunId: 'qa-run-a' },
        },
    });
});

test('does not let a second tab repeat QA or claim a stale row', async () => {
    await assert.rejects(
        startQualityAssureWithDeps('item-1', 'Article 1', '第一条', {
            requireWritableDocumentItem: async () => qualityAssureItem({ status: 'QA' }),
            updateDocumentItem: async () => ({ count: 1 }),
            createRunId: () => 'qa-run-a',
        }),
        /预翻译复核阶段/
    );

    await assert.rejects(
        startQualityAssureWithDeps('item-1', 'Article 1', '第一条', {
            requireWritableDocumentItem: async () =>
                qualityAssureItem({ qualityAssureSyntax: null }),
            updateDocumentItem: async () => ({ count: 0 }),
            createRunId: () => 'qa-run-a',
        }),
        /其他操作更新/
    );
});

test('requires the current durable QA result before QA_REVIEW', async () => {
    const item = qualityAssureItem({ status: 'QA' });
    let write: any;

    assert.equal(hasCurrentPersistedQualityAssureResult(item, 'qa-run-a'), true);
    const result = await completeQualityAssureWithDeps('item-1', 'qa-run-a', {
        requireWritableDocumentItem: async () => item,
        updateDocumentItem: async next => {
            write = next;
            return { count: 1 };
        },
    });

    assert.equal(result.status, 'QA_REVIEW');
    assert.deepEqual(write, {
        where: { id: 'item-1', status: 'QA', updatedAt: version },
        data: { status: 'QA_REVIEW' },
    });

    await assert.rejects(
        completeQualityAssureWithDeps('item-1', 'different-run', {
            requireWritableDocumentItem: async () => item,
            updateDocumentItem: async () => ({ count: 1 }),
        }),
        /结果缺失或已过期/
    );
});

test('fences a late QA result after rollback and retry with identical text', async () => {
    let row: any = qualityAssureItem({
        status: 'MT_REVIEW',
        qualityAssureSyntax: null,
        metadata: {},
    });
    const runIds = ['qa-run-a', 'qa-run-b'];
    const deps = {
        requireWritableDocumentItem: async () => row,
        updateDocumentItem: async (write: any) => {
            Object.assign(row, write.data);
            row.updatedAt = new Date(row.updatedAt.getTime() + 1);
            return { count: 1 };
        },
        createRunId: () => String(runIds.shift() || ''),
    };

    const first = await startQualityAssureWithDeps('item-1', 'Article 1', '第一条', deps);
    assert.equal(first.qaRunId, 'qa-run-a');

    // Reviewer rollback leaves the same text in place. A newer claim must
    // still fence the older request rather than relying only on snapshots.
    row.status = 'MT_REVIEW';
    row.updatedAt = new Date(row.updatedAt.getTime() + 1);
    const second = await startQualityAssureWithDeps('item-1', 'Article 1', '第一条', deps);
    assert.equal(second.qaRunId, 'qa-run-b');
    assert.equal(isCurrentQualityAssureRun(row, 'qa-run-a'), false);
    assert.equal(isCurrentQualityAssureRun(row, 'qa-run-b'), true);

    row.qualityAssureSyntax = completeQualitySyntax('Article 1', '第一条');
    row.metadata = { ...row.metadata, qaResultRunId: 'qa-run-a' };
    row.updatedAt = new Date(row.updatedAt.getTime() + 1);
    assert.equal(hasCurrentPersistedQualityAssureResult(row, 'qa-run-a'), false);
    assert.equal(hasCurrentPersistedQualityAssureResult(row, 'qa-run-b'), false);

    await assert.rejects(
        completeQualityAssureWithDeps('item-1', 'qa-run-a', deps),
        /结果缺失或已过期/
    );
});

test('rejecting QA review atomically clears its run identity', async () => {
    const item = qualityAssureItem({ status: 'QA_REVIEW' });
    let write: any;

    const result = await rejectQualityAssureWithDeps('item-1', {
        requireWritableDocumentItem: async () => item,
        updateDocumentItem: async next => {
            write = next;
            return { count: 1 };
        },
    });

    assert.equal(result.status, 'QA');
    assert.deepEqual(write.where, { id: 'item-1', status: 'QA_REVIEW', updatedAt: version });
    assert.equal(write.data.status, 'QA');
    assert.equal('qaRunId' in write.data.metadata, false);
    assert.equal('qaResultRunId' in write.data.metadata, false);
});

test('manual post-edit saves reject stale or wrong-stage drafts before any write', async () => {
    let writes = 0;
    const deps = {
        requireWritableDocumentItem: async () =>
            postEditReviewItem({ targetText: 'Other tab edit' }),
        updateDocumentItem: async () => {
            writes += 1;
            return { count: 1 };
        },
    };

    await assert.rejects(
        savePostEditReviewDraftWithDeps(
            'item-1',
            {
                expectedSourceText: 'Article 1',
                expectedTargetText: 'Saved translation',
                targetText: 'My local draft',
            },
            deps
        ),
        /其他窗口更新/
    );
    assert.equal(writes, 0);

    await assert.rejects(
        savePostEditReviewDraftWithDeps(
            'item-1',
            {
                expectedSourceText: 'Article 1',
                expectedTargetText: 'Saved translation',
                targetText: 'My local draft',
            },
            {
                requireWritableDocumentItem: async () => postEditReviewItem({ status: 'SIGN_OFF' }),
                updateDocumentItem: async () => {
                    writes += 1;
                    return { count: 1 };
                },
            }
        ),
        /不处于译后复核/
    );
    assert.equal(writes, 0);
});

test('post-edit draft helpers require an explicit writable-item dependency', async () => {
    await assert.rejects(
        savePostEditReviewDraftWithDeps(
            'item-1',
            {
                expectedSourceText: 'Article 1',
                expectedTargetText: 'Saved translation',
                targetText: 'My local draft',
            },
            {
                updateDocumentItem: async () => ({ count: 1 }),
            } as any
        ),
        /requireWritableDocumentItem/
    );
});

test('sign-off writes the visible draft and status in one conditional mutation', async () => {
    let write: any;
    const result = await signOffPostEditReviewWithDeps(
        'item-1',
        {
            expectedSourceText: 'Article 1',
            expectedTargetText: 'Saved translation',
            targetText: 'Visible TipTap draft',
        },
        {
            requireWritableDocumentItem: async () => postEditReviewItem(),
            updateDocumentItem: async next => {
                write = next;
                return { count: 1 };
            },
        }
    );

    assert.equal(result.status, 'SIGN_OFF');
    assert.equal(result.targetText, 'Visible TipTap draft');
    assert.deepEqual(write.where, {
        id: 'item-1',
        status: 'POST_EDIT_REVIEW',
        sourceText: 'Article 1',
        targetText: 'Saved translation',
        updatedAt: version,
    });
    assert.equal(write.data.targetText, 'Visible TipTap draft');
    assert.equal(write.data.status, 'SIGN_OFF');
    assert.equal(write.data.metadata.targetSourceRevision, sourceRevision('Article 1'));
});

test('a concurrent conditional-write conflict leaves the post-edit draft unsigned', async () => {
    let writes = 0;
    await assert.rejects(
        signOffPostEditReviewWithDeps(
            'item-1',
            {
                expectedSourceText: 'Article 1',
                expectedTargetText: 'Saved translation',
                targetText: 'Visible TipTap draft',
            },
            {
                requireWritableDocumentItem: async () => postEditReviewItem(),
                updateDocumentItem: async () => {
                    writes += 1;
                    return { count: 0 };
                },
            }
        ),
        /未保存也未签发/
    );
    assert.equal(writes, 1);
});
