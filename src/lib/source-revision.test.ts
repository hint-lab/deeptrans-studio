import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceRevision, withSourceRevisions } from './source-revision';

test('source revisions are stable for identical text and change with the segment', () => {
    assert.equal(sourceRevision('Article 1'), sourceRevision('Article 1'));
    assert.notEqual(sourceRevision('Article 1'), sourceRevision('Article 2'));
});

test('target-only saves preserve pre-translation provenance', () => {
    const metadata = withSourceRevisions(
        { preTranslateSourceRevision: 'existing-pre-revision' },
        'Article 2',
        { target: true }
    );

    assert.equal(metadata.preTranslateSourceRevision, 'existing-pre-revision');
    assert.equal(metadata.targetSourceRevision, sourceRevision('Article 2'));
});

test('fresh pre-translation saves stamp both candidate and applied target revisions', () => {
    const metadata = withSourceRevisions({}, 'Article 2', {
        preTranslate: true,
        target: true,
    });

    assert.equal(metadata.preTranslateSourceRevision, sourceRevision('Article 2'));
    assert.equal(metadata.targetSourceRevision, sourceRevision('Article 2'));
});
