import assert from 'node:assert/strict';
import test from 'node:test';
import type { TranslationStage } from '@/store/features/translationSlice';
import { getTranslationStageRejectionPlan } from './translation-stage-rejection-plan';
import { isAllowedDocumentItemStatusTransition } from './translation-stage-transitions';

test('keeps ordinary rejection paths to one adjacent status update', () => {
    const expected: Array<[TranslationStage, TranslationStage]> = [
        ['MT', 'NOT_STARTED'],
        ['MT_REVIEW', 'MT'],
        ['QA', 'MT_REVIEW'],
        ['QA_REVIEW', 'QA'],
        ['POST_EDIT', 'QA_REVIEW'],
        ['SIGN_OFF', 'POST_EDIT_REVIEW'],
        ['COMPLETED', 'SIGN_OFF'],
        ['ERROR', 'NOT_STARTED'],
        ['CANCELED', 'NOT_STARTED'],
    ];

    for (const [stage, previousStage] of expected) {
        const plan = getTranslationStageRejectionPlan(stage);
        assert.deepEqual(plan.statusUpdates, [previousStage], stage);
        assert.equal(plan.finalStage, previousStage, stage);
        assert.equal(plan.usesAtomicPostEditReviewReset, false, stage);
    }
});

test('routes post-edit review rejection through the dedicated atomic reset', () => {
    const plan = getTranslationStageRejectionPlan('POST_EDIT_REVIEW');
    assert.deepEqual(plan, {
        statusUpdates: [],
        finalStage: 'QA_REVIEW',
        usesAtomicPostEditReviewReset: true,
    });
    assert.equal(isAllowedDocumentItemStatusTransition('POST_EDIT_REVIEW', 'QA_REVIEW'), false);
});
