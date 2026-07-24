import { bulkUpsertEntriesAction, findProjectDictionaryAction } from '@/actions/dictionary';
import { extractDocumentTermsAction, translateTermsBatchAction } from '@/actions/project-init';
import { findBlankDictionaryEntriesBySourcesDB, updateDictionaryEntryTargetTextDB } from '@/db/dictionaryEntry';
import { updateDocumentStatusDB } from '@/db/document';
import { extractTextFromUrl } from '@/lib/file-parser';
import { guardMessage, guardStatus, requireOwnedProjectDocument, requireUser, requireWritableProject } from '@/lib/guards';
import { scopedProjectBatchId } from '@/lib/init-artifact-keys';
import { createLogger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { setJSONWithTTL, TTL_BATCH } from '@/lib/redis-ttl';
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

async function setDocumentStatus(documentId: string, status: DocumentStatus): Promise<boolean> {
    if (!documentId) return false;
    try {
        const updated = await updateDocumentStatusDB(documentId, status as any);
        if (updated) return true;
    } catch { }
    logger.error('document status update failed', { documentId, status });
    return false;
}

async function markDocumentError(documentId: string) {
    await setDocumentStatus(documentId, DocumentStatus.ERROR);
}

export async function POST(req: NextRequest, ctx: any) {
    let ownedDocumentId = '';
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
            finalize,
        } = (await req.json().catch(() => ({}))) as {
            batchId: string;
            mode?: 'append' | 'overwrite' | 'upsert';
            limit?: number;
            autoTranslate?: boolean;
            targetLanguage?: string;
            domain?: string;
            documentId?: string;
            finalize?: boolean;
        };
        if (!projectId) return NextResponse.json({ error: 'missing project id' }, { status: 400 });
        if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 });

        const authCtx = await requireUser();
        const project = await requireWritableProject(projectId, authCtx);
        const ownedDocument = documentId
            ? await requireOwnedProjectDocument(projectId, documentId, authCtx)
            : project.documents?.[0];
        ownedDocumentId = ownedDocument?.id || '';
        if (!ownedDocumentId) {
            return NextResponse.json({ error: 'document not available' }, { status: 404 });
        }
        if (!(await setDocumentStatus(ownedDocumentId, DocumentStatus.TERMS_EXTRACTING))) {
            return NextResponse.json({ error: 'document status update failed' }, { status: 500 });
        }
        const scopedBatchId = scopedProjectBatchId(projectId, batchId);

        const redis = await getRedis();
        let unique: string[] = [];
        {
            const raw = await redis.get(`docTerms.${scopedBatchId}.item.terms.all`);
            logger.debug(`redis get key: docTerms.${scopedBatchId}.item.terms.all`);
            if (raw) {
                try {
                    const obj = JSON.parse(String(raw));
                    const terms: Array<{ term: string; count?: number; score?: number }> =
                        Array.isArray(obj?.terms) ? obj.terms : [];
                    unique = Array.from(
                        new Set(terms.map(t => String(t?.term || '').trim()).filter(Boolean))
                    );
                } catch {
                    logger.error('术语结果 JSON 格式化失败');
                } finally {
                    logger.info('格式化docTerms', { count: unique.length });
                }
            }
        }
        // 兜底：若 Redis 中暂无术语，尝试即时抽取一个简版术语表（不经队列）
        if (!unique.length) {
            try {
                if (ownedDocument?.url) {
                    const { text } = await extractTextFromUrl(ownedDocument.url);
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
                        if (unique.length) {
                            await setJSONWithTTL(
                                redis,
                                `docTerms.${scopedBatchId}.item.terms.all`,
                                { id: 'terms.all', terms: quick },
                                TTL_BATCH
                            );
                        }
                    }
                }
            } catch {
                logger.error("即时抽取简版术语表时出错!")
            }
        }
        if (!unique.length) {
            await markDocumentError(ownedDocumentId);
            return NextResponse.json(
                { error: '未提取到可写入的术语，请重试或调整提取设置' },
                { status: 422 }
            );
        }

        // 找/建项目词库（封装，PROJECT 可见性）
        const found = await findProjectDictionaryAction(projectId);
        if (!found?.success || !found.data?.id) {
            await markDocumentError(ownedDocumentId);
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
            terms: unique,
            mode: applyMode,
            copyFromOthers: true,
        });
        if (!applied?.success) {
            logger.error({ error: applied?.error || 'apply failed' });
            await markDocumentError(ownedDocumentId);
            return NextResponse.json({ error: applied?.error || 'apply failed' }, { status: 500 });
        }
        let { inserted = 0, updated = 0, skipped = 0 } = applied.data || {};
        let translated = 0;

        // 可选：对新建且无译文的条目进行机器翻译填充
        if (autoTranslate === true) {
            try {
                const norm = (s: string) => String(s || '').trim();
                const blanks = await findBlankDictionaryEntriesBySourcesDB(dictionaryId, unique);
                if (blanks === null) throw new Error('failed to load untranslated terms');
                const srcList = blanks?.map((b: any) => norm(b.sourceText)) || [];
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

                let translatedCount = 0;
                let untranslatedCount = 0;
                for (const row of blanks || []) {
                    const k = norm((row as any).sourceText);
                    const tt = map.get(k) || '';
                    if (!tt) {
                        untranslatedCount += 1;
                        continue;
                    }
                    const saved = await updateDictionaryEntryTargetTextDB(
                        (row as any).id,
                        tt,
                        'apply:mt'
                    );
                    if (!saved) {
                        untranslatedCount += 1;
                        continue;
                    }
                    updated += 1;
                    translatedCount += 1;
                }
                translated = translatedCount;
                if (untranslatedCount > 0) {
                    logger.error('term translation incomplete', {
                        translatedCount,
                        untranslatedCount,
                    });
                    await markDocumentError(ownedDocumentId);
                    return NextResponse.json(
                        {
                            error: `术语预翻译未完成（${untranslatedCount} 条），请重试`,
                            translated: translatedCount,
                            failed: untranslatedCount,
                        },
                        { status: 502 }
                    );
                }
            } catch (e: any) {
                logger.error('translate terms batch failed', e);
                await markDocumentError(ownedDocumentId);
                return NextResponse.json({ error: '术语预翻译失败，请重试' }, { status: 502 });
            }
        }
        if (finalize !== false) {
            if (!(await setDocumentStatus(ownedDocumentId, DocumentStatus.COMPLETED))) {
                await markDocumentError(ownedDocumentId);
                return NextResponse.json(
                    { error: '术语已写入，但文档状态更新失败，请重试' },
                    { status: 500 }
                );
            }
        }
        return NextResponse.json({ ok: true, dictionaryId, inserted, updated, skipped, translated });
    } catch (e: any) {
        await markDocumentError(ownedDocumentId);
        logger.error({ error: e?.message || 'apply failed' });
        return NextResponse.json({ error: guardMessage(e) || 'apply failed' }, { status: guardStatus(e) });
    }
}
