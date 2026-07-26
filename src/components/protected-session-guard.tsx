'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function currentCallbackPath() {
    const current = new URL(window.location.href);
    const isDesktop = document.documentElement.dataset.deeptransDesktop === 'true';
    if (isDesktop && !current.searchParams.has('desktop')) {
        current.searchParams.set('desktop', '1');
    }
    return `${current.pathname}${current.search}${current.hash}`;
}

export function ProtectedSessionGuard() {
    const router = useRouter();
    const { status, update } = useSession();

    useEffect(() => {
        if (status !== 'unauthenticated') return;

        const callbackUrl = currentCallbackPath();
        router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }, [router, status]);

    useEffect(() => {
        const refreshSession = () => {
            if (document.visibilityState === 'visible' && status === 'authenticated') {
                void update();
            }
        };

        window.addEventListener('focus', refreshSession);
        document.addEventListener('visibilitychange', refreshSession);

        return () => {
            window.removeEventListener('focus', refreshSession);
            document.removeEventListener('visibilitychange', refreshSession);
        };
    }, [status, update]);

    return null;
}
