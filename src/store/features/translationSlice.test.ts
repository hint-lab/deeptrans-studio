import assert from 'node:assert/strict';
import test from 'node:test';
import reducer, {
    clearTranslationContent,
    setTranslationContent,
    setSourceText,
    setTargetText,
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
    assert.equal(state.persistedSourceText, 'Article 2 source');
    assert.equal(state.targetText, 'Article 2 target');
    assert.equal(state.persistedTargetText, 'Article 2 target');
});

test('keeps an unsaved target draft separate from its persisted snapshot', () => {
    let state = reducer(
        undefined,
        setTranslationContent({
            itemId: 'article-1',
            sourceText: 'Article 1 source',
            targetText: 'Saved target',
        })
    );
    state = reducer(state, setTargetText('Unsaved target draft'));

    assert.equal(state.targetText, 'Unsaved target draft');
    assert.equal(state.persistedTargetText, 'Saved target');
});

test('keeps an unsaved source draft separate from its persisted snapshot', () => {
    let state = reducer(
        undefined,
        setTranslationContent({
            itemId: 'article-1',
            sourceText: 'Saved source',
            targetText: 'Saved target',
        })
    );
    state = reducer(state, setSourceText('Unsaved source draft'));

    assert.equal(state.sourceText, 'Unsaved source draft');
    assert.equal(state.persistedSourceText, 'Saved source');
});

test('clearing content invalidates its document owner before another load', () => {
    let state = reducer(
        undefined,
        setTranslationContent({ itemId: 'article-1', sourceText: 'Article 1 source' })
    );
    state = reducer(state, clearTranslationContent());

    assert.equal(state.contentItemId, '');
    assert.equal(state.sourceText, '');
    assert.equal(state.persistedSourceText, '');
    assert.equal(state.targetText, '');
    assert.equal(state.persistedTargetText, '');
});
