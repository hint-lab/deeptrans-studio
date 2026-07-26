'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';

const DESKTOP_STORAGE_KEY = 'deeptrans.desktop';

function hasDesktopQueryMarker() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('desktop') === '1') return true;

    const callbackUrl = params.get('callbackUrl');
    if (!callbackUrl) return false;

    try {
        return new URL(callbackUrl, window.location.origin).searchParams.get('desktop') === '1';
    } catch {
        return false;
    }
}

export function DesktopClientBridge() {
    const t = useTranslations('Desktop');

    useEffect(() => {
        let isDesktop = document.documentElement.dataset.deeptransDesktop === 'true';

        try {
            if (hasDesktopQueryMarker()) {
                window.localStorage.setItem(DESKTOP_STORAGE_KEY, '1');
            }
            isDesktop = isDesktop || window.localStorage.getItem(DESKTOP_STORAGE_KEY) === '1';
        } catch {
            // The Tauri initialization marker remains available if storage is blocked.
        }

        if (!isDesktop) return;

        document.documentElement.dataset.deeptransDesktop = 'true';

        const showOffline = () => toast.error(t('offline'), { id: 'desktop-connectivity' });
        const showOnline = () => toast.success(t('online'), { id: 'desktop-connectivity' });

        if (!window.navigator.onLine) showOffline();
        window.addEventListener('offline', showOffline);
        window.addEventListener('online', showOnline);

        return () => {
            window.removeEventListener('offline', showOffline);
            window.removeEventListener('online', showOnline);
        };
    }, [t]);

    return null;
}
