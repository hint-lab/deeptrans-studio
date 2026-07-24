import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntaxEvaluationId } from './syntax-evaluation-id';

test('creates a distinct evaluation event ID even when the evaluated text is unchanged', () => {
    assert.equal(createSyntaxEvaluationId('run-one'), 'syntax-qa-run-one');
    assert.notEqual(createSyntaxEvaluationId(), createSyntaxEvaluationId());
});
