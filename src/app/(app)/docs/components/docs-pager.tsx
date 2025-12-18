'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type DocsNavItem = { href: string; title: string };

export function DocsPager({ items }: { items: DocsNavItem[] }) {
    const pathname = usePathname();

    const normalized = (() => {
        if (!pathname) return '/';
        // strip locale prefix like /en or /zh if present
        let n = pathname.replace(/^\/(en|zh)(?=\/|$)/, '');
        if (n.length > 1 && n.endsWith('/')) n = n.slice(0, -1);
        return n || '/';
    })();

    const index = (() => {
        // exact match (ignore trailing slash on items)
        const exact = items.findIndex(it => {
            const href =
                it.href.length > 1 && it.href.endsWith('/') ? it.href.slice(0, -1) : it.href;
            return href === normalized;
        });
        if (exact !== -1) return exact;
        // longest prefix match for nested pages
        const candidates = items
            .map((it, i) => ({
                i,
                href: it.href.length > 1 && it.href.endsWith('/') ? it.href.slice(0, -1) : it.href,
            }))
            .filter(x => normalized.startsWith(x.href + '/'));
        if (candidates.length) {
            candidates.sort((a, b) => a.href.length - b.href.length);
            const last = candidates[candidates.length - 1];
            return typeof last?.i === 'number' ? last.i : -1;
        }
        return -1;
    })();

    if (index < 0) return null;

    const prev = index > 0 ? items[index - 1] : null;
    const next = index < items.length - 1 ? items[index + 1] : null;

    if (!prev && !next) return null;

    return (
        <div className="mt-4 border-t pt-5 text-xs sm:text-[13px]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {prev ? (
                    <Link
                        href={prev.href}
                        className="group flex max-w-[240px] items-center gap-1 rounded-md border bg-primary/5 px-2 py-1.5 hover:bg-primary/10 sm:justify-self-start"
                    >
                        <span className="text-muted-foreground">←</span>
                        <span className="truncate">{prev.title}</span>
                    </Link>
                ) : (
                    <span className="hidden sm:block" />
                )}
                {next ? (
                    <Link
                        href={next.href}
                        className="flex max-w-[240px] items-center gap-2 rounded-md border bg-primary/5 px-2 py-1.5 transition-colors hover:bg-primary/10 sm:justify-self-end"
                    >
                        <span className="truncate">{next.title}</span>
                        <span className="text-muted-foreground">→</span>
                    </Link>
                ) : null}
            </div>
        </div>
    );
}
