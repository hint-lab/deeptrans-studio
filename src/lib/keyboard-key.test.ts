import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeKeyboardKey } from './keyboard-key';

test('normalizeKeyboardKey normalizes string keys', () => {
    assert.equal(normalizeKeyboardKey('K'), 'k');
    assert.equal(normalizeKeyboardKey('Escape'), 'escape');
    assert.equal(normalizeKeyboardKey('/'), '/');
});

test('normalizeKeyboardKey safely ignores missing or invalid keys', () => {
    assert.equal(normalizeKeyboardKey(undefined), '');
    assert.equal(normalizeKeyboardKey(null), '');
    assert.equal(normalizeKeyboardKey({}), '');
});
