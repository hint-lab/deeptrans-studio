import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { BATCH_CLIENT_MESSAGES, resolveBatchClientErrorMessage } from './batch-client-error';

test('batch client error messages suppress arbitrary server and provider detail', () => {
    const fallback = BATCH_CLIENT_MESSAGES.translateFailed;

    assert.equal(
        resolveBatchClientErrorMessage(
            new Error('connect ECONNREFUSED 10.0.0.4:6379 queue=translation'),
            fallback
        ),
        fallback
    );
    assert.equal(
        resolveBatchClientErrorMessage('database role deeptrans missing', fallback),
        fallback
    );
});

test('batch client error messages retain only explicitly actionable local states', () => {
    assert.equal(
        resolveBatchClientErrorMessage(
            new Error(BATCH_CLIENT_MESSAGES.preTranslateCancelPending),
            BATCH_CLIENT_MESSAGES.translateFailed
        ),
        BATCH_CLIENT_MESSAGES.preTranslateCancelPending
    );
    assert.equal(
        resolveBatchClientErrorMessage(
            new Error(BATCH_CLIENT_MESSAGES.qaTimedOut),
            BATCH_CLIENT_MESSAGES.qaFailed
        ),
        BATCH_CLIENT_MESSAGES.qaTimedOut
    );
});

test('the IDE batch actions route failures through the public error boundary', () => {
    const actionSection = readFileSync(
        resolve(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'ide',
            '[id]',
            'components',
            'menu',
            'action-section.tsx'
        ),
        'utf8'
    );

    assert.match(actionSection, /resolveBatchClientErrorMessage/);
    assert.match(actionSection, /batchQACancelErrorRef\.current = resolveBatchClientErrorMessage/);
    assert.match(
        actionSection,
        /batchPreTranslateCancelErrorRef\.current = resolveBatchClientErrorMessage/
    );
    assert.doesNotMatch(actionSection, /toast\.error\(`[^`]*\$\{String\(/);
    assert.doesNotMatch(actionSection, /throw new Error\(payload\?\.error/);
    assert.doesNotMatch(actionSection, /throw new Error\(progress\?\.error/);
});
