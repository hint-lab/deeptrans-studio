import { bulkUpsertEntriesAction, findProjectDictionaryAction } from '@/actions/dictionary';
import { extractDocumentTermsAction, translateTermsBatchAction } from '@/actions/project-init';
import { auth } from '@/auth';
import { findBlankDictionaryEntriesBySourcesDB, updateDictionaryEntryTargetTextDB } from '@/db/dictionaryEntry';
import { findDocumentsByProjectIdDB, updateDocumentStatusDB } from '@/db/document';
import { findProjectByIdDB } from '@/db/project';
import { extractTextFromUrl } from '@/lib/file-parser';
import { createLogger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { DocumentStatus } from '@/types/enums';
import { NextRequest, NextResponse } from 'next/server';
const logger = createLogger({
    type: 'term:apply',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function POST(req: NextRequest, ctx: any) {
    try {
        const { id: projectId } = await (ctx?.params || {});
        const q = req.nextUrl.searchParams;
        const {
            batchId,
            mode,
            autoTranslate,
            targetLanguage: bodyTL,
            domain: bodyDomain,
            documentId,
        } = (await req.json().catch(() => ({}))) as {
            batchId: string;
            mode?: 'append' | 'overwrite' | 'upsert';
            limit?: number;
            autoTranslate?: boolean;
            targetLanguage?: string;
            domain?: string;
            documentId?: string;
        };
        if (!projectId) return NextResponse.json({ error: 'missing project id' }, { status: 400 });
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });

        const session = await auth();
        const userId = session?.user?.id || undefined;
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        let unique: string[] = [];
        {
            const redis = await getRedis();
            const raw = await redis.get(`docTerms.${batchId}.item.terms.all`);
            logger.debug(`redis get key: docTerms.${batchId}.item.terms.all`)
            if (raw) {
                try {
                    const obj = JSON.parse(String(raw));
                    const terms: Array<{ term: string; count?: number; score?: number }> =
                        Array.isArray(obj?.terms) ? obj.terms : [];
                    unique = Array.from(
                        new Set(terms.map(t => String(t?.term || '').trim()).filter(Boolean))
                    );
                } catch {
                    logger.error("JSON格式化失败: ", raw || "null")
                } finally {
                    logger.info("格式化docTerms: ", raw || "null")
                }
            }
        }
        // 兜底：若 Redis 中暂无术语，尝试即时抽取一个简版术语表（不经队列）
        if (!unique.length) {
            try {
                const docs = await findDocumentsByProjectIdDB(projectId);
                const only = docs?.[0];
                if (only?.url) {
                    const { text } = await extractTextFromUrl(only.url);
                    const head = String(text || '').slice(0, 4000);
                    if (head) {
                        const quick = await extractDocumentTermsAction(head, {
                            maxTerms: 80,
                            chunkSize: 2000,
                            overlap: 200,
                        });
                        unique = Array.from(
                            new Set(
                                (quick || []).map(t => String(t?.term || '').trim()).filter(Boolean)
                            )
                        );
                    }
                }
            } catch {
                logger.error("即时抽取简版术语表时出错!")
            }
        }
        //if (!unique.length) return NextResponse.json({ error: 'empty terms' }, { status: 400 });

        // 找/建项目词库（封装，PROJECT 可见性）
        const found = await findProjectDictionaryAction(projectId);
        if (!found?.success || !found.data?.id) {
            return NextResponse.json(
                { error: found?.error || 'dictionary not available' },
                { status: 500 }
            );
        }
        const dictionaryId = found.data.id;

        const applyMode = (mode || 'upsert') as 'append' | 'overwrite' | 'upsert';
        const applied = await bulkUpsertEntriesAction({
            dictionaryId,
            projectId,
            userId: String(userId),
            terms: unique,
            mode: applyMode,
            copyFromOthers: true,
        });
        if (!applied?.success) {
            logger.error({ error: applied?.error || 'apply failed' });
            return NextResponse.json({ error: applied?.error || 'apply failed' }, { status: 500 });
        }
        let { inserted = 0, updated = 0, skipped = 0 } = applied.data || {};

        // 可选：对新建且无译文的条目进行机器翻译填充
        if (autoTranslate === true) {
            try {
                const norm = (s: string) => String(s || '').trim();
                const blanks = await findBlankDictionaryEntriesBySourcesDB(dictionaryId, unique);
                const srcList = blanks?.map((b: any) => norm(b.sourceText)) || [];
                const project = await findProjectByIdDB(projectId);
                const sourceLanguage = String(
                    q.get('sourceLanguage') || (project as any)?.sourceLanguage || 'auto'
                );
                const targetLanguage = String(
                    q.get('targetLanguage') || bodyTL || (project as any)?.targetLanguage || 'zh'
                );
                const domain =
                    String(q.get('domain') || bodyDomain || (project as any)?.domain || '') ||
                    undefined;

                // 第一次批量翻译
                const batch = await translateTermsBatchAction(
                    srcList,
                    sourceLanguage,
                    targetLanguage,
                    { domain }
                );
                const map = new Map<string, string>(
                    batch.map(x => [norm(x.term), String(x.translation || '').trim()])
                );

                // 缺失项二次批处理兜底
                const missing = srcList.filter((t: any) => !map.get(t));
                if (missing.length > 0) {
                    const batch2 = await translateTermsBatchAction(
                        missing,
                        sourceLanguage,
                        targetLanguage,
                        { domain }
                    );
                    for (const x of batch2) {
                        const k = norm(x.term);
                        const v = String(x.translation || '').trim();
                        if (k && v && !map.get(k)) map.set(k, v);
                    }
                }

                for (const row of blanks || []) {
                    const k = norm((row as any).sourceText);
                    const tt = map.get(k) || '';
                    await updateDictionaryEntryTargetTextDB(
                        (row as any).id,
                        tt,
                        tt ? 'apply:mt' : 'apply:new'
                    );
                    if (tt) updated += 1;
                }
            } catch (e: any) {
                logger.error('translate terms batch failed', e);
            }
        }
        try {
            const only = documentId
                ? await (await import('@/db/document')).findDocumentByIdDB(documentId)
                : (await findDocumentsByProjectIdDB(projectId))?.[0];
            if (only?.id) {
                await updateDocumentStatusDB(only.id, DocumentStatus.COMPLETED as any);
            }
        } catch { }
        return NextResponse.json({ ok: true, dictionaryId, inserted, updated, skipped });
    } catch (e: any) {
        try {
            const { id: projectId } = await ctx.params;
            const docs = await findDocumentsByProjectIdDB(projectId);
            const only = docs?.[0];
            if (only?.id) {
                try {
                    await updateDocumentStatusDB(only.id, DocumentStatus.ERROR as any);
                } catch { }
            }
        } catch { }
        logger.error({ error: e?.message || 'apply failed' });
        return NextResponse.json({ error: e?.message || 'apply failed' }, { status: 500 });
    }
}
