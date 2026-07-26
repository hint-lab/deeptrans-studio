import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function vectorIndexKeys(locale: string) {
    const document = JSON.parse(
        readFileSync(resolve(process.cwd(), 'src', 'i18n', `${locale}.json`), 'utf8')
    );
    return Object.keys(document?.Dashboard?.Memories?.VectorIndex || {}).sort();
}

test('memory vector backfill state is fully localized in English and Chinese', () => {
    const zh = vectorIndexKeys('zh');
    const en = vectorIndexKeys('en');
    assert.deepEqual(en, zh);
    assert.deepEqual(zh, [
        'complete',
        'completedWithRemaining',
        'coverage',
        'empty',
        'failed',
        'loading',
        'needsBackfill',
        'pollingPaused',
        'progressBatches',
        'progressPercent',
        'queued',
        'refreshStatus',
        'requestFailed',
        'running',
        'start',
        'starting',
        'statusUnavailable',
        'title',
        'unavailable',
        'workerStale',
        'workerUnavailable',
    ]);
});
