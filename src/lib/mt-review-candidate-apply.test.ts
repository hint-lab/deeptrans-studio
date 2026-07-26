import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyMtReviewCandidateWithUpdate,
    buildMtReviewCandidateApplyWhere,
    MT_REVIEW_CANDIDATE_CONFLICT_MESSAGE,
    type MtReviewCandidateConditionalUpdate,
} from './mt-review-candidate-apply';

const updatedAt = new Date('2026-07-26T00:00:00.000Z');

function item(overrides: Record<string, unknown> = {}) {
    return {
        id: 'item-1',
        status: 'MT_REVIEW',
        sourceText: '原文',
        targetText: '已保存译文',
        updatedAt,
        ...overrides,
    };
}

const snapshot = { sourceText: '原文', targetText: '已保存译文' };

test('builds a target-and-version conditional write from the displayed snapshot', () => {
    assert.deepEqual(buildMtReviewCandidateApplyWhere(item(), snapshot), {
        id: 'item-1',
        status: 'MT_REVIEW',
        sourceText: '原文',
        targetText: '已保存译文',
        updatedAt,
    });
});

test('does not write when another tab has already saved a newer target', async () => {
    let writes = 0;

    await assert.rejects(
        applyMtReviewCandidateWithUpdate(
            item({ targetText: '人工修订译文' }),
            snapshot,
            async () => {
                writes += 1;
                return { count: 1 };
            }
        ),
        new RegExp(MT_REVIEW_CANDIDATE_CONFLICT_MESSAGE)
    );

    assert.equal(writes, 0);
});

test('turns a same-snapshot apply race into one write and one explicit conflict', async () => {
    const row = item();
    const writes: MtReviewCandidateConditionalUpdate[] = [];
    const conditionalUpdate = async (update: MtReviewCandidateConditionalUpdate) => {
        writes.push(update);
        const matches =
            row.id === update.where.id &&
            row.status === update.where.status &&
            row.sourceText === update.where.sourceText &&
            row.targetText === update.where.targetText &&
            row.updatedAt === update.where.updatedAt;
        if (!matches) return { count: 0 };

        row.targetText = '候选译文';
        row.updatedAt = new Date('2026-07-26T00:00:01.000Z');
        return { count: 1 };
    };

    const first = applyMtReviewCandidateWithUpdate(item(), snapshot, conditionalUpdate);
    const second = applyMtReviewCandidateWithUpdate(item(), snapshot, conditionalUpdate);
    const results = await Promise.allSettled([first, second]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal(writes.length, 2);
    assert.equal(row.targetText, '候选译文');
    assert.equal(row.updatedAt instanceof Date, true);
});
