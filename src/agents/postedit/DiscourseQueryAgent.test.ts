import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscourseQueryAgent } from './DiscourseQueryAgent';
import { MemorySearchError, memoryTool } from '../tools/memory';

test('keeps a useful keyword-only reference during vector backfill', async () => {
    const originalSearch = memoryTool.search.bind(memoryTool);
    memoryTool.search = async () => [
        {
            id: 'keyword-reference',
            source: '源文',
            target: 'Target reference',
            score: 0.18,
            keywordScore: 0.9,
            searchMode: 'keyword',
        },
    ];

    try {
        const result = await new DiscourseQueryAgent().execute({
            source: '源文',
            owner: { userId: 'owner-a' },
        });
        assert.equal(result.hits.length, 1);
        assert.equal(result.hits[0]?.id, 'keyword-reference');
    } finally {
        memoryTool.search = originalSearch;
    }
});

test('retries keyword retrieval when hybrid candidates are all below the discourse threshold', async () => {
    const originalSearch = memoryTool.search.bind(memoryTool);
    const modes: Array<string | undefined> = [];
    memoryTool.search = async (_query, options) => {
        modes.push(options?.searchConfig?.mode);
        return options?.searchConfig?.mode === 'keyword'
            ? [
                  {
                      id: 'keyword-reference',
                      source: '源文',
                      target: 'Target reference',
                      score: 0.2,
                      keywordScore: 0.85,
                      searchMode: 'keyword',
                  },
              ]
            : [
                  {
                      id: 'weak-vector',
                      source: '近似源文',
                      target: 'Weak reference',
                      score: 0.1,
                      vectorScore: 0.1,
                      searchMode: 'vector',
                  },
              ];
    };

    try {
        const result = await new DiscourseQueryAgent().execute({
            source: '源文',
            owner: { userId: 'owner-a' },
            memoryIds: ['memory-a'],
        });
        assert.deepEqual(modes, ['hybrid', 'keyword']);
        assert.equal(result.hits[0]?.id, 'keyword-reference');
    } finally {
        memoryTool.search = originalSearch;
    }
});

test('propagates a retrieval outage instead of presenting it as no discourse references', async () => {
    const originalSearch = memoryTool.search.bind(memoryTool);
    memoryTool.search = async () => {
        throw new MemorySearchError('database connection refused at internal-host');
    };

    try {
        await assert.rejects(
            () =>
                new DiscourseQueryAgent().execute({
                    source: '源文',
                    owner: { userId: 'owner-a' },
                }),
            /检索服务暂不可用，请稍后重试/
        );
    } finally {
        memoryTool.search = originalSearch;
    }
});
