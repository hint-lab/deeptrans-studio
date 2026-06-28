import { prisma } from '@/lib/db';

export async function ensureUserTenant(userId: string) {
    const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, tenantId: true },
    });
    if (!existing) throw new Error('用户不存在');
    if (existing.tenantId) return existing.tenantId;

    const label = existing.name || existing.email?.split('@')[0] || 'Default';
    const tenant = await prisma.tenant.create({
        data: {
            name: `${label} Workspace`,
            description: 'Default tenant created for user isolation',
            users: { connect: { id: existing.id } },
        },
        select: { id: true },
    });
    return tenant.id;
}
