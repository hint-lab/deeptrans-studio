import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const worker = readFileSync(resolve(process.cwd(), 'src/worker/index.ts'), 'utf8');

test('document-term worker has cancellation fences before and after the model and at result publication', () => {
    assert.match(worker, /runDocumentTermsModelWithCancellation/);
    assert.match(worker, /commitDocumentTermsResultIfActive/);
    assert.match(worker, /if \(modelOutcome\.canceled\)/);
    assert.match(worker, /if \(resultCommit\.canceled\)/);
});

test('a canceled document-term job is not converted into a failed terminal state', () => {
    assert.match(worker, /terminalReason === 'JOB_CANCELED'/);
    assert.match(worker, /if \(canceled \|\| terminalReason === 'JOB_TERMINAL'\) return;/);
    const failedHandler = worker.indexOf("docTermsWorker.on('failed'");
    assert.ok(
        worker.indexOf(
            "if (canceled || terminalReason === 'JOB_TERMINAL') return;",
            failedHandler
        ) < worker.indexOf('`docTerms.${batchId}.failed`', failedHandler),
        'failure persistence must be after the cancellation return'
    );
});
