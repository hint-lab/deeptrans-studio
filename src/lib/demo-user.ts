import { prisma } from '@/lib/db';
import { ensureUserTenant } from '@/lib/user-tenant';

export const DEMO_EMAIL = 'test@example.com';
export const DEMO_CODE = '123456';

export function isDemoAccount(email?: string | null) {
    return (
        String(email || '')
            .trim()
            .toLowerCase() === DEMO_EMAIL
    );
}

export async function ensureDemoUser() {
    const user = await prisma.user.upsert({
        where: { email: DEMO_EMAIL },
        update: { emailVerified: new Date() },
        create: {
            email: DEMO_EMAIL,
            name: 'Demo User',
            emailVerified: new Date(),
        },
    });

    await ensureUserTenant(user.id);
    return user;
}
