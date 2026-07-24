import assert from 'node:assert/strict';
import test from 'node:test';
import reducer, {
    clearTranslationContent,
    setTranslationContent,
} from './translationSlice';

test('translation content and its document owner update atomically', () => {
    const state = reducer(
        undefined,
        setTranslationContent({
            itemId: 'article-2',
            sourceText: 'Article 2 source',
            targetText: 'Article 2 target',
        })
    );

    assert.equal(state.contentItemId, 'article-2');
    assert.equal(state.sourceText, 'Article 2 source');
    assert.equal(state.targetText, 'Article 2 target');
});

test('clearing content invalidates its document owner before another load', () => {
    let state = reducer(
        undefined,
        setTranslationContent({ itemId: 'article-1', sourceText: 'Article 1 source' })
    );
    state = reducer(state, clearTranslationContent());

    assert.equal(state.contentItemId, '');
    assert.equal(state.sourceText, '');
    assert.equal(state.targetText, '');
});
