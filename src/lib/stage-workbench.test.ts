import assert from 'node:assert/strict';
import test from 'node:test';
import type { TranslationStage } from '@/store/features/translationSlice';
import {
    getAutomaticStagePresentation,
    getStageWorkbenchKind,
    getStageWorkbenchWorkflowKey,
    shouldShowPostEditQueryEvidence,
} from './stage-workbench';

test('maps every translation stage to one focused workbench surface', () => {
    const expected: Array<[TranslationStage, ReturnType<typeof getStageWorkbenchKind>]> = [
        ['NOT_STARTED', 'automatic'],
        ['MT', 'automatic'],
        ['MT_REVIEW', 'review'],
        ['QA', 'automatic'],
        ['QA_REVIEW', 'review'],
        ['POST_EDIT', 'automatic'],
        ['POST_EDIT_REVIEW', 'review'],
        ['SIGN_OFF', 'signoff'],
        ['COMPLETED', 'signoff'],
        ['ERROR', 'automatic'],
        ['CANCELED', 'automatic'],
    ];

    for (const [stage, kind] of expected) {
        assert.equal(getStageWorkbenchKind(stage), kind, stage);
    }
});

test('exposes only the workflow that belongs to the current translation phase', () => {
    const expected: Array<[TranslationStage, ReturnType<typeof getStageWorkbenchWorkflowKey>]> = [
        ['NOT_STARTED', 'preWorkflow'],
        ['MT', 'preWorkflow'],
        ['MT_REVIEW', 'preWorkflow'],
        ['QA', 'qaWorkflow'],
        ['QA_REVIEW', 'qaWorkflow'],
        ['POST_EDIT', 'postEditWorkflow'],
        ['POST_EDIT_REVIEW', 'postEditWorkflow'],
        ['SIGN_OFF', null],
        ['COMPLETED', null],
        ['ERROR', null],
        ['CANCELED', null],
    ];

    for (const [stage, workflow] of expected) {
        assert.equal(getStageWorkbenchWorkflowKey(stage), workflow, stage);
    }
});

test('shows retrieval evidence while post-editing is automatic but keeps review separate', () => {
    assert.equal(shouldShowPostEditQueryEvidence('POST_EDIT'), true);
    assert.equal(shouldShowPostEditQueryEvidence('POST_EDIT_REVIEW'), false);
    assert.equal(shouldShowPostEditQueryEvidence('QA_REVIEW'), false);
});

test('derives a canceled automatic panel as stopped and recoverable, never running', () => {
    assert.deepEqual(getAutomaticStagePresentation('CANCELED'), {
        statusKey: 'CANCELED',
        isBusy: false,
        showProcessingHint: false,
        isRecoverable: true,
    });

    assert.deepEqual(getAutomaticStagePresentation('ERROR'), {
        statusKey: 'ERROR',
        isBusy: false,
        showProcessingHint: false,
        isRecoverable: false,
    });

    assert.deepEqual(getAutomaticStagePresentation('NOT_STARTED'), {
        statusKey: 'NOT_STARTED',
        isBusy: false,
        showProcessingHint: false,
        isRecoverable: false,
    });

    assert.deepEqual(getAutomaticStagePresentation('MT'), {
        statusKey: 'RUNNING',
        isBusy: true,
        showProcessingHint: true,
        isRecoverable: false,
    });
});
