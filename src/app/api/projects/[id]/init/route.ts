import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import {
    findDocumentsByProjectIdDB,
    updateDocumentStructuredDB,
    updateDocumentStatusDB,
} from '@/db/document';
import { DocumentStatus } from '@/types/enums';
import { auth } from '@/auth';
import { uploadFileAction } from '@/actions/upload';
import { queryDictionaryEntriesExactByScope } from '@/actions/dictionary';

async function handlePersist(only: any, batchId: string, projectIdFromParams: string) {
    const redis = await getRedis();
    const [previewHtmlStored, docxStructStored] = await Promise.all([
        redis.get(`init.${batchId}.previewHtml`),
        redis.get(`init.${batchId}.docx.structured`),
    ]);
    let structuredObj: any = undefined;
    try {
        structuredObj = docxStructStored ? JSON.parse(String(docxStructStored)) : undefined;
    } catch {}
    const htmlContent = String(previewHtmlStored || '');
    if (!structuredObj && !htmlContent) {
        return NextResponse.json({ error: 'no parse artifacts to persist' }, { status: 400 });
    }
    const now = new Date();
    const docId = only.id;
    const baseName = (only as any)?.originalName?.split?.('/')?.pop?.() || `${docId}`;
    const stem = String(baseName).replace(/\.[^./]+$/, '') || docId;
    let htmlRes: { fileName: string; fileUrl: string } | undefined;
    let jsonRes: { fileName: string; fileUrl: string } | undefined;
    if (htmlContent) {
        const form = new FormData();
        form.set('file', new Blob([htmlContent], { type: 'text/html' }), `${stem}.preview.html`);
        form.set('projectName', projectIdFromParams);
        const res = await uploadFileAction(form as unknown as FormData);
        if ((res as any)?.success) {
            htmlRes = { fileName: (res as any).data.fileName, fileUrl: (res as any).data.fileUrl };
        } else {
            throw new Error((res as any)?.error || 'upload html failed');
        }
    }
    if (structuredObj) {
        const form = new FormData();
        form.set(
            'file',
            new Blob([JSON.stringify(structuredObj, null, 2)], { type: 'application/json' }),
            `${stem}.structured.json`
        );
        form.set('projectName', projectIdFromParams);
        const res = await uploadFileAction(form as unknown as FormData);
        if ((res as any)?.success) {
            jsonRes = { fileName: (res as any).data.fileName, fileUrl: (res as any).data.fileUrl };
        } else {
            throw new Error((res as any)?.error || 'upload json failed');
        }
    }
    const stored = {
        persistedAt: now.toISOString(),
        projectId: projectIdFromParams,
        sourceUrl: only.url,
        artifacts: {
            htmlUrl: htmlRes?.fileUrl || null,
            htmlFile: htmlRes?.fileName || null,
            jsonUrl: jsonRes?.fileUrl || null,
            jsonFile: jsonRes?.fileName || null,
        },
    };
    try {
        await updateDocumentStructuredDB(only.id, stored);
    } catch {}
    try {
        await updateDocumentStatusDB(only.id, DocumentStatus.PREPROCESSED as any);
    } catch {}
    return NextResponse.json({ ok: true, step: 'persist', artifacts: stored });
}

export async function POST(req: NextRequest, ctx: any) {
    try {
        const { id: projectIdFromParams } = await (ctx?.params || {});
        // 允许无 JSON Body：优先从 URL 读取，再回退 JSON Body
        const q = req.nextUrl.searchParams;
        let body: any = {};
        try {
            body = await req.json();
        } catch {}
        const batchId = String(q.get('batchId') || body?.batchId || '');
        const mode = (q.get('action') as any) || body?.mode;
        const terms = body?.terms || undefined;
        const segment = {
            headChars: Number(q.get('headChars') || body?.segment?.headChars || 0) || undefined,
            preview: q.get('preview') === '1' ? true : body?.segment?.preview === true,
        } as { headChars?: number; preview?: boolean };
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });

        const docs = await findDocumentsByProjectIdDB(projectIdFromParams);
        const only = docs?.[0];
        if (!only || !only.url)
            return NextResponse.json({ error: 'document not found' }, { status: 404 });

        const action = mode || 'parse';

        // 存储服务通过 server action（uploadFileAction）统一处理

        if (action === 'parse') {
            return NextResponse.json(
                { error: 'moved: use /api/projects/[id]/parse' },
                { status: 400 }
            );
        }

        // segment / terms：读取正文（优先从已持久化的 structured.json 构造带 <|n|> 标记的文本，失败再退回原始文本）
        else if (action === 'segment') {
            return NextResponse.json(
                { error: 'moved: use /api/projects/[id]/segment' },
                { status: 400 }
            );
        } else if (action === 'terms') {
            return NextResponse.json(
                { error: 'moved: use /api/projects/[id]/terms' },
                { status: 400 }
            );
        }

        // persist：在“下一步”时把解析产物写入对象存储，并把 URL 写回 Document.structured
        if (action === 'persist') {
            return await handlePersist(only, batchId, projectIdFromParams);
        }

        return NextResponse.json({ error: 'bad mode' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'start failed' }, { status: 500 });
    }
}

export async function GET(req: NextRequest, ctx: any) {
    try {
        await ctx?.params; // 仅为触发 Next.js 要求的 await；此处 GET 逻辑未直接使用 id
        const batchId = req.nextUrl.searchParams.get('batchId') || '';
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });
        const redis = await getRedis();
        const waitMs = Math.max(
            0,
            Math.min(30000, Number(req.nextUrl.searchParams.get('wait') || '0'))
        );
        const lastSeg = Number(req.nextUrl.searchParams.get('lastSeg') || '-1');
        const lastTerms = Number(req.nextUrl.searchParams.get('lastTerms') || '-1');
        const previewMode = req.nextUrl.searchParams.get('preview') === '1';
        const showAll = req.nextUrl.searchParams.get('all') === '1';
        const segBatch = previewMode ? `preview:${batchId}` : batchId;

        const toPct = (t: any, d: any) =>
            Number(t) > 0 ? Math.min(100, Math.round((Number(d) / Number(t)) * 100)) : 0;

        async function readStatus() {
            const [
                segT,
                segD,
                tT,
                tD,
                preview,
                termsJson,
                previewHtmlStored,
                segItemJson,
                docxStruct,
            ] = await Promise.all([
                redis.get(`seg.${segBatch}.total`),
                redis.get(`seg.${segBatch}.done`),
                redis.get(`docTerms.${batchId}.total`),
                redis.get(`docTerms.${batchId}.done`),
                redis.get(`init.${batchId}.preview`),
                redis.get(`docTerms.${batchId}.item.terms.all`),
                redis.get(`init.${batchId}.previewHtml`),
                redis.get(`seg.${segBatch}.item.seg.all`),
                redis.get(`init.${batchId}.docx.structured`),
            ]);
            const segProgress = toPct(segT, segD);
            const termsProgress = toPct(tT, tD);
            let terms: Array<{ term: string; count: number; score?: number }> = [];
            let dict: Array<{
                term: string;
                translation: string;
                notes?: string;
                source?: string;
            }> = [];
            try {
                const obj = termsJson ? JSON.parse(String(termsJson)) : null;
                if (obj && Array.isArray(obj.terms)) terms = obj.terms.slice(0, 20);
            } catch {}
            let segments: Array<{ type: string; sourceText: string }> | undefined;
            try {
                const obj = segItemJson ? JSON.parse(String(segItemJson)) : null;
                const arr = obj && Array.isArray(obj.segments) ? obj.segments : undefined;
                if (arr) {
                    segments = arr.map((s: any) => ({
                        type: s?.type,
                        sourceText: String(s?.sourceText || ''),
                    }));
                } else {
                    // 动态聚合各分块
                    const total = Number(segT) || 0;
                    if (total > 0) {
                        const parts: Array<{ type: string; sourceText: string }> = [];
                        for (let i = 0; i < total; i++) {
                            const raw = await redis.get(`seg.${segBatch}.item.seg.part.${i}`);
                            if (!raw) continue;
                            const pj = JSON.parse(String(raw));
                            const parr = pj && Array.isArray(pj.segments) ? pj.segments : [];
                            for (const s of parr)
                                parts.push({
                                    type: s?.type,
                                    sourceText: String(s?.sourceText || ''),
                                });
                        }
                        if (parts.length) segments = parts;
                    }
                }
            } catch {}
            if (previewMode && Array.isArray(segments) && !showAll) {
                segments = segments.slice(0, 20);
            }
            const fullHtml = (await redis.get(`init.${batchId}.previewHtml`)) || '';
            const limitHtml = (() => {
                try {
                    const str = String(fullHtml);
                    const paras = str.match(/<p[\s\S]*?<\/p>/gi) || [];
                    let out = paras.length ? paras.slice(0, 100).join('') : str;
                    if (out.length > 2000) out = out.slice(0, 2000);
                    return out;
                } catch {
                    return String(fullHtml || '');
                }
            })();
            // 基于提取的术语做一次精确词典命中查询（限制前 20 个术语），用于前端高亮
            try {
                const session = await auth();
                const userId = session?.user?.id || undefined;
                const uniqueTerms = Array.from(
                    new Set((terms || []).map(t => String(t?.term || '').trim()).filter(Boolean))
                );
                const out: Array<{
                    term: string;
                    translation: string;
                    notes?: string;
                    source?: string;
                }> = [];
                for (const t of uniqueTerms) {
                    const r = await queryDictionaryEntriesExactByScope(t, { userId, limit: 10 });
                    if (r?.success && Array.isArray(r.data) && r.data.length) {
                        for (const row of r.data as any[]) out.push(row);
                    }
                }
                dict = out;
            } catch {}

            let docxStructured: any = undefined;
            try {
                docxStructured = docxStruct ? JSON.parse(String(docxStruct)) : undefined;
            } catch {}
            return {
                segProgress,
                termsProgress,
                preview: preview || '',
                previewHtml: fullHtml || '',
                previewHtmlLimited: limitHtml || '',
                terms,
                dict,
                segments,
                docxStructured,
            };
        }

        if (waitMs > 0) {
            const start = Date.now();
            while (Date.now() - start < waitMs) {
                const [segT, segD, tT, tD] = await Promise.all([
                    redis.get(`seg.${segBatch}.total`),
                    redis.get(`seg.${segBatch}.done`),
                    redis.get(`docTerms.${batchId}.total`),
                    redis.get(`docTerms.${batchId}.done`),
                ]);
                const curSeg = toPct(segT, segD);
                const curTerms = toPct(tT, tD);
                // 不再因 curSeg>=100 无条件提前返回，避免进入高频短轮询
                // 预览模式下，只要有进度（>0）即返回，让前端尽快展示部分预览
                if (previewMode && curSeg > 0) {
                    const status = await readStatus();
                    return NextResponse.json(status);
                }
                if (
                    (lastSeg >= 0 && curSeg !== lastSeg) ||
                    (lastTerms >= 0 && curTerms !== lastTerms)
                ) {
                    const status = await readStatus();
                    return NextResponse.json(status);
                }
                await new Promise(r => setTimeout(r, 6000));
            }
            const status = await readStatus();
            return NextResponse.json(status);
        }

        const status = await readStatus();
        return NextResponse.json(status);
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'status failed' }, { status: 500 });
    }
}
