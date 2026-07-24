import assert from 'node:assert/strict';
import test from 'node:test';
import {
    limitSegmentPreview,
    normalizeSegmentGranularity,
    segmentPreviewActiveGranularityKey,
    segmentPreviewBatchId,
    segmentPreviewGenerationKey,
    segmentStructuredParagraphs,
    sentencesPerSegment,
    splitSentences,
} from './document-segmentation';

test('normalizes segmentation profiles and defaults to balanced', () => {
    assert.equal(normalizeSegmentGranularity(undefined), 'balanced');
    assert.equal(normalizeSegmentGranularity('FINE'), 'fine');
    assert.equal(normalizeSegmentGranularity('unknown'), 'balanced');
    assert.equal(sentencesPerSegment('fine'), 1);
    assert.equal(sentencesPerSegment('balanced'), 2);
    assert.equal(sentencesPerSegment('coarse'), 4);
});

test('recognizes both Chinese and English sentence boundaries', () => {
    assert.deepEqual(splitSentences('第一句。第二句！第三句？'), [
        '第一句。',
        '第二句！',
        '第三句？',
    ]);
    assert.deepEqual(splitSentences('First sentence. Second sentence! Third sentence?'), [
        'First sentence.',
        'Second sentence!',
        'Third sentence?',
    ]);
});

test('three profiles group sentences without crossing paragraph boundaries', () => {
    const paragraphs = [
        { text: 'One. Two. Three. Four.', styleName: 'Normal' },
        { text: 'Five. Six.', styleName: 'Normal' },
    ];

    const fine = segmentStructuredParagraphs(paragraphs, 'fine');
    const balanced = segmentStructuredParagraphs(paragraphs, 'balanced');
    const coarse = segmentStructuredParagraphs(paragraphs, 'coarse');

    assert.equal(fine.length, 6);
    assert.equal(balanced.length, 3);
    assert.equal(coarse.length, 2);
    assert.equal(coarse[0]?.sourceText, 'One. Two. Three. Four.');
    assert.equal(coarse[1]?.sourceText, 'Five. Six.');
    assert.equal(
        fine.map(segment => segment.sourceText).join(' '),
        'One. Two. Three. Four. Five. Six.'
    );
});

test('headings and list items remain whole at every profile', () => {
    const paragraphs = [
        { text: 'Heading. Still heading.', level: 1, styleName: 'Heading 1' },
        { text: 'List item. More detail.', styleName: 'List Paragraph' },
    ];

    for (const profile of ['fine', 'balanced', 'coarse'] as const) {
        const segments = segmentStructuredParagraphs(paragraphs, profile);
        assert.deepEqual(
            segments.map(segment => segment.sourceText),
            ['Heading. Still heading.', 'List item. More detail.']
        );
    }
});

test('a long sentence is not cut by an arbitrary character limit', () => {
    const sentence = `${'a very long clause '.repeat(80)}.`;
    const segments = segmentStructuredParagraphs([{ text: sentence, styleName: 'Normal' }], 'fine');
    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.sourceText, sentence.trim());
});

test('preview cache scopes are isolated by granularity', () => {
    const scopedBatchId = 'project-1:batch-1';
    assert.equal(segmentPreviewBatchId(scopedBatchId, 'fine'), 'preview:project-1:batch-1:fine');
    assert.equal(
        segmentPreviewBatchId(scopedBatchId, 'balanced'),
        'preview:project-1:batch-1:balanced'
    );
    assert.notEqual(
        segmentPreviewBatchId(scopedBatchId, 'fine'),
        segmentPreviewBatchId(scopedBatchId, 'coarse')
    );
    assert.equal(
        segmentPreviewActiveGranularityKey(scopedBatchId),
        'seg.preview:project-1:batch-1.activeGranularity'
    );
    assert.equal(
        segmentPreviewGenerationKey(scopedBatchId),
        'seg.preview:project-1:batch-1.generation'
    );
});

test('preview limiting preserves the full segment count', () => {
    const all = [
        { index: -1, type: 'TITLE' },
        ...Array.from({ length: 27 }, (_, index) => ({ index, type: 'PARAGRAPH' })),
    ];
    const limited = limitSegmentPreview(all, false);
    assert.equal(limited.totalCount, 28);
    assert.equal(limited.bodyCount, 27);
    assert.equal(limited.segments?.length, 20);

    const full = limitSegmentPreview(all, true);
    assert.equal(full.totalCount, 28);
    assert.equal(full.bodyCount, 27);
    assert.equal(full.segments?.length, 28);
    assert.equal(full.segments, all);
});
