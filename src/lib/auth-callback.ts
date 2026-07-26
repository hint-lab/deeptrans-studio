export type SearchParamValue = string | string[] | null | undefined;

const CALLBACK_BASE = 'https://www.deeptrans.studio';

export function firstSearchParam(value: SearchParamValue): string | undefined {
    return (Array.isArray(value) ? value[0] : value) ?? undefined;
}

export function normalizeInternalCallback(
    value: SearchParamValue,
    fallback = '/dashboard'
): string {
    const candidate = firstSearchParam(value);
    if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return fallback;

    try {
        const parsed = new URL(candidate, CALLBACK_BASE);
        if (parsed.origin !== CALLBACK_BASE) return fallback;
        if (parsed.pathname.startsWith('/api') || parsed.pathname.startsWith('/auth')) {
            return fallback;
        }
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return fallback;
    }
}

export function isDesktopCallback(callbackUrl: string): boolean {
    try {
        return new URL(callbackUrl, CALLBACK_BASE).searchParams.get('desktop') === '1';
    } catch {
        return false;
    }
}
