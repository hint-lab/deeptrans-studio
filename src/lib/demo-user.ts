import { prisma } from '@/lib/db';
import { ensureUserTenant } from '@/lib/user-tenant';

export const DEMO_EMAIL = 'test@example.com';
export const DEMO_CODE = '123456';

type DemoEnvironment = Record<string, string | undefined>;

/**
 * The fixed demo credential exists only for the explicitly isolated demo
 * profile. Keeping the gate next to the account predicate makes it much
 * harder for an otherwise normal production account to accidentally bypass
 * SMTP verification.
 */
export function isDemoAccount(email?: string | null, env: DemoEnvironment = process.env) {
    return (
        env.IS_DEMO === 'yes' &&
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
