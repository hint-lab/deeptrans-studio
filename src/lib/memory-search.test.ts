import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
    buildMemoryKeywordFallbackClauses,
    expandMemorySearchCandidatePool,
    formatMemorySearchDisplaySignal,
    hasIncompleteMemorySearchResult,
    isPublicMemorySearchErrorMessage,
    memorySearchErrorOrFallback,
    memorySearchDisplaySignal,
    memorySearchPublicErrorMessage,
    meetsMemorySearchRelevanceThreshold,
    meetsMemorySimilarityThreshold,
    scoreMemoryKeywordFallback,
    splitMemorySearchHighlights,
} from './memory-search';

test('expands a stale default hybrid candidate pool to honour the requested result count', () => {
    assert.deepEqual(
        expandMemorySearchCandidatePool(
            {
                finalTopK: 10,
                vectorSearch: { enabled: true, topK: 10 },
                keywordSearch: { enabled: true, topK: 10 },
            },
            50
        ),
        {
            finalTopK: 50,
            vectorSearch: { enabled: true, topK: 50 },
            keywordSearch: { enabled: true, topK: 50 },
        }
    );
});

test('highlights regex-special search terms as literal plain-text segments', () => {
    assert.deepEqual(splitMemorySearchHighlights('aXb a.b C++ [draft]', 'a.b C++ [draft]'), [
        { text: 'aXb ', highlighted: false },
        { text: 'a.b', highlighted: true },
        { text: ' ', highlighted: false },
        { text: 'C++', highlighted: true },
        { text: ' ', highlighted: false },
        { text: '[draft]', highlighted: true },
    ]);
});

test('renders result highlights without inserting generated HTML', () => {
    const componentSource = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'dashboard',
            'memories',
            'components',
            'search-result-item.tsx'
        ),
        'utf8'
    );

    assert.doesNotMatch(componentSource, /dangerouslySetInnerHTML/);
});

test('applies the similarity threshold to zero and missing scores', () => {
    assert.equal(meetsMemorySimilarityThreshold(0, 0.3), false);
    assert.equal(meetsMemorySimilarityThreshold(undefined, 0.3), false);
    assert.equal(meetsMemorySimilarityThreshold(0.3, 0.3), true);
    assert.equal(meetsMemorySimilarityThreshold(0, 0), true);
});

test('keeps a strong keyword-only result after weighted fusion', () => {
    assert.equal(
        meetsMemorySearchRelevanceThreshold(
            { score: 0.27, keywordScore: 0.9, vectorScore: undefined },
            0.3
        ),
        true
    );
    assert.equal(meetsMemorySearchRelevanceThreshold({ score: undefined }, 0.3), false);
});

test('does not confuse an empty degraded search with a confirmed zero-hit result', () => {
    assert.equal(hasIncompleteMemorySearchResult(0, ['vector']), true);
    assert.equal(hasIncompleteMemorySearchResult(0, ['keyword']), true);
    assert.equal(hasIncompleteMemorySearchResult(1, ['vector']), false);
    assert.equal(hasIncompleteMemorySearchResult(0, []), false);
    assert.equal(hasIncompleteMemorySearchResult(0, ['untrusted-leg']), false);
});

test('uses raw evidence instead of an unbounded rank-fusion ordering score for thresholds', () => {
    assert.equal(
        meetsMemorySearchRelevanceThreshold(
            { score: 2, vectorScore: 0.2, keywordScore: 0.1, searchMode: 'hybrid' },
            0.3
        ),
        false
    );
});

test('presents raw vector similarity instead of the lower hybrid fusion score', () => {
    const hit = {
        score: 0.68,
        vectorScore: 0.85,
        keywordScore: 0.92,
        searchMode: 'hybrid',
    };

    assert.deepEqual(memorySearchDisplaySignal(hit), { kind: 'semantic', score: 0.85 });
    assert.equal(formatMemorySearchDisplaySignal(hit, 'zh'), '语义相似度 85%');
    assert.equal(formatMemorySearchDisplaySignal(hit, 'en'), 'Semantic similarity 85%');
});

test('presents keyword retrieval as a match type rather than a fusion percentage', () => {
    const hit = { score: 0.18, keywordScore: 0.9, searchMode: 'keyword' };

    assert.deepEqual(memorySearchDisplaySignal(hit), { kind: 'keyword' });
    assert.equal(formatMemorySearchDisplaySignal(hit, 'zh'), '关键词匹配');
    assert.equal(formatMemorySearchDisplaySignal(hit, 'en'), 'Keyword match');
});

test('never turns an unqualified ordering score into a similarity percentage', () => {
    const hit = { score: 0.73, searchMode: 'hybrid' };

    assert.deepEqual(memorySearchDisplaySignal(hit), { kind: 'match' });
    assert.equal(formatMemorySearchDisplaySignal(hit, 'zh'), '检索命中');
    assert.equal(formatMemorySearchDisplaySignal(hit, 'en'), 'Retrieved match');
});

test('does not present an unbounded keyword ranking score as a percentage', () => {
    const hit = { score: 1.7, keywordScore: 2.4, searchMode: 'keyword' };

    assert.deepEqual(memorySearchDisplaySignal(hit), { kind: 'keyword' });
    assert.equal(formatMemorySearchDisplaySignal(hit, 'zh'), '关键词匹配');
    assert.equal(formatMemorySearchDisplaySignal(hit, 'en'), 'Keyword match');
});

test('search result UI renders a progress bar only for a raw vector similarity signal', () => {
    const componentSource = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'dashboard',
            'memories',
            'components',
            'search-result-item.tsx'
        ),
        'utf8'
    );

    assert.match(componentSource, /memorySearchDisplaySignal/);
    assert.match(componentSource, /formatMemorySearchDisplaySignal/);
    assert.match(componentSource, /retrievalSignal\.kind === 'semantic'/);
    assert.match(componentSource, /showScores && semanticScore !== undefined/);
    assert.doesNotMatch(componentSource, /memorySearchRelevanceScore/);
    assert.doesNotMatch(componentSource, /item\.keywordScore/);
});

test('builds keyword fallback clauses for source and target text', () => {
    assert.deepEqual(buildMemoryKeywordFallbackClauses(['contract']), [
        { sourceText: { contains: 'contract', mode: 'insensitive' } },
        { targetText: { contains: 'contract', mode: 'insensitive' } },
    ]);
});

test('scores target-only keyword fallback matches instead of returning zero', () => {
    const score = scoreMemoryKeywordFallback(['contract'], '无关原文', 'contract clause');

    assert.ok(score >= 0.4);
});

test('keeps only actionable retrieval errors user-visible', () => {
    assert.equal(
        memorySearchPublicErrorMessage('查询内容不能超过 500 个字符'),
        '查询内容不能超过 500 个字符'
    );
    assert.equal(
        memorySearchPublicErrorMessage('pgvector index is missing at /private/path'),
        '检索服务暂不可用，请稍后重试'
    );
    assert.equal(isPublicMemorySearchErrorMessage('检索服务暂不可用，请稍后重试'), true);
    assert.equal(isPublicMemorySearchErrorMessage('请至少启用一种检索方式'), true);
    assert.equal(
        memorySearchPublicErrorMessage(
            '部分检索服务暂不可用，无法确认是否存在相关结果，请稍后重试'
        ),
        '部分检索服务暂不可用，无法确认是否存在相关结果，请稍后重试'
    );
    assert.equal(
        isPublicMemorySearchErrorMessage(
            '部分检索服务暂不可用，无法确认是否存在相关结果，请稍后重试'
        ),
        true
    );
    assert.equal(
        isPublicMemorySearchErrorMessage(
            '当前项目关联的记忆库不可访问。请在项目资源中移除旧绑定，并绑定自己的记忆库后重试。'
        ),
        true
    );
    assert.equal(isPublicMemorySearchErrorMessage('connection refused 10.0.0.8'), false);
});

test('preserves a safe retrieval error through a larger workflow only', () => {
    assert.equal(
        memorySearchErrorOrFallback('语义检索暂不可用，请检查向量索引后重试', '译后编辑流程失败'),
        '语义检索暂不可用，请检查向量索引后重试'
    );
    assert.equal(
        memorySearchErrorOrFallback('provider stack trace: internal-host', '译后编辑流程失败'),
        '译后编辑流程失败'
    );
});
