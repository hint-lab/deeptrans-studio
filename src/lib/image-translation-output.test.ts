import assert from 'node:assert/strict';
import test from 'node:test';

import { nonBlankImageTranslation } from './image-translation-output';

test('accepts a non-blank image translation without altering its formatting', () => {
    assert.equal(nonBlankImageTranslation('Line one\nLine two'), 'Line one\nLine two');
});

test('rejects blank and non-text image translation outputs', () => {
    assert.equal(nonBlankImageTranslation('   \n\t '), null);
    assert.equal(nonBlankImageTranslation(undefined), null);
    assert.equal(nonBlankImageTranslation({ text: 'translation' }), null);
});
