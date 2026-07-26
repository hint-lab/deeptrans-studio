import assert from 'node:assert/strict';
import test from 'node:test';

import { getItemScopedValue } from './item-scoped-state';

test('returns a local result only for the segment that produced it', () => {
    const previousSegment = { itemId: 'segment-a', value: 'Previous segment baseline' };

    assert.equal(getItemScopedValue(previousSegment, 'segment-a'), 'Previous segment baseline');
    assert.equal(getItemScopedValue(previousSegment, 'segment-b'), undefined);
});

test('preserves an intentionally empty value for its own segment', () => {
    assert.equal(getItemScopedValue({ itemId: 'segment-a', value: '' }, 'segment-a'), '');
});
