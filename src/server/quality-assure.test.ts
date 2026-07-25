import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSyntaxQualityResult, SYNTAX_CATEGORIES } from '@/lib/syntax-quality';
import { runSyntaxEvaluationWithRetry } from './quality-assure';

function completeResult() {
    return normalizeSyntaxQualityResult({
        version: 2,
        status: 'complete',
        relations: [],
        issues: [],
        dimensions: SYNTAX_CATEGORIES.map(category => ({
            category,
            status: 'not_applicable',
        })),
    });
}

test('complete syntax QA results are returned without an extra model call', async () => {
    const prompts: Array<string | undefined> = [];
    const expected = completeResult();

    const result = await runSyntaxEvaluationWithRetry(async prompt => {
        prompts.push(prompt);
        return expected;
    }, 'keep the legal register');

    assert.equal(result, expected);
    assert.deepEqual(prompts, ['keep the legal register']);
});

test('incomplete syntax QA results retry once with the required v2 dimensions', async () => {
    const prompts: Array<string | undefined> = [];
    const responses = [normalizeSyntaxQualityResult({ raw: 'not json' }), completeResult()];

    const result = await runSyntaxEvaluationWithRetry(async prompt => {
        prompts.push(prompt);
        return responses.shift()!;
    }, 'preserve the user preference');

    assert.equal(result.status, 'complete');
    assert.equal(prompts.length, 2);
    assert.equal(prompts[0], 'preserve the user preference');
    assert.match(prompts[1] || '', /version=2/);
    assert.match(prompts[1] || '', /grammar_register/);
    assert.match(prompts[1] || '', /preserve the user preference/);
});

test('syntax QA retry is bounded to one additional call', async () => {
    let calls = 0;
    const failed = normalizeSyntaxQualityResult({ raw: 'still invalid' });

    const result = await runSyntaxEvaluationWithRetry(async () => {
        calls += 1;
        return failed;
    });

    assert.equal(calls, 2);
    assert.equal(result.status, 'failed');
});
