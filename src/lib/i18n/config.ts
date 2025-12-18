export const supportedLocales = ['zh', 'en'] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = 'zh';

/**
 * Resolve the best locale from cookies and headers.
 * Priority: cookie NEXT_LOCALE -> Accept-Language -> defaultLocale
 */
export function resolveRequestLocale(
    headersLike: { get(name: string): string | null },
    cookieStore: { get(name: string): { value: string } | undefined }
): AppLocale {
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
    if (cookieLocale && (supportedLocales as readonly string[]).includes(cookieLocale)) {
        return cookieLocale as AppLocale;
    }

    const acceptLanguage = headersLike.get('accept-language') ?? '';
    for (const part of acceptLanguage.split(',')) {
        const code = part.split(';')[0]?.trim().toLowerCase();
        if (!code) continue;
        const base = code.split('-')[0] ?? '';
        if ((supportedLocales as readonly string[]).includes(code)) return code as AppLocale;
        if ((supportedLocales as readonly string[]).includes(base)) return base as AppLocale;
    }
    return defaultLocale;
}
