import { prisma } from '@/lib/db';
import { type TranslationMemoryEntry as PrismaTranslationMemoryEntry } from '@prisma/client';

export type TranslationMemoryEntry = PrismaTranslationMemoryEntry;

export type TranslationMemoryEntryCreateInput = {
    memoryId: string;
    sourceText: string;
    targetText: string;
    sourceLang?: string | null;
    targetLang?: string | null;
    notes?: string | null;
    createdById?: string | null;
};

export type TranslationMemoryEntryUpdateInput = Partial<{
    sourceText: string;
    targetText: string;
    sourceLang: string | null;
    targetLang: string | null;
    notes: string | null;
    updatedById: string | null;
}>;

// 创建
export const createTranslationMemoryEntryDB = async (
    data: TranslationMemoryEntryCreateInput
): Promise<TranslationMemoryEntry> => {
    return prisma.translationMemoryEntry.create({
        data: {
            memoryId: data.memoryId,
            sourceText: data.sourceText,
            targetText: data.targetText,
            sourceLang: data.sourceLang ?? null,
            targetLang: data.targetLang ?? null,
            notes: data.notes ?? null,
            createdById: data.createdById ?? null,
        },
    });
};

// 查找
export const findTranslationMemoryEntryByIdDB = async (
    id: string
): Promise<TranslationMemoryEntry | null> => {
    return prisma.translationMemoryEntry.findUnique({ where: { id } });
};

export const findTranslationMemoryEntriesByMemoryIdDB = async (
    memoryId: string
): Promise<TranslationMemoryEntry[]> => {
    return prisma.translationMemoryEntry.findMany({
        where: { memoryId },
        orderBy: { createdAt: 'desc' },
    });
};

// 更新
export const updateTranslationMemoryEntryByIdDB = async (
    id: string,
    data: TranslationMemoryEntryUpdateInput
): Promise<TranslationMemoryEntry> => {
    return prisma.translationMemoryEntry.update({ where: { id }, data: { ...data } as any });
};

// 删除
export const deleteTranslationMemoryEntryByIdDB = async (
    id: string
): Promise<TranslationMemoryEntry> => {
    return prisma.translationMemoryEntry.delete({ where: { id } });
};
