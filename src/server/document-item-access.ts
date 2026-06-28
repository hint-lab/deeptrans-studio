import { prisma } from '@/lib/db';

export type DocumentItemOwner = {
    userId: string;
};

export async function findWritableDocumentItemForOwner(itemId: string, owner: DocumentItemOwner) {
    if (!itemId || !owner.userId) return null;
    return prisma.documentItem.findFirst({
        where: {
            id: itemId,
            document: {
                project: {
                    userId: owner.userId,
                },
            },
        },
        include: {
            document: true,
        },
    });
}

export async function canWriteDocumentItemForOwner(itemId: string, owner: DocumentItemOwner) {
    return !!(await findWritableDocumentItemForOwner(itemId, owner));
}
