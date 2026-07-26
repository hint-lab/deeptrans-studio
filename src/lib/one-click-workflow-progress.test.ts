import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateOneClickWorkflowProgress } from './one-click-workflow-progress';

test('uses two automatic work units per NOT_STARTED segment', () => {
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: 10,
            qaCount: 10,
            stage: 'pre-translate',
            stagePercent: 100,
        }),
        50
    );
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: 10,
            qaCount: 10,
            stage: 'quality-assure',
            stagePercent: 0,
        }),
        50
    );
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: 10,
            qaCount: 10,
            stage: 'quality-assure',
            stagePercent: 100,
        }),
        100
    );
});

test('lets a pure QA run progress from zero to one hundred', () => {
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: 0,
            qaCount: 8,
            stage: 'quality-assure',
            stagePercent: 0,
        }),
        0
    );
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: 0,
            qaCount: 8,
            stage: 'quality-assure',
            stagePercent: 100,
        }),
        100
    );
});

test('keeps a mixed pre-translate and QA run on one stable scale', () => {
    // Six NOT_STARTED items need twelve units; four MT_REVIEW items add four
    // QA-only units. Finishing pre-translation therefore completes 6/16.
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: 6,
            qaCount: 10,
            stage: 'pre-translate',
            stagePercent: 100,
        }),
        38
    );
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: 6,
            qaCount: 10,
            stage: 'quality-assure',
            stagePercent: 50,
        }),
        69
    );
});

test('normalizes invalid counts and percentages without exceeding the UI range', () => {
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: -1,
            qaCount: 2,
            stage: 'quality-assure',
            stagePercent: 150,
        }),
        100
    );
    assert.equal(
        calculateOneClickWorkflowProgress({
            preTranslateCount: Number.NaN,
            qaCount: Number.NaN,
            stage: 'pre-translate',
            stagePercent: Number.NaN,
        }),
        0
    );
});
