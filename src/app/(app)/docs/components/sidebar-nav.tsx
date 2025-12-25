'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface NavItem {
    href: string;
    title: string;
}

export function SidebarNav({ items }: { items: NavItem[] }) {
    const pathname = usePathname();
    return (
        <nav className="sticky top-0 flex max-h-screen flex-col gap-1 overflow-auto pr-2 text-sm">
            {items.map(item => {
                const isRoot = item.href === '/docs';
                const active = isRoot
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            'rounded-md px-3 py-2',
                            active
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                        )}
                    >
                        {item.title}
                    </Link>
                );
            })}
        </nav>
    );
}
