import assert from 'node:assert/strict';
import test from 'node:test';
import reducer, {
    setPreOutputs,
    setQAOutputs,
    setQADislikedPairs,
    setQASyntaxEmbedded,
    setPosteditOutputs,
    setPosteditOutcome,
    clearPosteditOutcome,
} from './workFlowStepSlice';

test('pre-translation outputs are scoped to one document item', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(
        state,
        setPreOutputs({
            itemId: 'article-1',
            terms: [{ term: 'preschool education' }],
            dict: [{ term: 'preschool education', translation: '学前教育' }],
            translation: 'Article 1 translated',
        })
    );

    state = reducer(state, setPreOutputs({ itemId: 'article-2', terms: [{ term: 'territory' }] }));

    assert.equal(state.preTranslateItemId, 'article-2');
    assert.deepEqual(state.preTranslateTerms, [{ term: 'territory' }]);
    assert.equal(state.preTranslateDict, undefined);
    assert.equal(state.preTranslateEmbedded, undefined);
});

test('clearing pre-translation outputs also clears their document owner', () => {
    let state = reducer(
        undefined,
        setPreOutputs({ itemId: 'article-1', translation: 'Article 1 translated' })
    );
    state = reducer(state, setPreOutputs(undefined));

    assert.equal(state.preTranslateItemId, undefined);
    assert.equal(state.preTranslateEmbedded, undefined);
});

test('QA outputs and proposals are cleared when the active document item changes', () => {
    let state = reducer(
        undefined,
        setQAOutputs({ itemId: 'article-1', biTerm: { relations: [1] }, syntax: { issues: [1] } })
    );
    state = reducer(state, setQASyntaxEmbedded('Article 1 revised'));
    state = reducer(state, setQADislikedPairs({ legacy: true }));

    state = reducer(state, setQAOutputs({ itemId: 'article-2', syntax: { issues: [] } }));

    assert.equal(state.qualityAssureItemId, 'article-2');
    assert.equal(state.qualityAssureBiTerm, undefined);
    assert.deepEqual(state.qualityAssureSyntax, { issues: [] });
    assert.equal(state.qualityAssureSyntaxEmbedded, undefined);
    assert.equal(state.qaDislikedPairs, undefined);
});

test('clearing QA outputs clears the item owner and every item-bound field', () => {
    let state = reducer(
        undefined,
        setQAOutputs({ itemId: 'article-1', biTerm: { relations: [] }, syntax: { issues: [] } })
    );
    state = reducer(state, setQASyntaxEmbedded('proposal'));
    state = reducer(state, setQAOutputs(undefined));

    assert.equal(state.qualityAssureItemId, undefined);
    assert.equal(state.qualityAssureBiTerm, undefined);
    assert.equal(state.qualityAssureSyntax, undefined);
    assert.equal(state.qualityAssureSyntaxEmbedded, undefined);
});

test('post-edit outcomes remain item-scoped and can be cleared without affecting another segment', () => {
    let state = reducer(
        undefined,
        setPosteditOutcome({
            itemId: 'article-1',
            status: 'error',
            phase: 'query',
            message: '检索服务暂不可用，请稍后重试',
        })
    );
    state = reducer(state, setPosteditOutcome({ itemId: 'article-2', status: 'success-empty' }));

    assert.equal(state.posteditOutcomes['article-1']?.status, 'error');
    assert.equal(state.posteditOutcomes['article-2']?.status, 'success-empty');

    state = reducer(state, clearPosteditOutcome('article-1'));

    assert.equal(state.posteditOutcomes['article-1'], undefined);
    assert.equal(state.posteditOutcomes['article-2']?.status, 'success-empty');
});

test('post-edit output data is owned by one segment and is cleared on owner change', () => {
    let state = reducer(
        undefined,
        setPosteditOutputs({
            itemId: 'article-1',
            memos: [{ id: 'reference-1' }],
            discourse: { overallScore: 0.8 },
            result: 'Article 1 rewrite',
        })
    );

    state = reducer(state, setPosteditOutputs({ itemId: 'article-2', memos: [] }));

    assert.equal(state.posteditItemId, 'article-2');
    assert.deepEqual(state.posteditMemos, []);
    assert.equal(state.posteditDiscourse, undefined);
    assert.equal(state.posteditResult, undefined);

    state = reducer(state, setPosteditOutputs(undefined));
    assert.equal(state.posteditItemId, undefined);
    assert.equal(state.posteditMemos, undefined);
});
