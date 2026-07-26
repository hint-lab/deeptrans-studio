import assert from 'node:assert/strict';
import test from 'node:test';
import type { TranslationStage } from '@/store/features/translationSlice';
import { getTranslationStageGuidance } from './translation-stage-guidance';

test('maps every persisted stage to one truthful translator-facing next action', () => {
    const expected: Array<[TranslationStage, string, boolean]> = [
        ['NOT_STARTED', 'startPreTranslation', true],
        ['MT', 'waitForPreTranslation', false],
        ['MT_REVIEW', 'reviewPreTranslation', true],
        ['QA', 'waitForQA', false],
        ['QA_REVIEW', 'reviewQA', true],
        ['POST_EDIT', 'waitForPostEdit', false],
        ['POST_EDIT_REVIEW', 'reviewPostEdit', true],
        ['SIGN_OFF', 'completeProject', true],
        ['COMPLETED', 'none', false],
        ['ERROR', 'restartPreTranslation', true],
        ['CANCELED', 'restartPreTranslation', true],
    ];

    for (const [stage, action, requiresUserAction] of expected) {
        const guidance = getTranslationStageGuidance(stage);
        assert.equal(guidance.action, action, stage);
        assert.equal(guidance.requiresUserAction, requiresUserAction, stage);
    }
});

test('never presents an automated stage as waiting for a manual confirmation', () => {
    for (const stage of ['MT', 'QA', 'POST_EDIT'] as const) {
        const guidance = getTranslationStageGuidance(stage);
        assert.equal(guidance.tone, 'running', stage);
        assert.equal(guidance.requiresUserAction, false, stage);
    }
});
