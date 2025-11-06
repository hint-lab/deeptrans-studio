import { prisma } from '@/lib/db'
import { type TranslationMemory as PrismaTranslationMemory } from '@prisma/client'

export type TranslationMemory = PrismaTranslationMemory;

export type TranslationMemoryCreateInput = {
  name: string;
  description?: string | null;
  tenantId?: string | null;
  userId?: string | null; // 创建者
};

export type TranslationMemoryUpdateInput = Partial<{
  name: string;
  description: string | null;
  tenantId: string | null;
  userId: string | null; // 允许迁移归属
  updatedById: string | null;
}>;

// 创建
export const createTranslationMemoryDB = async (data: TranslationMemoryCreateInput): Promise<TranslationMemory> => {
  return prisma.translationMemory.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      tenantId: data.tenantId ?? null,
      userId: data.userId ?? null,
    }
  })
}

// 查找
export const findTranslationMemoryByIdDB = async (id: string): Promise<TranslationMemory | null> => {
  return prisma.translationMemory.findUnique({ where: { id } })
}

export const findTranslationMemoriesByTenantIdDB = async (tenantId: string): Promise<TranslationMemory[]> => {
  return prisma.translationMemory.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
}

export const findTranslationMemoriesByUserIdDB = async (userId: string): Promise<TranslationMemory[]> => {
  return prisma.translationMemory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
}

// 更新
export const updateTranslationMemoryByIdDB = async (id: string, data: TranslationMemoryUpdateInput): Promise<TranslationMemory> => {
  return prisma.translationMemory.update({ where: { id }, data: { ...data } as any })
}

// 删除
export const deleteTranslationMemoryByIdDB = async (id: string): Promise<TranslationMemory> => {
  return prisma.translationMemory.delete({ where: { id } })
}
