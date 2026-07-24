import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeDocumentTermScores } from './DocumentTermExtractAgent';
import {
    DOCUMENT_TERM_TRANSLATE_BATCH_SIZE,
    DOCUMENT_TERM_TRANSLATE_CONCURRENCY,
    DocumentTermTranslateAgent,
    normalizeDocumentTermTranslations,
} from './DocumentTermTranslateAgent';
import { buildStatCandidates } from '../../lib/terms/termStats';
import {
    DEFAULT_DOCUMENT_TERMS_LLM_TIMEOUT_MS,
    MAX_DOCUMENT_TERMS_LLM_TIMEOUT_MS,
    documentTermsLlmTimeoutMs,
} from '../../lib/terms/llm-config';

test('keeps statistical candidates for a single document chunk', () => {
    const candidates = buildStatCandidates(
        '学前教育制度保障适龄儿童接受普惠性学前教育。',
        8000,
        300,
        40
    );

    assert.ok(candidates.length > 0);
});

test('falls back to statistical candidates when LLM scoring is not an array', () => {
    const candidates = [
        { term: '学前教育', count: 4, score: 3 },
        { term: '适龄儿童', count: 2, score: 2 },
    ];

    assert.deepEqual(mergeDocumentTermScores({ raw: 'not valid JSON' }, candidates, 1), [
        candidates[0],
    ]);
    assert.deepEqual(mergeDocumentTermScores([], candidates, 10), candidates);
    assert.deepEqual(mergeDocumentTermScores([{ score: 0.9 }], candidates, 10), candidates);
    assert.deepEqual(
        mergeDocumentTermScores({ terms: [{ term: '适龄儿童', score: 0.9 }] }, candidates, 10),
        [{ term: '适龄儿童', count: 2, score: 0.9 }]
    );
});

test('uses a safe default for an invalid term LLM timeout', () => {
    assert.equal(documentTermsLlmTimeoutMs('not-a-number'), DEFAULT_DOCUMENT_TERMS_LLM_TIMEOUT_MS);
    assert.equal(documentTermsLlmTimeoutMs(''), DEFAULT_DOCUMENT_TERMS_LLM_TIMEOUT_MS);
    assert.equal(documentTermsLlmTimeoutMs('250'), 1000);
    assert.equal(documentTermsLlmTimeoutMs('-5'), 1000);
    assert.equal(documentTermsLlmTimeoutMs('1234'), 1234);
    assert.equal(documentTermsLlmTimeoutMs('1234.5'), 1234);
    assert.equal(documentTermsLlmTimeoutMs('4294967296'), MAX_DOCUMENT_TERMS_LLM_TIMEOUT_MS);
});

test('normalizes wrapped translation results while preserving requested order', () => {
    assert.deepEqual(
        normalizeDocumentTermTranslations(
            {
                translations: [
                    { term: '幼儿园', translation: 'kindergarten' },
                    { term: '学前教育', translation: 'preschool education' },
                ],
            },
            ['学前教育', '幼儿园', '适龄儿童']
        ),
        [
            { term: '学前教育', translation: 'preschool education', notes: undefined },
            { term: '幼儿园', translation: 'kindergarten', notes: undefined },
            { term: '适龄儿童', translation: '' },
        ]
    );
});

test('batches large term lists and passes a bounded timeout to each LLM call', async () => {
    const terms = Array.from(
        { length: DOCUMENT_TERM_TRANSLATE_BATCH_SIZE * 3 + 3 },
        (_, index) => `term-${index}`
    );
    assert.ok(DOCUMENT_TERM_TRANSLATE_CONCURRENCY < 4);
    const agent = new DocumentTermTranslateAgent() as any;
    const batchSizes: number[] = [];
    const options: Array<{ maxTokens?: number; timeoutMs?: number }> = [];
    let offset = 0;
    let activeCalls = 0;
    let maxActiveCalls = 0;
    const previousTimeout = process.env.DOCUMENT_TERMS_LLM_TIMEOUT_MS;
    process.env.DOCUMENT_TERMS_LLM_TIMEOUT_MS = '1234';
    agent.json = async (
        _messages: unknown,
        callOptions: { maxTokens?: number; timeoutMs?: number }
    ) => {
        const batch = terms.slice(offset, offset + DOCUMENT_TERM_TRANSLATE_BATCH_SIZE);
        offset += batch.length;
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        batchSizes.push(batch.length);
        options.push(callOptions);
        await new Promise(resolve => setTimeout(resolve, 5));
        activeCalls -= 1;
        return {
            translations: batch.map(term => ({ term, translation: `translated-${term}` })),
        };
    };

    try {
        const translated = await agent.execute({
            terms,
            sourceLanguage: 'zh',
            targetLanguage: 'en',
        });

        assert.deepEqual(batchSizes, [
            DOCUMENT_TERM_TRANSLATE_BATCH_SIZE,
            DOCUMENT_TERM_TRANSLATE_BATCH_SIZE,
            DOCUMENT_TERM_TRANSLATE_BATCH_SIZE,
            3,
        ]);
        assert.equal(maxActiveCalls, DOCUMENT_TERM_TRANSLATE_CONCURRENCY);
        assert.ok(options.every(option => option.timeoutMs === 1234));
        assert.equal(translated.length, terms.length);
        const lastIndex = terms.length - 1;
        assert.equal(translated[lastIndex]?.translation, `translated-term-${lastIndex}`);
    } finally {
        if (previousTimeout === undefined) delete process.env.DOCUMENT_TERMS_LLM_TIMEOUT_MS;
        else process.env.DOCUMENT_TERMS_LLM_TIMEOUT_MS = previousTimeout;
    }
});
