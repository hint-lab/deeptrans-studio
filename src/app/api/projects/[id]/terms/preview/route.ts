import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { extractTextFromUrl } from '@/lib/file-parser';
import { guardMessage, guardStatus, requireOwnedProject, requireUser } from '@/lib/guards';
import { readInitStructuredRaw, scopedProjectBatchId } from '@/lib/init-artifact-keys';
import { buildStatCandidates } from '@/lib/terms/termStats';
import { getReadableDocumentSourceUrlForOwner } from '@/server/uploaded-object';

export async function POST(req: NextRequest, context: any) {
    try {
        const { batchId, maxTerms, chunkSize, overlap } = (await req.json()) as {
            batchId?: string;
            maxTerms?: number;
            chunkSize?: number;
            overlap?: number;
        };
        const redis = await getRedis();
        let text = '';
        const { id: projectId } = await (context?.params || {});
        const authCtx = await requireUser();
        const project = await requireOwnedProject(projectId, authCtx);
        if (batchId) {
            const scopedBatchId = scopedProjectBatchId(projectId, batchId);
            const structuredRaw = await readInitStructuredRaw(redis, scopedBatchId);
            try {
                const structured = structuredRaw ? JSON.parse(String(structuredRaw)) : null;
                if (Array.isArray(structured?.paragraphs)) {
                    text = structured.paragraphs
                        .map((paragraph: any) => String(paragraph?.text || '').trim())
                        .filter(Boolean)
                        .join('\n\n');
                }
            } catch {
                text = '';
            }
        }
        if (!text) {
            const only = project.documents?.[0];
            if (only?.name) {
                const sourceUrl = await getReadableDocumentSourceUrlForOwner(only.name, authCtx);
                const { text: full } = await extractTextFromUrl(sourceUrl);
                text = String(full || '').trim();
            }
        }
        if (!text) return NextResponse.json({ terms: [] });
        const limit = Math.max(10, Math.min(200, Number(maxTerms || 120)));
        const normalizedChunkSize = Math.max(1000, Math.min(12000, Number(chunkSize || 8000)));
        const normalizedOverlap = Math.max(
            0,
            Math.min(Math.floor(normalizedChunkSize / 4), Number(overlap || 300))
        );
        const terms = buildStatCandidates(
            text,
            normalizedChunkSize,
            normalizedOverlap,
            Math.max(limit, limit * 5)
        ).slice(0, limit);
        return NextResponse.json({
            terms,
            previewMode: 'local-statistical',
            sourceCharacters: text.length,
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: guardMessage(e) || 'preview failed' },
            { status: guardStatus(e) }
        );
    }
}
