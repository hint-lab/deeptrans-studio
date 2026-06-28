import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { extractMonolingualTermsAction } from '@/actions/pre-translate';
import { extractTextFromUrl } from '@/lib/file-parser';
import { guardMessage, guardStatus, requireOwnedProject } from '@/lib/guards';
import { scopedProjectBatchId } from '@/lib/init-artifact-keys';

export async function POST(req: NextRequest, context: any) {
    try {
        const { batchId, maxTerms, prompt } = (await req.json()) as {
            batchId?: string;
            maxTerms?: number;
            prompt?: string;
        };
        const redis = await getRedis();
        let text = '';
        const { id: projectId } = await (context?.params || {});
        const project = await requireOwnedProject(projectId);
        if (batchId) {
            const preview = await redis.get(`init.${scopedProjectBatchId(projectId, batchId)}.preview`);
            if (typeof preview === 'string' && preview.trim()) text = preview;
        }
        if (!text) {
            const only = project.documents?.[0];
            if (only?.url) {
                const { text: full } = await extractTextFromUrl(only.url);
                text = String(full || '').slice(0, 2000);
            }
        }
        if (!text) return NextResponse.json({ terms: [] });
        const limit = Math.max(10, Math.min(200, Number(maxTerms || 50)));
        const terms = await extractMonolingualTermsAction(text, { prompt });
        const uniq = new Map<string, { term: string; score?: number }>();
        for (const t of terms || []) {
            const k = String(t?.term || '').trim();
            if (!k) continue;
            if (!uniq.has(k))
                uniq.set(k, { term: k, score: typeof t?.score === 'number' ? t.score : undefined });
        }
        return NextResponse.json({ terms: Array.from(uniq.values()).slice(0, limit) });
    } catch (e: any) {
        return NextResponse.json({ error: guardMessage(e) || 'preview failed' }, { status: guardStatus(e) });
    }
}
