import assert from 'node:assert/strict';
import test from 'node:test';
import {
    collectSyntaxCueHints,
    isSyntaxEvaluationTargetCompatible,
    normalizeSyntaxQualityResult,
    SYNTAX_CATEGORIES,
} from './syntax-quality';

const completeDimensions = SYNTAX_CATEGORIES.map(category => ({
    category,
    status: category === 'modality_deontic' ? 'pass' : 'not_applicable',
}));

test('normalizes a complete v2 result and fills every review dimension', () => {
    const result = normalizeSyntaxQualityResult({
        version: 2,
        relations: [
            {
                id: 'rel-1',
                category: 'modality_deontic',
                sourceSpan: 'shall not disclose',
                targetSpan: '不得披露',
                status: 'preserved',
                confidence: 0.98,
            },
        ],
        issues: [],
        dimensions: completeDimensions,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.reviewStatus, 'pass');
    assert.equal(result.legacy, false);
    assert.equal(result.relations[0]?.status, 'preserved');
    assert.equal(result.dimensions.length, SYNTAX_CATEGORIES.length);
    assert.equal(
        result.dimensions.find(item => item.category === 'modality_deontic')?.status,
        'pass'
    );
});

test('keeps legacy alignment data conservative instead of inventing legal risk', () => {
    const result = normalizeSyntaxQualityResult({
        syntaxPairs: [
            {
                sourceMarker: 'shall',
                targetMarker: '',
                type: 'modal',
                alignment: 0.2,
                notes: 'legacy output',
            },
        ],
        coverage: 0.5,
    });

    assert.equal(result.status, 'partial');
    assert.equal(result.reviewStatus, 'unknown');
    assert.equal(result.legacy, true);
    assert.equal(result.relations[0]?.status, 'uncertain');
    assert.equal(result.relations[0]?.severity, undefined);
    assert.equal(result.issues.length, 0);
});

test('normalizes legacy issues without silently selecting or overrating them', () => {
    const result = normalizeSyntaxQualityResult({
        issues: [{ type: 'conditional', span: 'unless approved', advice: 'restore exception' }],
    });

    assert.equal(result.issues[0]?.category, 'condition_exception');
    assert.equal(result.issues[0]?.severity, undefined);
    assert.equal(result.selectedMap[result.issues[0]?.id || ''], false);
});

test('treats malformed model output as a failed run rather than a clean result', () => {
    const result = normalizeSyntaxQualityResult({ raw: '```json\n{"issues": [\n```' });

    assert.equal(result.status, 'failed');
    assert.equal(result.reviewStatus, 'unknown');
    assert.deepEqual(result.issues, []);
    assert.ok(result.warnings.includes('SYNTAX_QA_INVALID_RESPONSE'));
});

test('parses fenced v2 JSON and preserves evaluation provenance', () => {
    const result = normalizeSyntaxQualityResult({
        raw: `\`\`\`json
${JSON.stringify({
    version: 2,
    relations: [],
    issues: [],
    dimensions: completeDimensions,
    evaluation: {
        id: 'eval-1',
        sourceRevision: 's',
        targetRevision: 't',
        baseSource: 'source',
        baseTarget: 'baseline',
        proposalBaseTarget: 'first proposal',
        embeddedIssueIds: [],
    },
})}
\`\`\``,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.evaluation?.id, 'eval-1');
    assert.equal(result.evaluation?.baseSource, 'source');
    assert.equal(result.evaluation?.baseTarget, 'baseline');
    assert.equal(result.evaluation?.proposalBaseTarget, 'first proposal');
});

test('keeps a newly generated proposal applicable when it was based on an applied prior proposal', () => {
    const evaluation = {
        id: 'eval-2',
        sourceRevision: 'source-revision',
        targetRevision: 'target-revision',
        baseSource: 'source',
        baseTarget: 'baseline',
        proposalBaseTarget: 'applied proposal one',
        embeddedIssueIds: ['issue-2'],
    };

    assert.equal(
        isSyntaxEvaluationTargetCompatible(evaluation, 'applied proposal one', 'proposal two'),
        true
    );
    assert.equal(
        isSyntaxEvaluationTargetCompatible(evaluation, 'manual unreviewed edit', 'proposal two'),
        false
    );
});

test('does not mark a v2 response complete when a required dimension status is missing', () => {
    const result = normalizeSyntaxQualityResult({
        version: 2,
        relations: [],
        issues: [],
        dimensions: SYNTAX_CATEGORIES.map(category =>
            category === 'negation_scope' ? { category } : { category, status: 'not_applicable' }
        ),
    });

    assert.equal(result.status, 'partial');
    assert.equal(result.reviewStatus, 'unknown');
    assert.ok(result.warnings.includes('SYNTAX_QA_PARTIAL_RESPONSE'));
});

test('generates distinct stable IDs for duplicate issue content', () => {
    const result = normalizeSyntaxQualityResult({
        version: 2,
        relations: [],
        issues: [
            {
                id: 'duplicate-id',
                category: 'grammar_register',
                severity: 'minor',
                targetSpan: 'are',
                message: 'agreement',
                advice: 'use is',
            },
            {
                id: 'duplicate-id',
                category: 'grammar_register',
                severity: 'minor',
                targetSpan: 'are',
                message: 'agreement',
                advice: 'use is',
            },
        ],
        dimensions: [],
    });

    assert.equal(result.issues.length, 2);
    assert.notEqual(result.issues[0]?.id, result.issues[1]?.id);
});

test('creates a review issue for an explicit v2 structural shift', () => {
    const result = normalizeSyntaxQualityResult({
        version: 2,
        relations: [
            {
                category: 'negation_scope',
                sourceSpan: 'must not disclose',
                targetSpan: 'may disclose',
                status: 'shifted',
                explanation: 'The prohibition became permission.',
            },
        ],
        issues: [],
        dimensions: [],
    });

    assert.equal(result.reviewStatus, 'needs_review');
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]?.category, 'negation_scope');
    assert.equal(result.issues[0]?.severity, 'major');
});

test('deterministic cue hints cover core legal syntax triggers on both sides', () => {
    const cues = collectSyntaxCueHints(
        'Unless approved, the Buyer must not disclose any record within 30 days.',
        '除非获得批准，买方不得在30日内披露任何记录。'
    );

    for (const category of [
        'modality_deontic',
        'condition_exception',
        'negation_scope',
        'actor_role',
        'temporal_sequence',
        'quantifier_number',
    ] as const) {
        assert.ok(cues.source[category]?.length, `missing source cue for ${category}`);
        assert.ok(cues.target[category]?.length, `missing target cue for ${category}`);
    }
});
