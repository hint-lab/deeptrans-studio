/**
 * The model-facing representation of a document split.  An atom is a
 * precomputed, immutable slice of source text (normally one sentence) that
 * already belongs to exactly one structural unit.  The model may choose where
 * a segment ends, but it never receives authority to return replacement text.
 */
export type SegmentationAtom = Readonly<{
    /** Stable within one segmentation request. */
    id: string;
    /** A title, article, clause, list item, table row, or source paragraph. */
    hardBoundaryId: string;
    /** Original source characters for this atom. Do not trim or normalise it. */
    sourceText: string;
    /** Carried through to materialised document items when useful. */
    type?: string;
    /** Provider-owned metadata. The plan utility never inspects or changes it. */
    metadata?: Record<string, unknown>;
}>;

/** The complete JSON shape accepted from an LLM. */
export type SegmentationPlan = Readonly<{
    cutAfterIds: readonly string[];
}>;

export type ValidatedSegmentationPlan = Readonly<{
    /** A defensive copy, in document order. */
    cutAfterIds: readonly string[];
    /** Atom indexes corresponding to `cutAfterIds`. */
    cutAfterIndexes: readonly number[];
}>;

export type MaterializedSegmentationSegment = Readonly<{
    /** Deterministic identity for this materialised source span. */
    id: string;
    hardBoundaryId: string;
    atomIds: readonly string[];
    /** Exact concatenation of the source atoms; the model never supplies it. */
    sourceText: string;
    type?: string;
    metadata?: Record<string, unknown>;
}>;

export type SegmentationPlanErrorCode =
    | 'invalid-atoms'
    | 'duplicate-atom-id'
    | 'non-contiguous-hard-boundary'
    | 'invalid-plan'
    | 'unexpected-plan-key'
    | 'invalid-cut-after-ids'
    | 'unknown-cut-id'
    | 'duplicate-cut-id'
    | 'out-of-order-cut-id'
    | 'missing-hard-boundary-cut';

export type SegmentationPlanValidationError = Readonly<{
    code: SegmentationPlanErrorCode;
    message: string;
}>;

export type SegmentationPlanValidationResult =
    | Readonly<{ ok: true; value: ValidatedSegmentationPlan }>
    | Readonly<{ ok: false; error: SegmentationPlanValidationError }>;

export class SegmentationPlanValidationException extends Error {
    readonly code: SegmentationPlanErrorCode;

    constructor(error: SegmentationPlanValidationError) {
        super(error.message);
        this.name = 'SegmentationPlanValidationException';
        this.code = error.code;
    }
}

function failure(
    code: SegmentationPlanErrorCode,
    message: string
): Readonly<{ ok: false; error: SegmentationPlanValidationError }> {
    return { ok: false, error: { code, message } };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

type AtomInspection = {
    indexById: Map<string, number>;
    hardBoundaryEndIds: Set<string>;
};

/**
 * Verify the provider's atoms before an LLM response is considered.  In
 * particular, a hard boundary must occupy one contiguous run.  A sequence
 * such as article-A, article-B, article-A cannot be represented safely by a
 * cut-only plan and is rejected instead of silently merging source spans.
 */
function inspectAtoms(atoms: readonly SegmentationAtom[]): AtomInspection | SegmentationPlanValidationError {
    if (!Array.isArray(atoms)) {
        return {
            code: 'invalid-atoms',
            message: 'Segmentation atoms must be an array.',
        };
    }

    const indexById = new Map<string, number>();
    const finishedBoundaries = new Set<string>();
    const hardBoundaryEndIds = new Set<string>();
    let currentBoundaryId: string | undefined;

    for (let index = 0; index < atoms.length; index += 1) {
        const atom = atoms[index];
        if (!atom || typeof atom !== 'object') {
            return {
                code: 'invalid-atoms',
                message: `Segmentation atom ${index} is invalid.`,
            };
        }

        const id = atom.id;
        const hardBoundaryId = atom.hardBoundaryId;
        if (!id || typeof id !== 'string' || !hardBoundaryId || typeof hardBoundaryId !== 'string') {
            return {
                code: 'invalid-atoms',
                message: `Segmentation atom ${index} needs non-empty string id and hardBoundaryId values.`,
            };
        }
        if (typeof atom.sourceText !== 'string' || atom.sourceText.length === 0) {
            return {
                code: 'invalid-atoms',
                message: `Segmentation atom ${index} needs non-empty sourceText.`,
            };
        }
        if (indexById.has(id)) {
            return {
                code: 'duplicate-atom-id',
                message: `Segmentation atom id "${id}" is duplicated.`,
            };
        }

        if (currentBoundaryId !== hardBoundaryId) {
            if (currentBoundaryId !== undefined) {
                finishedBoundaries.add(currentBoundaryId);
            }
            if (finishedBoundaries.has(hardBoundaryId)) {
                return {
                    code: 'non-contiguous-hard-boundary',
                    message: `Hard boundary "${hardBoundaryId}" is split into non-contiguous atom runs.`,
                };
            }
            currentBoundaryId = hardBoundaryId;
        }

        indexById.set(id, index);
        if (index > 0 && atoms[index - 1]?.hardBoundaryId !== hardBoundaryId) {
            hardBoundaryEndIds.add(atoms[index - 1]!.id);
        }
    }

    if (atoms.length) {
        hardBoundaryEndIds.add(atoms[atoms.length - 1]!.id);
    }

    return { indexById, hardBoundaryEndIds };
}

function isInspectionError(
    value: AtomInspection | SegmentationPlanValidationError
): value is SegmentationPlanValidationError {
    return 'code' in value;
}

/**
 * Validates an untrusted LLM response without ever accepting source text from
 * it.  `cutAfterIds` is intentionally the only allowed field.  The final atom
 * of every hard structural boundary must be present, which guarantees that a
 * materialised segment cannot cross a title/article/clause/list/table border.
 */
export function validateSegmentationPlan(
    input: unknown,
    atoms: readonly SegmentationAtom[]
): SegmentationPlanValidationResult {
    const inspection = inspectAtoms(atoms);
    if (isInspectionError(inspection)) return { ok: false, error: inspection };

    if (!isPlainRecord(input)) {
        return failure('invalid-plan', 'The segmentation plan must be a JSON object.');
    }

    const keys = Reflect.ownKeys(input);
    if (keys.length !== 1 || keys[0] !== 'cutAfterIds') {
        return failure(
            'unexpected-plan-key',
            'The segmentation plan may contain only the cutAfterIds field; source text is not accepted.'
        );
    }

    const cutAfterIds = input.cutAfterIds;
    if (!Array.isArray(cutAfterIds) || cutAfterIds.some(id => typeof id !== 'string' || !id)) {
        return failure('invalid-cut-after-ids', 'cutAfterIds must be an array of non-empty string atom ids.');
    }

    const seen = new Set<string>();
    const indexes: number[] = [];
    let previousIndex = -1;
    for (const id of cutAfterIds) {
        if (seen.has(id)) {
            return failure('duplicate-cut-id', `The cut atom id "${id}" appears more than once.`);
        }
        seen.add(id);

        const index = inspection.indexById.get(id);
        if (index === undefined) {
            return failure('unknown-cut-id', `The cut atom id "${id}" does not exist in this document.`);
        }
        if (index <= previousIndex) {
            return failure(
                'out-of-order-cut-id',
                'cutAfterIds must follow the source atom order without backtracking.'
            );
        }
        indexes.push(index);
        previousIndex = index;
    }

    for (const hardBoundaryEndId of inspection.hardBoundaryEndIds) {
        if (!seen.has(hardBoundaryEndId)) {
            return failure(
                'missing-hard-boundary-cut',
                `The final atom "${hardBoundaryEndId}" of a structural boundary is missing from cutAfterIds.`
            );
        }
    }

    return {
        ok: true,
        value: {
            cutAfterIds: [...cutAfterIds],
            cutAfterIndexes: indexes,
        },
    };
}

/**
 * Returns a deterministic, non-cryptographic fingerprint for cache keys and
 * provenance. It includes order, hard boundaries, text, type, and metadata is
 * deliberately excluded because it cannot affect materialised source text.
 * Do not use this fingerprint as a security primitive.
 */
export function segmentationAtomsFingerprint(atoms: readonly SegmentationAtom[]): string {
    const inspection = inspectAtoms(atoms);
    if (isInspectionError(inspection)) {
        throw new SegmentationPlanValidationException(inspection);
    }

    const payload = atoms
        .map(atom => [atom.id, atom.hardBoundaryId, atom.type || '', atom.sourceText].map(encode).join('|'))
        .join('\n');
    return `seg-atoms-v1-${fnv1a64(payload)}`;
}

/** Human-readable exact input behind `segmentationAtomsFingerprint`, useful in tests and diagnostics. */
export function segmentationAtomsFingerprintPayload(atoms: readonly SegmentationAtom[]): string {
    const inspection = inspectAtoms(atoms);
    if (isInspectionError(inspection)) {
        throw new SegmentationPlanValidationException(inspection);
    }
    return atoms
        .map(atom => [atom.id, atom.hardBoundaryId, atom.type || '', atom.sourceText].map(encode).join('|'))
        .join('\n');
}

function encode(value: string): string {
    return `${value.length}:${value}`;
}

function fnv1a64(value: string): string {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= BigInt(value.charCodeAt(index));
        hash = (hash * prime) & mask;
    }
    return hash.toString(16).padStart(16, '0');
}

/**
 * Materialises source segments from a validated cut-only plan. Source text is
 * concatenated exactly as supplied by the atom provider (no trim, reflow, or
 * model-generated text). This function throws on an invalid plan so callers
 * can safely fall back to a deterministic structural strategy.
 */
export function materializeSegmentationPlan(
    atoms: readonly SegmentationAtom[],
    input: unknown
): MaterializedSegmentationSegment[] {
    const validation = validateSegmentationPlan(input, atoms);
    if (!validation.ok) {
        throw new SegmentationPlanValidationException(validation.error);
    }

    const cutIndexes = new Set(validation.value.cutAfterIndexes);
    const segments: MaterializedSegmentationSegment[] = [];
    let currentAtoms: SegmentationAtom[] = [];
    let currentBoundaryId: string | undefined;

    const flush = () => {
        if (!currentAtoms.length || !currentBoundaryId) return;
        const first = currentAtoms[0]!;
        const last = currentAtoms[currentAtoms.length - 1]!;
        segments.push({
            id: `segment:${first.id}:${last.id}`,
            hardBoundaryId: currentBoundaryId,
            atomIds: currentAtoms.map(atom => atom.id),
            sourceText: currentAtoms.map(atom => atom.sourceText).join(''),
            type: first.type,
            metadata: first.metadata,
        });
        currentAtoms = [];
        currentBoundaryId = undefined;
    };

    for (let index = 0; index < atoms.length; index += 1) {
        const atom = atoms[index]!;
        if (currentBoundaryId !== undefined && atom.hardBoundaryId !== currentBoundaryId) {
            // Validation requires the previous atom to be a cut. This branch
            // remains a defensive guard if this helper is ever refactored.
            flush();
        }
        if (currentBoundaryId === undefined) currentBoundaryId = atom.hardBoundaryId;
        currentAtoms.push(atom);
        if (cutIndexes.has(index)) flush();
    }
    flush();

    return segments;
}
