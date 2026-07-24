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

export type StructuredSegment = {
    type: string;
    sourceText: string;
    metadata?: Record<string, unknown>;
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
            return 4;
        default:
            return 2;
    }
}

function paragraphType(paragraph: StructuredParagraph): string {
    const level = Number(paragraph.level || 0);
    if (level >= 1 && level <= 6) return `HEADING-${level}`;
    return paragraph.styleName ? String(paragraph.styleName).toUpperCase() : 'PARAGRAPH';
}

function isStructuralBoundary(paragraph: StructuredParagraph): boolean {
    const level = Number(paragraph.level || 0);
    if (level >= 1 && level <= 6) return true;
    return /heading|title|list|bullet|number|标题|列表|项目符号/i.test(
        String(paragraph.styleName || '')
    );
}

function joinText(left: string, right: string): string {
    if (!left) return right;
    if (!right) return left;
    const needsSpace = /[A-Za-z0-9,.!?;:]$/.test(left) && /^[A-Za-z0-9]/.test(right);
    return `${left}${needsSpace ? ' ' : ''}${right}`;
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

function metadataFor(
    paragraph: StructuredParagraph,
    sourceText: string,
    granularity: SegmentGranularity,
    partIndex: number,
    partTotal: number
): Record<string, unknown> {
    const unchanged = String(paragraph.text || '').trim() === sourceText && partTotal === 1;
    if (unchanged) {
        return {
            level: paragraph.level ?? null,
            styleName: paragraph.styleName,
            runs: paragraph.runs,
            placeholderSpans: paragraph.placeholderSpans,
            segmentGranularity: granularity,
        };
    }

    return {
        level: paragraph.level ?? null,
        styleName: paragraph.styleName,
        placeholderSpans: buildSentencePlaceholders(sourceText),
        sourceParagraphCount: 1,
        segmentPart: { index: partIndex, total: partTotal },
        segmentGranularity: granularity,
    };
}

/**
 * Groups sentences inside each parsed paragraph. It never crosses paragraph,
 * heading, or list-item boundaries, so changing the preview granularity cannot
 * reorder content or merge structural blocks.
 */
export function segmentStructuredParagraphs(
    input: StructuredParagraph[],
    granularityInput: unknown = DEFAULT_SEGMENT_GRANULARITY
): StructuredSegment[] {
    const granularity = normalizeSegmentGranularity(granularityInput);
    const groupSize = sentencesPerSegment(granularity);
    const output: StructuredSegment[] = [];

    for (const paragraph of input || []) {
        const raw = String(paragraph?.text || '').trim();
        if (!raw) continue;

        const sentences = isStructuralBoundary(paragraph) ? [raw] : splitSentences(raw);
        const groups: string[] = [];
        for (let index = 0; index < sentences.length; index += groupSize) {
            const group = sentences
                .slice(index, index + groupSize)
                .reduce((text, sentence) => joinText(text, sentence), '');
            if (group) groups.push(group);
        }

        const safeGroups = groups.length ? groups : [raw];
        safeGroups.forEach((sourceText, index) => {
            output.push({
                type: paragraphType(paragraph),
                sourceText,
                metadata: metadataFor(
                    paragraph,
                    sourceText,
                    granularity,
                    index + 1,
                    safeGroups.length
                ),
            });
        });
    }

    return output;
}
