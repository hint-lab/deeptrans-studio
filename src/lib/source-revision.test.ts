import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceRevision } from './source-revision';

test('source revisions are stable for identical text and change with the segment', () => {
    assert.equal(sourceRevision('Article 1'), sourceRevision('Article 1'));
    assert.notEqual(sourceRevision('Article 1'), sourceRevision('Article 2'));
});
