export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import {
    MEMORY_EXPORT_MAX_ENTRIES,
    MemoryExportLimitError,
    buildMemoryExportContentDisposition,
    isMemoryExportFormat,
    serializeTranslationMemoryExport,
    type TranslationMemoryExportEntry,
} from '@/lib/memory-export';
import { GuardError, guardStatus, requireOwnedMemory, requireUser } from '@/lib/guards';

type ExportScope = 'all' | 'memory';

function parseRequest(req: Request) {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format')?.trim().toLowerCase() || null;
    const memoryId = searchParams.get('memoryId')?.trim() || null;
    const requestedScope = searchParams.get('scope')?.trim().toLowerCase();

    if (!isMemoryExportFormat(format)) {
        throw new GuardError(400, 'format 必须为 csv 或 tmx');
    }
    if (memoryId && memoryId.length > 191) {
        throw new GuardError(400, 'memoryId 无效');
    }
    if (requestedScope && requestedScope !== 'all') {
        throw new GuardError(400, 'scope 必须为 all');
    }
    if (memoryId && requestedScope === 'all') {
        throw new GuardError(400, 'memoryId 与 scope=all 不能同时使用');
    }
    if (memoryId) return { format, memoryId, scope: 'memory' as const };
    if (requestedScope === 'all') return { format, memoryId: null, scope: 'all' as const };

    throw new GuardError(400, '请提供 memoryId，或指定 scope=all');
}

function tooLargeError() {
    return new GuardError(
        413,
        `单次最多导出 ${MEMORY_EXPORT_MAX_ENTRIES.toLocaleString()} 条记忆，请缩小导出范围后重试。`
    );
}

function entryWhere(scope: ExportScope, memoryId: string | null, userId: string) {
    return scope === 'memory'
        ? { memoryId: memoryId! }
        : {
              memory: {
                  userId,
              },
          };
}

export async function GET(req: Request) {
    try {
        const { format, memoryId, scope } = parseRequest(req);
        const authCtx = await requireUser();

        // A single-memory export obtains the row through the strict owner guard;
        // an all-memory export is also deliberately user-scoped, never tenant-scoped.
        if (scope === 'memory' && memoryId) await requireOwnedMemory(memoryId, authCtx);

        const where = entryWhere(scope, memoryId, authCtx.userId);
        const rows: Array<{
            sourceText: string;
            targetText: string;
            notes?: string | null;
            sourceLang?: string | null;
            targetLang?: string | null;
            memory: { name: string };
        }> = await (prisma as any).translationMemoryEntry.findMany({
            where,
            // Fetch one sentinel row in the same query so a concurrent import
            // cannot turn a verified export into a silently truncated response.
            take: MEMORY_EXPORT_MAX_ENTRIES + 1,
            select: {
                sourceText: true,
                targetText: true,
                notes: true,
                sourceLang: true,
                targetLang: true,
                memory: { select: { name: true } },
            },
            orderBy: [{ memoryId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        if (rows.length > MEMORY_EXPORT_MAX_ENTRIES) throw tooLargeError();

        const entries: TranslationMemoryExportEntry[] = rows.map(row => ({
            memoryName: row.memory.name,
            sourceText: row.sourceText,
            targetText: row.targetText,
            notes: row.notes,
            sourceLang: row.sourceLang,
            targetLang: row.targetLang,
        }));
        const body = serializeTranslationMemoryExport(entries, format);

        return new Response(body, {
            status: 200,
            headers: {
                'Content-Type':
                    format === 'csv'
                        ? 'text/csv; charset=utf-8'
                        : 'application/x-tmx+xml; charset=utf-8',
                'Content-Disposition': buildMemoryExportContentDisposition(format, scope),
                'Cache-Control': 'private, no-store, max-age=0',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        const status = error instanceof MemoryExportLimitError ? 413 : guardStatus(error);
        const message =
            error instanceof GuardError || error instanceof MemoryExportLimitError
                ? error.message
                : '导出失败';
        return Response.json(
            { success: false, error: message },
            {
                status,
                headers: { 'Cache-Control': 'private, no-store, max-age=0' },
            }
        );
    }
}
