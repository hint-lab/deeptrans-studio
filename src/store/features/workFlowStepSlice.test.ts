import assert from 'node:assert/strict';
import test from 'node:test';
import reducer, { setPreOutputs } from './workFlowStepSlice';

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
