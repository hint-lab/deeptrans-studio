import assert from 'node:assert/strict';
import test from 'node:test';
import {
    materializeSegmentationPlan,
    segmentationAtomsFingerprint,
    segmentationAtomsFingerprintPayload,
    SegmentationPlanValidationException,
    type SegmentationAtom,
    validateSegmentationPlan,
} from './document-segmentation-plan';

const atoms: SegmentationAtom[] = [
    {
        id: 'article-1:s1',
        hardBoundaryId: 'article-1',
        sourceText: '第一条 为了保障适龄儿童接受学前教育。',
        type: 'ARTICLE',
    },
    {
        id: 'article-1:s2',
        hardBoundaryId: 'article-1',
        sourceText: '规范学前教育实施。',
        type: 'ARTICLE',
    },
    {
        id: 'article-2:s1',
        hardBoundaryId: 'article-2',
        sourceText: '第二条 在中华人民共和国境内实施学前教育。',
        type: 'ARTICLE',
    },
];

test('accepts the cut-only LLM contract and materializes lossless source text', () => {
    const plan = { cutAfterIds: ['article-1:s2', 'article-2:s1'] };
    const validation = validateSegmentationPlan(plan, atoms);
    assert.equal(validation.ok, true);
    if (!validation.ok) return;
    assert.deepEqual(validation.value.cutAfterIndexes, [1, 2]);

    const segments = materializeSegmentationPlan(atoms, plan);
    assert.deepEqual(
        segments.map(segment => ({
            hardBoundaryId: segment.hardBoundaryId,
            atomIds: segment.atomIds,
            sourceText: segment.sourceText,
        })),
        [
            {
                hardBoundaryId: 'article-1',
                atomIds: ['article-1:s1', 'article-1:s2'],
                sourceText: '第一条 为了保障适龄儿童接受学前教育。规范学前教育实施。',
            },
            {
                hardBoundaryId: 'article-2',
                atomIds: ['article-2:s1'],
                sourceText: '第二条 在中华人民共和国境内实施学前教育。',
            },
        ]
    );
});

test('preserves all original whitespace while splitting at a requested atom boundary', () => {
    const spacedAtoms: SegmentationAtom[] = [
        { id: 'p:1', hardBoundaryId: 'p', sourceText: 'One. ' },
        { id: 'p:2', hardBoundaryId: 'p', sourceText: 'Two.\n' },
        { id: 'p:3', hardBoundaryId: 'p', sourceText: 'Three.' },
    ];
    const segments = materializeSegmentationPlan(spacedAtoms, {
        cutAfterIds: ['p:2', 'p:3'],
    });
    assert.deepEqual(
        segments.map(segment => segment.sourceText),
        ['One. Two.\n', 'Three.']
    );
    assert.equal(segments.map(segment => segment.sourceText).join(''), 'One. Two.\nThree.');
});

test('rejects an LLM response that tries to return source text or another unexpected key', () => {
    const validation = validateSegmentationPlan(
        {
            cutAfterIds: ['article-1:s2', 'article-2:s1'],
            sourceText: 'fabricated replacement text',
        },
        atoms
    );
    assert.deepEqual(validation, {
        ok: false,
        error: {
            code: 'unexpected-plan-key',
            message: 'The segmentation plan may contain only the cutAfterIds field; source text is not accepted.',
        },
    });
});

test('rejects duplicate, unknown, and out-of-order cut ids', () => {
    const duplicate = validateSegmentationPlan(
        { cutAfterIds: ['article-1:s1', 'article-1:s1', 'article-1:s2', 'article-2:s1'] },
        atoms
    );
    const unknown = validateSegmentationPlan({ cutAfterIds: ['not-an-atom'] }, atoms);
    const outOfOrder = validateSegmentationPlan(
        { cutAfterIds: ['article-2:s1', 'article-1:s2'] },
        atoms
    );

    assert.equal(duplicate.ok ? undefined : duplicate.error.code, 'duplicate-cut-id');
    assert.equal(unknown.ok ? undefined : unknown.error.code, 'unknown-cut-id');
    assert.equal(outOfOrder.ok ? undefined : outOfOrder.error.code, 'out-of-order-cut-id');
});

test('requires a cut after every hard structural boundary', () => {
    const validation = validateSegmentationPlan({ cutAfterIds: ['article-1:s1'] }, atoms);
    assert.equal(validation.ok, false);
    if (validation.ok) return;
    assert.equal(validation.error.code, 'missing-hard-boundary-cut');
});

test('rejects non-contiguous hard-boundary atom runs before materialization', () => {
    const malformedAtoms: SegmentationAtom[] = [
        { id: 'a:1', hardBoundaryId: 'a', sourceText: 'A1' },
        { id: 'b:1', hardBoundaryId: 'b', sourceText: 'B1' },
        { id: 'a:2', hardBoundaryId: 'a', sourceText: 'A2' },
    ];
    const validation = validateSegmentationPlan(
        { cutAfterIds: ['a:1', 'b:1', 'a:2'] },
        malformedAtoms
    );
    assert.equal(validation.ok, false);
    if (validation.ok) return;
    assert.equal(validation.error.code, 'non-contiguous-hard-boundary');
});

test('materialization throws a typed error for a malformed plan so a caller can fall back safely', () => {
    assert.throws(
        () => materializeSegmentationPlan(atoms, { cutAfterIds: ['article-1:s2'] }),
        (error: unknown) =>
            error instanceof SegmentationPlanValidationException &&
            error.code === 'missing-hard-boundary-cut'
    );
});

test('atom fingerprints change when the source split contract changes and remain stable otherwise', () => {
    const first = segmentationAtomsFingerprint(atoms);
    assert.equal(first, segmentationAtomsFingerprint(atoms));
    assert.match(first, /^seg-atoms-v1-[a-f0-9]{16}$/);
    assert.notEqual(
        first,
        segmentationAtomsFingerprint([
            ...atoms.slice(0, 2),
            { ...atoms[2]!, hardBoundaryId: 'article-1' },
        ])
    );
    assert.match(segmentationAtomsFingerprintPayload(atoms), /article-1:s1/);
});
