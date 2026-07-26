import { buildSentencePlaceholders } from '@/lib/placeholder';

export const SEGMENT_GRANULARITIES = ['fine', 'balanced', 'coarse'] as const;
export type SegmentGranularity = (typeof SEGMENT_GRANULARITIES)[number];
export const DEFAULT_SEGMENT_GRANULARITY: SegmentGranularity = 'balanced';
export const SEGMENT_PREVIEW_LIMIT = 20;

export type StructuredParagraph = {
    text?: string;
    level?: number | null;
    styleName?: string;
    runs?: unknown[];
    placeholderSpans?: unknown[];
};

export type SegmentStructureKind =
    | 'heading'
    | 'chapter'
    | 'article'
    | 'clause'
    | 'list_item'
    | 'table_row'
    | 'paragraph';

type ClassifiedParagraph = {
    paragraph: StructuredParagraph;
    sourceText: string;
    type: string;
    kind: SegmentStructureKind;
    level: number | null;
    keepWhole: boolean;
};

export type StructuredSegment = {
    type: string;
    sourceText: string;
    metadata?: Record<string, unknown>;
};

/**
 * A source-owned structural unit prepared for semantic planning.  The model
 * sees only the stable sentence identifiers and their source text; it never
 * receives authority to return replacement text.
 */
export type SemanticSegmentationBlock = {
    id: string;
    sourceParagraphIndex: number;
    type: string;
    sourceText: string;
    structure: {
        kind: SegmentStructureKind;
        level: number | null;
        boundary: true;
    };
    sentences: Array<{ id: string; sourceText: string }>;
    paragraph: StructuredParagraph;
};

export function normalizeSegmentGranularity(value: unknown): SegmentGranularity {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    return SEGMENT_GRANULARITIES.includes(normalized as SegmentGranularity)
        ? (normalized as SegmentGranularity)
        : DEFAULT_SEGMENT_GRANULARITY;
}

export function segmentPreviewBatchId(
    scopedBatchId: string,
    granularityInput: unknown
): string {
    return `preview:${String(scopedBatchId || '')}:${normalizeSegmentGranularity(granularityInput)}`;
}

export function segmentPreviewActiveGranularityKey(scopedBatchId: string): string {
    return `seg.preview:${String(scopedBatchId || '')}.activeGranularity`;
}

export function segmentPreviewGenerationKey(scopedBatchId: string): string {
    return `seg.preview:${String(scopedBatchId || '')}.generation`;
}

export function limitSegmentPreview<T extends { type?: unknown }>(
    segments: T[] | undefined,
    showAll: boolean,
    limit = SEGMENT_PREVIEW_LIMIT
): { segments: T[] | undefined; totalCount: number; bodyCount: number } {
    if (!Array.isArray(segments)) {
        return { segments: undefined, totalCount: 0, bodyCount: 0 };
    }
    const totalCount = segments.length;
    const bodyCount = segments.filter(
        segment => String(segment?.type || '').toUpperCase() !== 'TITLE'
    ).length;
    const safeLimit = Math.max(1, Math.floor(Number(limit) || SEGMENT_PREVIEW_LIMIT));
    return {
        segments: showAll ? segments : segments.slice(0, safeLimit),
        totalCount,
        bodyCount,
    };
}

export function sentencesPerSegment(granularity: unknown): number {
    switch (normalizeSegmentGranularity(granularity)) {
        case 'fine':
            return 1;
        case 'coarse':
            // Coarse means “keep the document structure”, not “join four
            // sentences”.  The parent paragraph/article remains the unit.
            return Number.MAX_SAFE_INTEGER;
        default:
            return 2;
    }
}

const CHINESE_ORDINAL = '[〇零一二三四五六七八九十百千万两0-9０-９]+';
const CHINESE_CHAPTER_RE = new RegExp(`^第${CHINESE_ORDINAL}(?:编|章|节|目)`);
const CHINESE_ARTICLE_RE = new RegExp(`^第${CHINESE_ORDINAL}条(?:之${CHINESE_ORDINAL})?`);
const CHINESE_CLAUSE_RE = new RegExp(
    `^(?:第${CHINESE_ORDINAL}款|[（(][〇零一二三四五六七八九十百千万两0-9０-９]+[）)]|[一二三四五六七八九十]+[、．.])`
);
const ENGLISH_HEADING_RE = /^(?:chapter|section|article)\s+[\divxlcdm]+\b/i;
const ORDERED_LIST_RE = /^(?:[-*+]|\d+[.)]|[A-Za-z][.)])\s+/;
const MARKDOWN_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function styleLooksLikeList(styleName: unknown): boolean {
    return /list|bullet|number|列表|项目符号/i.test(String(styleName || ''));
}

function styleLooksLikeHeading(styleName: unknown): boolean {
    return /heading|title|标题/i.test(String(styleName || ''));
}

function isTableRow(text: string): boolean {
    return /^\|.+\|\s*$/.test(text) || /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(text);
}

function structuralKindFor(paragraph: StructuredParagraph, text: string): SegmentStructureKind {
    const level = Number(paragraph.level || 0);
    if (CHINESE_CHAPTER_RE.test(text) || /^(?:chapter|part)\s+/i.test(text)) return 'chapter';
    if (CHINESE_ARTICLE_RE.test(text) || /^article\s+/i.test(text)) return 'article';
    if (CHINESE_CLAUSE_RE.test(text)) return 'clause';
    if (styleLooksLikeList(paragraph.styleName) || ORDERED_LIST_RE.test(text)) return 'list_item';
    if (isTableRow(text)) return 'table_row';
    if (ENGLISH_HEADING_RE.test(text)) return 'heading';
    if ((level >= 1 && level <= 6) || styleLooksLikeHeading(paragraph.styleName)) return 'heading';
    return 'paragraph';
}

function typeFor(kind: SegmentStructureKind, level: number | null): string {
    if (kind === 'heading') return `HEADING-${Math.max(1, Math.min(6, Number(level || 1)))}`;
    if (kind === 'chapter') return 'CHAPTER';
    if (kind === 'article') return 'ARTICLE';
    if (kind === 'clause') return 'CLAUSE';
    if (kind === 'list_item') return 'LIST_ITEM';
    if (kind === 'table_row') return 'TABLE_ROW';
    return 'PARAGRAPH';
}

function classifyParagraph(paragraph: StructuredParagraph): ClassifiedParagraph | null {
    const raw = String(paragraph?.text || '').trim();
    if (!raw) return null;

    const markdownHeading = raw.match(MARKDOWN_HEADING_RE);
    const sourceText = String(markdownHeading?.[2] || raw).trim();
    if (!sourceText) return null;

    const markdownLevel = markdownHeading?.[1]?.length;
    const level = markdownLevel || Number(paragraph.level || 0) || null;
    const normalizedParagraph =
        level === paragraph.level ? paragraph : { ...paragraph, level };
    const inferredKind = structuralKindFor(normalizedParagraph, sourceText);
    // Markdown heading markers carry presentation level, but legal headings
    // such as "## 第一章" and "### 第三条" still retain their stronger
    // document semantics for the segmentation boundary and preview label.
    const kind = markdownHeading && inferredKind === 'paragraph' ? 'heading' : inferredKind;
    const type = typeFor(kind, level);

    return {
        paragraph: normalizedParagraph,
        sourceText,
        type,
        kind,
        level,
        // Headers, list items and tables are display/formatting units. They
        // must remain intact even in sentence-level review.
        keepWhole: kind === 'heading' || kind === 'list_item' || kind === 'table_row',
    };
}

function isStructuralLineStart(text: string): boolean {
    const candidate = String(text || '').trim();
    return Boolean(
        candidate.match(MARKDOWN_HEADING_RE) ||
            CHINESE_CHAPTER_RE.test(candidate) ||
            CHINESE_ARTICLE_RE.test(candidate) ||
            CHINESE_CLAUSE_RE.test(candidate) ||
            ORDERED_LIST_RE.test(candidate) ||
            isTableRow(candidate)
    );
}

/**
 * MinerU/PDF output occasionally places several Markdown or legal units in a
 * single parsed paragraph. Split only when a later line clearly begins a new
 * structural unit; ordinary visual line wraps remain part of the same text.
 */
function expandEmbeddedStructuralLines(paragraph: StructuredParagraph): StructuredParagraph[] {
    const raw = String(paragraph?.text || '').replace(/\r\n?/g, '\n').trim();
    const lines = raw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length < 2 || !lines.slice(1).some(isStructuralLineStart)) return [paragraph];

    const expanded: StructuredParagraph[] = [];
    let current: string[] = [];
    for (const line of lines) {
        if (current.length && isStructuralLineStart(line)) {
            expanded.push({ ...paragraph, text: current.join('\n') });
            current = [line];
        } else {
            current.push(line);
        }
    }
    if (current.length) expanded.push({ ...paragraph, text: current.join('\n') });
    return expanded;
}

export function splitSentences(text: string): string[] {
    const raw = String(text || '').trim();
    if (!raw) return [];

    try {
        const Segmenter = (Intl as any).Segmenter;
        if (typeof Segmenter === 'function') {
            const segments = Array.from(
                new Segmenter(undefined, { granularity: 'sentence' }).segment(raw),
                (item: any) => String(item?.segment || '').trim()
            ).filter(Boolean);
            if (segments.length) return segments;
        }
    } catch {
        // Fall through to the punctuation-based splitter for older runtimes.
    }

    return (
        raw
            .match(/[^。！？!?；;.\n]+(?:[。！？!?；;.]+|$)/g)
            ?.map(item => item.trim())
            .filter(Boolean) || [raw]
    );
}

/**
 * Same sentence boundaries as `splitSentences`, but preserves the parser's
 * original whitespace in every atom. This is the source-of-truth splitter for
 * model plans: the materialiser concatenates these strings rather than asking
 * the model to reproduce text.
 */
function splitSentenceAtoms(text: string): string[] {
    const raw = String(text || '').trim();
    if (!raw) return [];

    try {
        const Segmenter = (Intl as any).Segmenter;
        if (typeof Segmenter === 'function') {
            const segments = Array.from(
                new Segmenter(undefined, { granularity: 'sentence' }).segment(raw),
                (item: any) => String(item?.segment || '')
            ).filter(item => item.trim().length > 0);
            if (segments.length) return segments;
        }
    } catch {
        // Fall through to the conservative punctuation fallback below.
    }

    return raw.match(/\s*[^。！？!?；;.\n]+(?:[。！？!?；;.]+|$)/g)?.filter(Boolean) || [raw];
}

/**
 * Turn parsed paragraphs into immutable model-planning blocks. A block is a
 * hard document boundary: the planner may split sentences *inside* it but can
 * never combine it with the next title, article, clause, list item, table row,
 * or source paragraph.
 */
export function buildSemanticSegmentationBlocks(
    input: StructuredParagraph[]
): SemanticSegmentationBlock[] {
    const blocks: SemanticSegmentationBlock[] = [];

    for (
        let sourceParagraphIndex = 0;
        sourceParagraphIndex < (input || []).length;
        sourceParagraphIndex += 1
    ) {
        const sourceParagraph = input[sourceParagraphIndex]!;
        const expanded = expandEmbeddedStructuralLines(sourceParagraph);
        for (let unitIndex = 0; unitIndex < expanded.length; unitIndex += 1) {
            const paragraph = expanded[unitIndex]!;
            const classified = classifyParagraph(paragraph);
            if (!classified) continue;
            const id = `p${sourceParagraphIndex + 1}-u${unitIndex + 1}`;
            const sentenceTexts = classified.keepWhole
                ? [classified.sourceText]
                : splitSentenceAtoms(classified.sourceText);
            const safeSentenceTexts = sentenceTexts.length ? sentenceTexts : [classified.sourceText];
            blocks.push({
                id,
                sourceParagraphIndex,
                type: classified.type,
                sourceText: classified.sourceText,
                structure: {
                    kind: classified.kind,
                    level: classified.level,
                    boundary: true,
                },
                sentences: safeSentenceTexts.map((sourceText, sentenceIndex) => ({
                    id: `${id}:s${sentenceIndex + 1}`,
                    sourceText,
                })),
                paragraph: classified.paragraph,
            });
        }
    }

    return blocks;
}

export function fallbackSemanticCutAfterIds(
    blocks: SemanticSegmentationBlock[],
    granularityInput: unknown = DEFAULT_SEGMENT_GRANULARITY
): string[] {
    const groupSize = sentencesPerSegment(granularityInput);
    const cutAfterIds: string[] = [];
    for (const block of blocks) {
        for (
            let sentenceIndex = groupSize - 1;
            sentenceIndex < block.sentences.length;
            sentenceIndex += groupSize
        ) {
            const sentence = block.sentences[sentenceIndex];
            if (sentence) cutAfterIds.push(sentence.id);
        }
        const terminal = block.sentences[block.sentences.length - 1];
        if (terminal && cutAfterIds[cutAfterIds.length - 1] !== terminal.id) {
            cutAfterIds.push(terminal.id);
        }
    }
    return cutAfterIds;
}

export type SegmentationPlannerProvenance = {
    engine: 'llm' | 'mixed' | 'structure-fallback';
    promptVersion?: number;
    planId?: string;
    /**
     * The overall plan can be mixed, but each source-owned structural block
     * still records the engine that produced its boundaries. This keeps a
     * deterministic fallback visible in persisted document-item metadata.
     */
    blockEngines?: Readonly<Record<string, 'llm' | 'structure-fallback'>>;
};

function engineForBlock(
    block: SemanticSegmentationBlock,
    provenance?: SegmentationPlannerProvenance
): 'llm' | 'mixed' | 'structure-fallback' {
    return provenance?.blockEngines?.[block.id] || provenance?.engine || 'structure-fallback';
}

function metadataForBlock(
    block: SemanticSegmentationBlock,
    sourceText: string,
    granularity: SegmentGranularity,
    partIndex: number,
    partTotal: number,
    provenance?: SegmentationPlannerProvenance
): Record<string, unknown> {
    const { paragraph } = block;
    const { kind, level } = block.structure;
    const engine = engineForBlock(block, provenance);
    const unchanged = String(paragraph.text || '').trim() === sourceText && partTotal === 1;
    const structuralMetadata = {
        kind,
        level,
        boundary: true,
    };
    if (unchanged) {
        return {
            level,
            styleName: paragraph.styleName,
            runs: paragraph.runs,
            placeholderSpans: paragraph.placeholderSpans,
            segmentGranularity: granularity,
            structure: structuralMetadata,
            segmentation: {
                engine,
                promptVersion: Number(provenance?.promptVersion || 0),
                ...(provenance?.planId ? { planId: provenance.planId } : {}),
                sourceBlockId: block.id,
            },
        };
    }

    return {
        level,
        styleName: paragraph.styleName,
        placeholderSpans: buildSentencePlaceholders(sourceText),
        sourceParagraphCount: 1,
        segmentPart: { index: partIndex, total: partTotal },
        segmentGranularity: granularity,
        structure: structuralMetadata,
        segmentation: {
            engine,
            promptVersion: Number(provenance?.promptVersion || 0),
            ...(provenance?.planId ? { planId: provenance.planId } : {}),
            sourceBlockId: block.id,
        },
    };
}

/**
 * Materialise a validated boundary plan using only provider-owned sentence
 * atoms. `cutAfterIds` may contain any sentence identifiers, but each block
 * is always ended locally, so the result cannot cross a structural boundary.
 */
export function materializeSemanticSegmentationBlocks(
    blocks: SemanticSegmentationBlock[],
    cutAfterIds: readonly string[],
    granularityInput: unknown = DEFAULT_SEGMENT_GRANULARITY,
    provenance?: SegmentationPlannerProvenance
): StructuredSegment[] {
    const granularity = normalizeSegmentGranularity(granularityInput);
    const selectedCuts = new Set(cutAfterIds);
    const output: StructuredSegment[] = [];

    for (const block of blocks) {
        const groups: string[] = [];
        let current = '';
        for (let sentenceIndex = 0; sentenceIndex < block.sentences.length; sentenceIndex += 1) {
            const sentence = block.sentences[sentenceIndex]!;
            current += sentence.sourceText;
            const terminal = sentenceIndex === block.sentences.length - 1;
            if (selectedCuts.has(sentence.id) || terminal) {
                if (current) groups.push(current);
                current = '';
            }
        }
        if (current) groups.push(current);
        const safeGroups = groups.length ? groups : [block.sourceText];
        safeGroups.forEach((sourceText, index) => {
            output.push({
                type: block.type,
                sourceText,
                metadata: metadataForBlock(
                    block,
                    sourceText,
                    granularity,
                    index + 1,
                    safeGroups.length,
                    provenance
                ),
            });
        });
    }

    return output;
}

/**
 * Groups sentences inside each parsed structural unit. It never crosses a
 * parsed paragraph, heading, chapter, article, clause, list item, or table
 * row, so a different profile cannot reorder or merge document structure.
 */
export function segmentStructuredParagraphs(
    input: StructuredParagraph[],
    granularityInput: unknown = DEFAULT_SEGMENT_GRANULARITY
): StructuredSegment[] {
    const granularity = normalizeSegmentGranularity(granularityInput);
    const blocks = buildSemanticSegmentationBlocks(input);
    return materializeSemanticSegmentationBlocks(
        blocks,
        fallbackSemanticCutAfterIds(blocks, granularity),
        granularity,
        { engine: 'structure-fallback' }
    );
}
