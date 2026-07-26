'use server';
import {
    createDictionaryDB,
    deleteDictionaryByIdDB,
    findAllDictionariesDB,
    findAllDictionariesWithEntriesDB,
    findDictionariesGivenVisibilityDB,
    findDictionaryByIdDB,
    findDictionaryByProjectIdDB,
    findOrCreateDictionaryDB,
    updateDictionaryByIdDB,
} from '@/db/dictionary';
import {
    countDictionaryEntriesDB,
    findCandidateTranslationsForSourcesDB,
    findDictionaryEntriesDB,
} from '@/db/dictionaryEntry';
import { prisma } from '@/lib/db';
import {
    dictionaryImportOriginForFilename,
    normalizeAndDeduplicateDictionaryEntries,
    normalizeDictionaryEntry,
    normalizeDictionaryEntryTerms,
} from '@/lib/dictionary-entry-normalization';
import {
    DICTIONARY_CREATE_ERROR_CODES,
    type DictionaryCreateInput,
    validateDictionaryCreateInput,
} from '@/lib/dictionary-create-input';
import { publicActionErrorMessage } from '@/lib/action-error-boundary';
import {
    DictionaryImportInputError,
    dictionaryImportErrorMessage,
    dictionaryImportPublicErrorMessage,
} from '@/lib/dictionary-import-error';
import {
    clampDictionaryEntryPage,
    normalizeDictionaryEntryOriginFilter,
    normalizeDictionaryEntryPage,
    normalizeDictionaryEntryPageSize,
} from '@/lib/dictionary-entry-pagination';
import {
    type AuthContext,
    canWriteDictionary,
    GuardError,
    ownedWhere,
    requireAccessibleDictionary,
    requireOwnedProject,
    requireUser,
    requireWritableDictionary,
    requireWritableProject,
} from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import {
    queryDictionaryEntriesExactWithOwner,
    queryDictionaryEntriesWithOwner,
} from '@/server/dictionary';
import { Prisma, type Dictionary } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
const logger = createLogger(
    {
        type: 'actions:dictionary',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

const DICTIONARY_QUERY_UNAVAILABLE_MESSAGE = '词库检索暂不可用，请稍后重试';

// 创建词典
export async function createDictionaryAction(data: DictionaryCreateInput | null | undefined) {
    const validated = validateDictionaryCreateInput(data);
    if (!validated.ok) return { success: false, errorCode: validated.errorCode } as const;

    try {
        const authCtx = await requireUser();
        if (validated.data.visibility === 'PUBLIC' && authCtx.role !== 'ADMIN') {
            return {
                success: false,
                errorCode: DICTIONARY_CREATE_ERROR_CODES.PUBLIC_ADMIN_REQUIRED,
            } as const;
        }
        if (validated.data.visibility === 'PROJECT' && !authCtx.tenantId) {
            return {
                success: false,
                errorCode: DICTIONARY_CREATE_ERROR_CODES.PROJECT_TENANT_REQUIRED,
            } as const;
        }
        const dictionary = await createDictionaryDB({
            ...validated.data,
            userId: authCtx.userId,
            tenantId: authCtx.tenantId || undefined,
        });
        if (!dictionary) {
            return {
                success: false,
                errorCode: DICTIONARY_CREATE_ERROR_CODES.CREATE_FAILED,
            } as const;
        }

        revalidatePath('/dashboard/dictionaries');
        return { success: true, data: dictionary } as const;
    } catch (error) {
        logger.error('Dictionary creation failed', error);
        return {
            success: false,
            errorCode:
                error instanceof GuardError
                    ? DICTIONARY_CREATE_ERROR_CODES.AUTH_REQUIRED
                    : DICTIONARY_CREATE_ERROR_CODES.CREATE_FAILED,
        } as const;
    }
}

// 获取所有词典
export async function getAllDictionariesAction() {
    try {
        const authCtx = await requireUser();
        const dictionaries = await prisma.dictionary.findMany({
            where: {
                OR: [
                    { visibility: 'PUBLIC' },
                    { userId: authCtx.userId },
                    ...(authCtx.tenantId ? [{ tenantId: authCtx.tenantId }] : []),
                    { projectBindings: { some: { project: ownedWhere(authCtx) } } },
                ],
            },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: dictionaries };
    } catch (error) {
        logger.error('获取词典失败:', error);
        return { success: false, error: '获取词典失败' };
    }
}

// 轻量列表（给设置选项用）
export async function getAllDictionariesLiteAction() {
    try {
        const authCtx = await requireUser();
        const dictionaries = await prisma.dictionary.findMany({
            where: {
                OR: [
                    { visibility: 'PUBLIC' },
                    { userId: authCtx.userId },
                    ...(authCtx.tenantId ? [{ tenantId: authCtx.tenantId }] : []),
                    { projectBindings: { some: { project: ownedWhere(authCtx) } } },
                ],
            },
            include: {
                entries: true,
                user: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: dictionaries };
    } catch (error) {
        logger.error('获取词典列表失败:', error);
        return { success: false, error: '获取词典列表失败' };
    }
}

// 获取公共词典
export async function fetchDictionariesAction(visibility: 'public' | 'private' | 'project') {
    try {
        const authCtx = await requireUser();
        let dictionaries;
        if (visibility === 'private') {
            dictionaries = await findDictionariesGivenVisibilityDB(
                'PRIVATE',
                'desc',
                authCtx.userId
            );
        } else if (visibility === 'project') {
            dictionaries = await prisma.dictionary.findMany({
                where: {
                    visibility: 'PROJECT',
                    OR: [
                        ...(authCtx.tenantId ? [{ tenantId: authCtx.tenantId }] : []),
                        { projectBindings: { some: { project: ownedWhere(authCtx) } } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                include: { _count: { select: { entries: true } } },
            });
        } else {
            dictionaries = await findDictionariesGivenVisibilityDB('PUBLIC');
        }
        logger.debug('获取词典列表:', { count: dictionaries?.length || 0 });
        return { success: true, data: dictionaries };
    } catch (error) {
        logger.error('获取公共词典失败:', error);
        return { success: false, error: '获取公共词典失败' };
    }
}

// 词库管理页一次取回全部可见范围，避免客户端串行发起三次鉴权请求。
export async function fetchDictionaryDashboardAction() {
    try {
        const authCtx = await requireUser();
        const [publicDictionaries, projectDictionaries, privateDictionaries] = await Promise.all([
            findDictionariesGivenVisibilityDB('PUBLIC'),
            prisma.dictionary.findMany({
                where: {
                    visibility: 'PROJECT',
                    OR: [
                        ...(authCtx.tenantId ? [{ tenantId: authCtx.tenantId }] : []),
                        { projectBindings: { some: { project: ownedWhere(authCtx) } } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: { select: { entries: true } },
                    projectBindings: {
                        select: { project: { select: { userId: true } } },
                    },
                },
            }),
            findDictionariesGivenVisibilityDB('PRIVATE', 'desc', authCtx.userId),
        ]);

        type ProjectDictionaryWithBindings = Dictionary & {
            _count: { entries: number };
            projectBindings: Array<{ project: { userId: string | null } }>;
        };
        const projectDictionariesWithAccess = (
            projectDictionaries as ProjectDictionaryWithBindings[]
        ).map(dictionary => {
            const { projectBindings, ...data } = dictionary;
            return {
                ...data,
                canWrite:
                    (dictionary.userId === authCtx.userId &&
                        dictionary.tenantId === (authCtx.tenantId ?? null)) ||
                    projectBindings.some(binding => binding.project.userId === authCtx.userId),
            };
        });
        const publicDictionariesWithAccess = (publicDictionaries ?? []).map(dictionary => ({
            ...dictionary,
            canWrite: authCtx.role === 'ADMIN' || dictionary.userId === authCtx.userId,
        }));

        return {
            success: true,
            data: {
                userId: authCtx.userId,
                userRole: authCtx.role,
                publicDictionaries: publicDictionariesWithAccess,
                projectDictionaries: projectDictionariesWithAccess,
                privateDictionaries,
            },
        };
    } catch (error) {
        logger.error('获取词库管理页数据失败:', error);
        return { success: false, error: '获取词库失败' };
    }
}

// 获取词典详情
export async function fetchDictionaryByIdAction(id: string) {
    try {
        const dictionary = await requireAccessibleDictionary(id);

        return { success: true, data: dictionary };
    } catch (error) {
        logger.error('获取词典详情失败:', error);
        return { success: false, error: '获取词典详情失败' };
    }
}

// 仅获取词典元信息（更快，避免一次性返回大量 entries）
export async function fetchDictionaryMetaByIdAction(dictionaryId: string) {
    try {
        const authCtx = await requireUser();
        const dictionary = await requireAccessibleDictionary(dictionaryId, authCtx);
        const canWrite = await canWriteDictionary(dictionaryId, authCtx);
        return { success: true, data: { ...dictionary, canWrite } };
    } catch (error) {
        logger.error('获取词典元信息失败:', error);
        return { success: false, error: '获取词典元信息失败' };
    }
}
// 仅获取词典元信息（更快，避免一次性返回大量 entries）
export async function fetchDictionaryMetaByProjectIdAction(projectId: string) {
    try {
        const authCtx = await requireUser();
        await requireOwnedProject(projectId, authCtx);
        const dictionary = await findDictionaryByProjectIdDB(projectId);
        const canWrite = dictionary ? await canWriteDictionary(dictionary.id, authCtx) : false;
        return {
            success: true,
            data: dictionary ? { ...dictionary, canWrite } : null,
        };
    } catch (error) {
        logger.error('获取词典元信息失败:', error);
        return { success: false, error: '获取词典元信息失败' };
    }
}
// 更新词典
export async function updateDictionaryAction(
    id: string,
    data: {
        name?: string;
        description?: string;
        domain?: string;
        visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE';
    }
) {
    try {
        const authCtx = await requireUser();
        await requireWritableDictionary(id, authCtx);
        if (data.visibility === 'PUBLIC' && authCtx.role !== 'ADMIN') {
            return { success: false, error: '只有管理员可以发布公共词库' };
        }
        if (data.visibility === 'PROJECT' && !authCtx.tenantId) {
            return { success: false, error: '当前账号未加入租户，无法设为项目词库' };
        }
        const dictionary = await updateDictionaryByIdDB(id, data);
        if (!dictionary) throw new Error('DICTIONARY_UPDATE_UNAVAILABLE');

        revalidatePath('/dashboard/dictionaries');
        return { success: true, data: dictionary };
    } catch (error) {
        logger.error('更新词典失败:', error);
        return { success: false, error: '更新词典失败' };
    }
}

// 删除词典
export async function deleteDictionaryAction(id: string) {
    try {
        await requireWritableDictionary(id);
        const bindings = await prisma.projectDictionary.findMany({
            where: { dictionaryId: id },
            select: { projectId: true },
            take: 2,
        });
        if (bindings.length > 1) {
            return { success: false, error: '词典已被多个项目绑定，不能直接删除' };
        }
        const deleted = await deleteDictionaryByIdDB(id);
        if (!deleted) throw new Error('DICTIONARY_DELETE_UNAVAILABLE');
        revalidatePath('/dashboard/dictionaries');
        return { success: true };
    } catch (error) {
        logger.error('删除词典失败:', error);
        return { success: false, error: '删除词典失败' };
    }
}

// 创建词典条目
export async function createDictionaryEntryAction(data: {
    sourceText: string;
    targetText: string;
    notes?: string;
    dictionaryId: string;
    origin?: string;
}) {
    try {
        const authCtx = await requireUser();
        await requireWritableDictionary(data.dictionaryId, authCtx);
        const entryInput = normalizeDictionaryEntry(data);
        const entry = await withLockedDictionary(data.dictionaryId, transaction =>
            transaction.dictionaryEntry.create({
                data: {
                    dictionaryId: data.dictionaryId,
                    sourceText: entryInput.sourceText,
                    targetText: entryInput.targetText,
                    notes: entryInput.notes ?? null,
                    origin: data.origin ?? 'manual',
                    createdById: authCtx.userId,
                    updatedById: authCtx.userId,
                },
            })
        );

        revalidatePath('/dashboard/dictionaries');
        return { success: true, data: entry };
    } catch (error) {
        logger.error('创建词典条目失败:', error);
        return { success: false, error: '创建词典条目失败' };
    }
}

// 更新词典条目
export async function updateDictionaryEntryAction(
    id: string,
    data: {
        sourceText?: string;
        targetText?: string;
        notes?: string;
        enabled?: boolean;
        userId?: string;
    }
) {
    try {
        const authCtx = await requireUser();
        const existing = await prisma.dictionaryEntry.findUnique({
            where: { id },
            select: { dictionaryId: true, sourceText: true, targetText: true, notes: true },
        });
        if (!existing) throw new Error('词条不存在');
        await requireWritableDictionary(existing.dictionaryId, authCtx);
        const changesEntryContent =
            data.sourceText !== undefined ||
            data.targetText !== undefined ||
            data.notes !== undefined;
        const entryInput = changesEntryContent
            ? normalizeDictionaryEntry({
                  sourceText: data.sourceText ?? existing.sourceText,
                  targetText: data.targetText ?? existing.targetText,
                  notes: data.notes ?? existing.notes,
              })
            : undefined;
        if (
            data.enabled === true &&
            !String(entryInput?.targetText ?? existing.targetText ?? '').trim()
        ) {
            return { success: false, error: '没有译文的词条不能启用' };
        }
        const entry = await withLockedDictionary(existing.dictionaryId, transaction =>
            transaction.dictionaryEntry.update({
                where: { id },
                data: {
                    sourceText: entryInput?.sourceText,
                    targetText: entryInput?.targetText,
                    notes: changesEntryContent ? (entryInput?.notes ?? null) : undefined,
                    enabled: data.enabled,
                    updatedById: authCtx.userId,
                },
            })
        );

        revalidatePath('/dashboard/dictionaries');
        return { success: true, data: entry };
    } catch (error) {
        logger.error('更新词典条目失败:', error);
        return { success: false, error: '更新词典条目失败' };
    }
}

// 删除词典条目
export async function deleteDictionaryEntryAction(id: string) {
    try {
        const authCtx = await requireUser();
        const existing = await prisma.dictionaryEntry.findUnique({
            where: { id },
            select: { dictionaryId: true },
        });
        if (!existing) throw new Error('词条不存在');
        await requireWritableDictionary(existing.dictionaryId, authCtx);
        await withLockedDictionary(existing.dictionaryId, transaction =>
            transaction.dictionaryEntry.delete({ where: { id } })
        );

        revalidatePath('/dashboard/dictionaries');
        return { success: true };
    } catch (error) {
        logger.error('删除词典条目失败:', error);
        return { success: false, error: '删除词典条目失败' };
    }
}

// 获取词典的所有条目
export async function fetchDictionaryEntriesAction(dictionaryId: string, limit: number = 0) {
    try {
        await requireAccessibleDictionary(dictionaryId);
        const entries = await findDictionaryEntriesDB(dictionaryId, limit);

        return { success: true, data: entries };
    } catch (error) {
        logger.error('获取词典条目失败:', error);
        return { success: false, error: '获取词典条目失败' };
    }
}

// 分页获取词典条目
export async function fetchDictionaryEntriesPagedAction(
    dictionaryId: string,
    page: number = 1,
    pageSize: number = 50,
    searchTerm?: string,
    originFilter?: string
) {
    try {
        await requireAccessibleDictionary(dictionaryId);
        const requestedPage = normalizeDictionaryEntryPage(page);
        const take = normalizeDictionaryEntryPageSize(pageSize);
        const requestedOrigin = String(originFilter || '').trim();
        const normalizedOrigin = normalizeDictionaryEntryOriginFilter(requestedOrigin);
        if (requestedOrigin && !normalizedOrigin) {
            throw new Error('INVALID_DICTIONARY_ENTRY_ORIGIN_FILTER');
        }
        const where: any = { dictionaryId };
        if (searchTerm && searchTerm.trim()) {
            where.OR = [
                { sourceText: { contains: searchTerm, mode: 'insensitive' } },
                { targetText: { contains: searchTerm, mode: 'insensitive' } },
                { notes: { contains: searchTerm, mode: 'insensitive' } },
            ];
        }
        if (normalizedOrigin) {
            where.origin = { equals: normalizedOrigin } as any;
        }

        const total = await countDictionaryEntriesDB(where);
        if (total === null) throw new Error('DICTIONARY_ENTRY_COUNT_UNAVAILABLE');
        const currentPage = clampDictionaryEntryPage(requestedPage, total, take);
        const skip = (currentPage - 1) * take;
        const entries = await findDictionaryEntriesDB(where, skip, take);
        if (entries === null) throw new Error('DICTIONARY_ENTRY_PAGE_UNAVAILABLE');

        return { success: true, data: entries, total, page: currentPage, pageSize: take };
    } catch (error) {
        logger.error('分页获取词典条目失败:', error);
        return { success: false, error: '分页获取词典条目失败' };
    }
}

// 搜索词典条目
export async function searchDictionaryEntriesAction(dictionaryId: string, searchTerm: string) {
    try {
        await requireAccessibleDictionary(dictionaryId);
        const where: any = {
            dictionaryId,
            OR: [
                { sourceText: { contains: searchTerm, mode: 'insensitive' } },
                { targetText: { contains: searchTerm, mode: 'insensitive' } },
                { notes: { contains: searchTerm, mode: 'insensitive' } },
            ],
        };
        const entries = await findDictionaryEntriesDB(where, 0, 30);

        return { success: true, data: entries };
    } catch (error) {
        logger.error('搜索词典条目失败:', error);
        return { success: false, error: '搜索词典条目失败' };
    }
}

// 导入：Excel (xlsx)
export async function importDictionaryFromXlsxAction(
    dictionaryId: string,
    fileBuffer: ArrayBuffer | Buffer,
    mapping?: { sourceKey?: string; targetKey?: string; notesKey?: string }
) {
    try {
        const authCtx = await requireUser();
        await requireWritableDictionary(dictionaryId, authCtx);
        const XLSX = await import('xlsx');
        const wb = XLSX.read(fileBuffer, { type: 'buffer' });
        const first =
            wb.SheetNames && wb.SheetNames.length
                ? wb.SheetNames[0]
                : (undefined as unknown as string);
        const ws = first ? wb.Sheets[first] : (undefined as any);
        const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
        const norm = (k: string) =>
            String(k || '')
                .trim()
                .toLowerCase();
        const srcKey = mapping?.sourceKey || 'source';
        const tgtKey = mapping?.targetKey || 'target';
        const noteKey = mapping?.notesKey || 'notes';
        const parsedEntries = rows
            .map(r => {
                const keys = Object.keys(r);
                const kv: any = {};
                for (const k of keys) kv[norm(k)] = r[k];
                return {
                    sourceText: String(kv[norm(srcKey)] ?? kv['源'] ?? kv['source'] ?? '').trim(),
                    targetText: String(kv[norm(tgtKey)] ?? kv['译'] ?? kv['target'] ?? '').trim(),
                    notes: String(kv[norm(noteKey)] ?? kv['备注'] ?? kv['notes'] ?? '').trim(),
                };
            })
            .filter(e => e.sourceText && e.targetText);

        if (!parsedEntries.length)
            return { success: false, error: 'Excel 未检测到有效的 source/target 列' };
        const { entries, duplicateCount } = normalizeAndDeduplicateDictionaryEntries(parsedEntries);
        const result = await importEntries(dictionaryId, entries, 'append', {
            origin: 'import:xlsx',
            userId: authCtx.userId,
            skipped: duplicateCount,
        });
        revalidatePath('/dashboard/dictionaries');
        return { success: true, count: result.inserted, skipped: result.skipped };
    } catch (e) {
        logger.error('Excel 导入失败:', e);
        return { success: false, error: 'Excel 导入失败' };
    }
}

// 导入：TBX（简化版：提取 termEntry > langSet 与 tig 的 term）
export async function importDictionaryFromTbxAction(dictionaryId: string, xmlText: string) {
    try {
        const authCtx = await requireUser();
        await requireWritableDictionary(dictionaryId, authCtx);
        const { XMLParser } = await import('fast-xml-parser');
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            textNodeName: 'text',
        });
        const obj: any = parser.parse(xmlText);
        const body =
            obj?.TBX?.text?.body || obj?.tbx?.text?.body || obj?.TBX?.body || obj?.tbx?.body;
        const entries: Array<{ sourceText: string; targetText: string; notes?: string }> = [];

        const asArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
        const termEntries = asArray(body?.termEntry);
        for (const te of termEntries) {
            const langSets = asArray(te?.langSet);
            if (langSets.length < 2) continue;
            const getTerm = (ls: any) => {
                const tig = asArray(ls?.tig)[0];
                const term = tig?.term ?? tig?.term?.text ?? tig?.text ?? '';
                return String(term || '').trim();
            };
            const s = getTerm(langSets[0]);
            const t = getTerm(langSets[1]);
            if (s && t) entries.push({ sourceText: s, targetText: t });
        }

        if (!entries.length) return { success: false, error: 'TBX 未检测到可导入的词条' };
        const { entries: normalizedEntries, duplicateCount } =
            normalizeAndDeduplicateDictionaryEntries(entries);
        const result = await importEntries(dictionaryId, normalizedEntries, 'append', {
            origin: 'import:tbx',
            userId: authCtx.userId,
            skipped: duplicateCount,
        });
        revalidatePath('/dashboard/dictionaries');
        return { success: true, count: result.inserted, skipped: result.skipped };
    } catch (e) {
        logger.error('TBX 导入失败:', e);
        return { success: false, error: 'TBX 导入失败' };
    }
}

// 批量导入词条（从前端已解析的数据分批提交，避免大文件 Buffer 传输和超时）
export async function bulkImportDictionaryEntriesAction(
    dictionaryId: string,
    entries: Array<{ sourceText: string; targetText: string; notes?: string }>,
    origin: 'import:xlsx' | 'import:tbx' | 'import:client' = 'import:client'
) {
    try {
        const authCtx = await requireUser();
        await requireWritableDictionary(dictionaryId, authCtx);
        if (!Array.isArray(entries) || entries.length === 0) {
            return { success: true, count: 0 };
        }

        const normalizedOrigin = normalizeDictionaryEntryOriginFilter(origin);
        if (!normalizedOrigin?.startsWith('import:')) throw new Error('无效的导入来源');
        const { entries: normalizedEntries, duplicateCount } =
            normalizeAndDeduplicateDictionaryEntries(entries);
        const result = await importEntries(dictionaryId, normalizedEntries, 'append', {
            origin: normalizedOrigin,
            userId: authCtx.userId,
            skipped: duplicateCount,
        });

        revalidatePath('/dashboard/dictionaries');
        return { success: true, count: result.inserted, skipped: result.skipped };
    } catch (e) {
        logger.error('批量导入失败:', e);
        return { success: false, error: '批量导入失败' };
    }
}

// —— Server Action：统一的导入入口（Excel/CSV/TBX + 模式） ——
type ParsedEntry = { sourceText: string; targetText: string; notes?: string };
type DictionaryImportMode = 'append' | 'overwrite' | 'upsert';

const DICTIONARY_ENTRY_WRITE_CHUNK_SIZE = 500;
const DICTIONARY_ENTRY_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 60_000 } as const;

function normalizeDictionaryImportMode(value: unknown): DictionaryImportMode {
    if (value === 'append' || value === 'overwrite' || value === 'upsert') return value;
    throw new Error('不支持的导入模式');
}

async function withLockedDictionary<T>(
    dictionaryId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
    return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const lockedDictionaries = await transaction.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
                SELECT id
                FROM "Dictionary"
                WHERE id = ${dictionaryId}
                FOR UPDATE
            `
        );
        if (lockedDictionaries.length !== 1) throw new Error('词库不存在');
        return callback(transaction);
    }, DICTIONARY_ENTRY_TRANSACTION_OPTIONS);
}

async function createEntriesInTransaction(
    transaction: Prisma.TransactionClient,
    dictionaryId: string,
    entries: ParsedEntry[],
    input: {
        origin: string | ((entry: ParsedEntry) => string);
        userId?: string;
        allowBlankTarget?: boolean;
    }
) {
    if (entries.length === 0) return 0;
    let created = 0;
    for (let start = 0; start < entries.length; start += DICTIONARY_ENTRY_WRITE_CHUNK_SIZE) {
        const chunk = entries.slice(start, start + DICTIONARY_ENTRY_WRITE_CHUNK_SIZE);
        const result = await transaction.dictionaryEntry.createMany({
            data: chunk.map(entry => ({
                dictionaryId,
                sourceText: entry.sourceText,
                targetText: entry.targetText,
                notes: entry.notes ?? null,
                origin: typeof input.origin === 'function' ? input.origin(entry) : input.origin,
                enabled: input.allowBlankTarget ? Boolean(entry.targetText) : true,
                createdById: input.userId,
                updatedById: input.userId,
            })),
        });
        if (result.count !== chunk.length) {
            throw new Error(`词条写入不完整：${result.count}/${chunk.length}`);
        }
        created += result.count;
    }
    return created;
}

async function findExistingEntryIdsInTransaction(
    transaction: Prisma.TransactionClient,
    dictionaryId: string,
    sourceTexts: string[]
) {
    const rows: Array<{ id: string; sourceText: string }> = [];
    for (let start = 0; start < sourceTexts.length; start += DICTIONARY_ENTRY_WRITE_CHUNK_SIZE) {
        const sourceChunk = sourceTexts.slice(start, start + DICTIONARY_ENTRY_WRITE_CHUNK_SIZE);
        rows.push(
            ...(await transaction.dictionaryEntry.findMany({
                where: { dictionaryId, sourceText: { in: sourceChunk } },
                select: { id: true, sourceText: true },
                orderBy: [{ sourceText: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            }))
        );
    }
    const bySource = new Map<string, string>();
    const duplicateSources = new Set<string>();
    for (const row of rows) {
        if (bySource.has(row.sourceText)) duplicateSources.add(row.sourceText);
        else bySource.set(row.sourceText, row.id);
    }
    if (duplicateSources.size > 0) {
        throw new Error('词库中存在历史重复原文，请先清理后再导入');
    }
    return bySource;
}

function mapHeaders(headers: string[]): {
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
} {
    const norm = (s: string) => s.trim().toLowerCase();
    let sourceKey: string | undefined;
    let targetKey: string | undefined;
    let notesKey: string | undefined;
    for (const h of headers) {
        const n = norm(h);
        if (!sourceKey && (n.includes('source') || n.includes('源') || n === 'src')) sourceKey = h;
        if (
            !targetKey &&
            (n.includes('target') || n.includes('译') || n.includes('目标') || n === 'tgt')
        )
            targetKey = h;
        if (
            !notesKey &&
            (n.includes('note') || n.includes('备注') || n.includes('说明') || n === 'notes')
        )
            notesKey = h;
    }
    if (!sourceKey && headers[0]) sourceKey = headers[0];
    if (!targetKey && headers[1]) targetKey = headers[1];
    return { sourceKey, targetKey, notesKey };
}

function parseExcelToEntries(
    buffer: Buffer,
    mapping?: { sourceKey?: string; targetKey?: string; notesKey?: string }
): ParsedEntry[] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : undefined;
    if (!firstSheetName) return [];
    const sheet = wb.Sheets[firstSheetName] as XLSX.WorkSheet;
    const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' }) : [];
    if (rows.length === 0) return [];
    const headers = Object.keys(rows[0] ?? {});
    const detected = mapHeaders(headers);
    const resolveHeader = (preferred?: string, fallback?: string) => {
        if (!preferred) return fallback;
        const normalizedPreferred = preferred.trim().toLowerCase();
        return (
            headers.find(header => header.trim().toLowerCase() === normalizedPreferred) || fallback
        );
    };
    const sourceKey = resolveHeader(mapping?.sourceKey, detected.sourceKey);
    const targetKey = resolveHeader(mapping?.targetKey, detected.targetKey);
    const notesKey = resolveHeader(mapping?.notesKey, detected.notesKey);
    const entries: ParsedEntry[] = [];
    for (const r of rows) {
        const source = (sourceKey ? String(r[sourceKey] ?? '') : '').trim();
        const target = (targetKey ? String(r[targetKey] ?? '') : '').trim();
        const notes = (notesKey ? String(r[notesKey] ?? '') : '').trim();
        if (!source || !target) continue;
        entries.push({ sourceText: source, targetText: target, notes: notes || undefined });
    }
    return entries;
}

function parseTBXToEntries(
    xml: string,
    preferredSource?: string,
    preferredTarget?: string
): ParsedEntry[] {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const json: any = parser.parse(xml);
    const tbx = json?.tbx || json?.TBX || json;
    const body = tbx?.text?.body || tbx?.body || json?.body || json?.text?.body;
    if (!body) return [];
    let termEntries: any[] = body.termEntry || body['termEntry'] || [];
    if (!Array.isArray(termEntries)) termEntries = [termEntries];
    const entries: ParsedEntry[] = [];
    for (const te of termEntries) {
        let langSets: any[] = te?.langSet || te?.['langSet'] || [];
        if (!Array.isArray(langSets)) langSets = [langSets];
        const normalized = langSets
            .map((ls: any) => {
                const lang: string = ls?.['@_xml:lang'] || ls?.['@_lang'] || '';
                const tig = ls?.tig || ls?.ntig || ls;
                const termVal = tig?.term || tig?.termGrp?.term || tig?.text;
                const term = Array.isArray(termVal) ? (termVal[0] ?? '') : termVal;
                return { lang: (lang || '').toLowerCase(), term: String(term || '').trim() };
            })
            .filter((x: any) => x.term);
        if (normalized.length < 2) continue;
        const pick = (code?: string) =>
            code ? normalized.find((x: any) => x.lang.startsWith(code.toLowerCase())) : undefined;
        let src = preferredSource ? pick(preferredSource) : undefined;
        let tgt = preferredTarget ? pick(preferredTarget) : undefined;
        if (!src || !tgt) {
            const langs: Record<string, any> = {};
            for (const x of normalized) if (!langs[x.lang]) langs[x.lang] = x;
            const keys = Object.keys(langs);
            if (!src && keys[0]) src = langs[keys[0]];
            if (!tgt && keys[1]) tgt = langs[keys[1]];
        }
        if (src?.term && tgt?.term) entries.push({ sourceText: src.term, targetText: tgt.term });
    }
    return entries;
}

async function importEntries(
    dictionaryId: string,
    entries: ParsedEntry[],
    mode: DictionaryImportMode,
    input: { origin: string; userId?: string; skipped?: number }
) {
    const initialSkipped = input.skipped ?? 0;
    if (entries.length === 0) return { inserted: 0, updated: 0, skipped: initialSkipped };

    return withLockedDictionary(dictionaryId, async transaction => {
        if (mode === 'overwrite') {
            await transaction.dictionaryEntry.deleteMany({ where: { dictionaryId } });
            const inserted = await createEntriesInTransaction(
                transaction,
                dictionaryId,
                entries,
                input
            );
            return { inserted, updated: 0, skipped: initialSkipped };
        }

        const existingBySource = await findExistingEntryIdsInTransaction(
            transaction,
            dictionaryId,
            entries.map(entry => entry.sourceText)
        );
        const newEntries = entries.filter(entry => !existingBySource.has(entry.sourceText));
        const inserted = await createEntriesInTransaction(
            transaction,
            dictionaryId,
            newEntries,
            input
        );

        if (mode === 'append') {
            return {
                inserted,
                updated: 0,
                skipped: initialSkipped + (entries.length - newEntries.length),
            };
        }

        let updated = 0;
        for (let start = 0; start < entries.length; start += DICTIONARY_ENTRY_WRITE_CHUNK_SIZE) {
            const chunk = entries.slice(start, start + DICTIONARY_ENTRY_WRITE_CHUNK_SIZE);
            await Promise.all(
                chunk.flatMap(entry => {
                    const id = existingBySource.get(entry.sourceText);
                    if (!id) return [];
                    updated += 1;
                    return [
                        transaction.dictionaryEntry.update({
                            where: { id },
                            data: {
                                targetText: entry.targetText,
                                notes: entry.notes ?? null,
                                origin: input.origin,
                                enabled: true,
                                updatedById: input.userId,
                            },
                        }),
                    ];
                })
            );
        }
        return { inserted, updated, skipped: initialSkipped };
    });
}

async function parseDictionaryImportFile(input: {
    file: File;
    sourceLang?: string;
    targetLang?: string;
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
}): Promise<ParsedEntry[]> {
    const { file, sourceLang, targetLang, sourceKey, targetKey, notesKey } = input;
    const name = (file as any).name || 'upload';
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    let entries: ParsedEntry[] = [];
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        entries = parseExcelToEntries(buf, { sourceKey, targetKey, notesKey });
    } else if (ext === 'tbx' || ext === 'xml') {
        entries = parseTBXToEntries(buf.toString('utf-8'), sourceLang, targetLang);
    } else {
        throw new DictionaryImportInputError('unsupportedFile');
    }
    if (entries.length === 0) {
        throw new DictionaryImportInputError('noValidEntries');
    }
    return entries;
}

export async function importDictionaryAction(input: {
    dictionaryId: string;
    mode?: 'upsert' | 'append' | 'overwrite';
    file: File;
    sourceLang?: string;
    targetLang?: string;
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
}) {
    try {
        const authCtx = await requireUser();
        await requireWritableDictionary(input.dictionaryId, authCtx);
        const parsedEntries = await parseDictionaryImportFile(input);
        const mode = normalizeDictionaryImportMode(input.mode ?? 'upsert');
        const { entries, duplicateCount } = normalizeAndDeduplicateDictionaryEntries(parsedEntries);
        const { inserted, updated, skipped } = await importEntries(
            input.dictionaryId,
            entries,
            mode,
            {
                origin: dictionaryImportOriginForFilename(input.file.name),
                userId: authCtx.userId,
                skipped: duplicateCount,
            }
        );
        revalidatePath('/dashboard/dictionaries');
        return {
            success: true,
            data: { inserted, updated, skipped, total: parsedEntries.length },
        };
    } catch (error) {
        logger.error('导入词库失败:', error);
        return {
            success: false,
            error:
                error instanceof GuardError
                    ? error.message
                    : dictionaryImportPublicErrorMessage(error),
        };
    }
}

export async function createDictionaryFromImportAction(input: {
    name: string;
    description?: string;
    domain: string;
    visibility: 'PRIVATE' | 'PROJECT';
    file: File;
    sourceLang?: string;
    targetLang?: string;
    sourceKey?: string;
    targetKey?: string;
    notesKey?: string;
}) {
    let authCtx: AuthContext;
    try {
        authCtx = await requireUser();
    } catch (error) {
        logger.error('创建并导入词库身份校验失败:', error);
        return {
            success: false,
            error:
                error instanceof GuardError
                    ? error.message
                    : dictionaryImportErrorMessage('failed'),
        };
    }
    if (input.visibility === 'PROJECT' && !authCtx.tenantId) {
        return { success: false, error: '当前账号未加入租户，无法创建项目词库' };
    }

    let parsedEntries: ParsedEntry[];
    try {
        parsedEntries = await parseDictionaryImportFile(input);
    } catch (error) {
        return {
            success: false,
            error: dictionaryImportPublicErrorMessage(error),
        };
    }

    let entries: ParsedEntry[];
    let duplicateCount = 0;
    try {
        const normalized = normalizeAndDeduplicateDictionaryEntries(parsedEntries);
        entries = normalized.entries;
        duplicateCount = normalized.duplicateCount;
    } catch (error) {
        return {
            success: false,
            error: dictionaryImportErrorMessage('failed'),
        };
    }

    let dictionary: { id: string };
    try {
        dictionary = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const created = await tx.dictionary.create({
                data: {
                    name: input.name,
                    description: input.description,
                    domain: input.domain,
                    visibility: input.visibility,
                    userId: authCtx.userId,
                    tenantId: authCtx.tenantId || undefined,
                },
            });
            const inserted = await tx.dictionaryEntry.createMany({
                data: entries.map(entry => ({
                    dictionaryId: created.id,
                    sourceText: entry.sourceText,
                    targetText: entry.targetText,
                    notes: entry.notes ?? null,
                    origin: dictionaryImportOriginForFilename(input.file.name),
                    enabled: true,
                    createdById: authCtx.userId,
                    updatedById: authCtx.userId,
                })),
            });
            if (inserted.count !== entries.length) {
                throw new Error(`仅写入 ${inserted.count}/${entries.length} 条词条`);
            }
            return created;
        });
    } catch (error) {
        logger.error('创建并导入词库失败，事务已回滚:', error);
        return { success: false, error: '导入词库失败，请检查文件后重试' };
    }

    try {
        revalidatePath('/dashboard/dictionaries');
    } catch (error) {
        logger.warn('词库已导入，但页面缓存刷新失败:', error);
    }
    return {
        success: true,
        data: {
            dictionaryId: dictionary.id,
            inserted: entries.length,
            updated: 0,
            skipped: duplicateCount,
            total: parsedEntries.length,
        },
    };
}

// 统一的词典查询（按可见范围：PUBLIC / PROJECT(projectId) / PRIVATE(userId)）
export async function queryDictionaryEntriesByScopeAction(
    term: string,
    opts?: { limit?: number; projectId?: string }
) {
    try {
        const authCtx = await requireUser();
        if (!term || !term.trim())
            return {
                success: true,
                data: [] as Array<{ term: string; translation: string; notes?: string }>,
            };
        const result = await queryDictionaryEntriesWithOwner(term, authCtx, opts);
        if (!result.success) {
            return { success: false, error: DICTIONARY_QUERY_UNAVAILABLE_MESSAGE } as const;
        }
        return result;
    } catch (error) {
        logger.error('词库范围检索失败:', error);
        return {
            success: false,
            error: publicActionErrorMessage(error, DICTIONARY_QUERY_UNAVAILABLE_MESSAGE),
        } as const;
    }
}

// 精确匹配：仅按源文精确等值匹配，减少“包含”带来的噪声
export async function queryDictionaryEntriesExactByScope(
    term: string,
    opts?: { limit?: number; projectId?: string }
) {
    try {
        const authCtx = await requireUser();
        const result = await queryDictionaryEntriesExactWithOwner(term, authCtx, opts);
        if (!result.success) {
            return { success: false, error: DICTIONARY_QUERY_UNAVAILABLE_MESSAGE } as const;
        }
        return result;
    } catch (error) {
        logger.error('词库精确范围检索失败:', error);
        return {
            success: false,
            error: publicActionErrorMessage(error, DICTIONARY_QUERY_UNAVAILABLE_MESSAGE),
        } as const;
    }
}

// 查找/创建：项目 + 用户 的私有词典
export async function findDictionaryByProjectUserAction(projectId: string, userId: string) {
    try {
        const authCtx = await requireUser();
        const project = await requireWritableProject(projectId, authCtx);
        const res = await findOrCreateDictionaryDB(project.id, {
            scope: 'PRIVATE',
            userId: authCtx.userId,
            tenantId: authCtx.tenantId || undefined,
        });
        try {
            revalidatePath('/dashboard/dictionaries');
        } catch {}
        return { success: true, data: { id: res.id, created: res.created } as const };
    } catch (e) {
        logger.error('查找/创建项目私有词典失败:', e);
        return { success: false, error: '查找/创建项目私有词典失败' };
    }
}

// 查找/创建：项目级词典（PROJECT 可见性，不绑定 userId）
export async function findProjectDictionaryAction(projectId: string) {
    try {
        const authCtx = await requireUser();
        const project = await requireWritableProject(projectId, authCtx);
        const res = await findOrCreateDictionaryDB(project.id, {
            scope: 'PROJECT',
            tenantId: authCtx.tenantId || undefined,
            userId: authCtx.userId,
        });
        try {
            revalidatePath('/dashboard/dictionaries');
        } catch {}
        return { success: true, data: { id: res.id, created: res.created } as const };
    } catch (e) {
        logger.error('查找/创建项目词典失败:', e);
        return { success: false, error: '查找/创建项目词典失败' };
    }
}

// 批量应用术语到词典（append/overwrite/upsert），若在他处已有译文则拷贝并启用
export async function bulkUpsertEntriesAction(input: {
    dictionaryId: string;
    projectId: string;
    terms: string[];
    mode?: 'append' | 'overwrite' | 'upsert';
    copyFromOthers?: boolean;
}) {
    try {
        const authCtx = await requireUser();
        const dictionaryId = input.dictionaryId;
        const projectId = input.projectId;
        const userId = authCtx.userId;
        await requireWritableProject(projectId, authCtx);
        await requireWritableDictionary(dictionaryId, authCtx);
        const copyFromOthers = input.copyFromOthers === true;
        const mode = normalizeDictionaryImportMode(input.mode ?? 'upsert');
        const { terms, skipped: inputSkipped } = normalizeDictionaryEntryTerms(input.terms || []);

        if (terms.length === 0) {
            return { success: true, data: { inserted: 0, updated: 0, skipped: inputSkipped } };
        }

        const buildCandMap = async (sourceList: string[]) => {
            if (!sourceList.length)
                return new Map<string, { targetText: string; notes: string | null }>();
            if (!copyFromOthers)
                return new Map<string, { targetText: string; notes: string | null }>();
            const cands = await findCandidateTranslationsForSourcesDB(
                sourceList,
                projectId,
                userId
            );
            if (!cands) throw new Error('无法读取可复用的候选译文');
            const candMap = new Map<string, { targetText: string; notes: string | null }>();
            for (const c of cands) {
                if (!candMap.has(c.sourceText))
                    candMap.set(c.sourceText, {
                        targetText: c.targetText,
                        notes: (c as any).notes ?? null,
                    });
            }
            return candMap;
        };

        // Candidate retrieval is deliberately outside the write transaction.
        // A failed read must abort before an overwrite can delete anything.
        const candidateMap = await buildCandMap(terms);
        const candidateEntries: ParsedEntry[] = terms.map(sourceText => {
            const candidate = candidateMap.get(sourceText);
            return {
                sourceText,
                targetText: candidate?.targetText || '',
                ...(candidate?.notes ? { notes: candidate.notes } : {}),
            };
        });

        const result = await withLockedDictionary(dictionaryId, async transaction => {
            if (mode === 'overwrite') {
                await transaction.dictionaryEntry.deleteMany({ where: { dictionaryId } });
                const inserted = await createEntriesInTransaction(
                    transaction,
                    dictionaryId,
                    candidateEntries,
                    {
                        origin: entry => (entry.targetText ? 'apply:copied' : 'apply:new'),
                        userId,
                        allowBlankTarget: true,
                    }
                );
                return { inserted, updated: 0, skipped: inputSkipped };
            }

            const existingBySource = await findExistingEntryIdsInTransaction(
                transaction,
                dictionaryId,
                terms
            );
            const entriesToCreate = candidateEntries.filter(
                entry => !existingBySource.has(entry.sourceText)
            );
            const inserted = await createEntriesInTransaction(
                transaction,
                dictionaryId,
                entriesToCreate,
                {
                    origin: entry => (entry.targetText ? 'apply:copied' : 'apply:new'),
                    userId,
                    allowBlankTarget: true,
                }
            );
            return {
                inserted,
                updated: 0,
                skipped: inputSkipped + (candidateEntries.length - entriesToCreate.length),
            };
        });

        return { success: true, data: result };
    } catch (e: unknown) {
        logger.error('批量应用术语失败:', e);
        return { success: false, error: '批量应用术语失败' };
    }
}

// 允许前端以 FormData 直接调用的 Server Action 入口
export async function importDictionaryFromFormAction(form: FormData) {
    'use server';
    try {
        await requireUser();
        const dictionaryId = String(form.get('dictionaryId') || '').trim();
        const mode = String(form.get('mode') || 'upsert')
            .trim()
            .toLowerCase() as 'append' | 'overwrite' | 'upsert';
        const sourceLang = String(form.get('sourceLang') || '').trim() || undefined;
        const targetLang = String(form.get('targetLang') || '').trim() || undefined;
        const file = form.get('file') as unknown as File;
        const sourceKey = String(form.get('sourceKey') || '').trim() || undefined;
        const targetKey = String(form.get('targetKey') || '').trim() || undefined;
        const notesKey = String(form.get('notesKey') || '').trim() || undefined;

        if (!dictionaryId) {
            return {
                success: false,
                error: dictionaryImportErrorMessage('missingDictionaryId'),
            } as const;
        }
        if (!(file instanceof File)) {
            return {
                success: false,
                error: dictionaryImportErrorMessage('missingFile'),
            } as const;
        }

        return await importDictionaryAction({
            dictionaryId,
            mode,
            file,
            sourceLang,
            targetLang,
            sourceKey,
            targetKey,
            notesKey,
        });
    } catch (error) {
        logger.error('导入词库表单提交失败:', error);
        return {
            success: false,
            error:
                error instanceof GuardError
                    ? error.message
                    : dictionaryImportErrorMessage('failed'),
        } as const;
    }
}
