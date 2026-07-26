import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { resolveMtReviewErrorKey, resolveQaReviewErrorKey } from './ide-review-error';

test('QA review preserves only known reviewer-actionable conflicts', () => {
    assert.equal(
        resolveQaReviewErrorKey(
            new Error('当前译文已被修改，请重新质检后再生成'),
            'generateFailed'
        ),
        'rerunRequired'
    );
    assert.equal(
        resolveQaReviewErrorKey(new Error('所选质检问题已失效，请重新选择'), 'generateFailed'),
        'selectionChanged'
    );
    assert.equal(
        resolveQaReviewErrorKey(new Error('postgres password=unsafe'), 'generateFailed'),
        'generateFailed'
    );
});

test('MT review maps candidate conflicts and keeps unexpected failures out of toast copy', () => {
    assert.equal(
        resolveMtReviewErrorKey(
            new Error('当前译文已被其他窗口更新，候选译文未应用；请刷新后重试'),
            'applyFailed'
        ),
        'candidateRefreshRequired'
    );
    assert.equal(
        resolveMtReviewErrorKey(new Error('没有译文的词条不能启用'), 'saveStatusFailed'),
        'translationRequiredForEnable'
    );
    assert.equal(
        resolveMtReviewErrorKey(
            new Error('ECONNREFUSED db.internal password=unsafe'),
            'saveFailed'
        ),
        'saveFailed'
    );
});

test('review panels translate resolver keys instead of passing raw action errors to toasts', () => {
    const root = process.cwd();
    const qaPanel = readFileSync(
        resolve(root, 'src/app/(app)/ide/[id]/components/parallel-editor/panels/qa-review.tsx'),
        'utf8'
    );
    const mtPanel = readFileSync(
        resolve(root, 'src/app/(app)/ide/[id]/components/parallel-editor/panels/mt-review.tsx'),
        'utf8'
    );

    assert.match(qaPanel, /toast\.error\(t\(resolveQaReviewErrorKey\(/);
    assert.match(mtPanel, /toast\.error\(t\(resolveMtReviewErrorKey\(/);
    assert.doesNotMatch(qaPanel, /toast\.error\(error instanceof Error \? error\.message/);
    assert.doesNotMatch(mtPanel, /toast\.error\(String\(e\?\.message/);
    assert.doesNotMatch(mtPanel, /toast\.error\(e\?\.message/);
});
