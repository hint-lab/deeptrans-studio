'use client';

import { cn } from '@/lib/utils';
import { isCurrentDashboardSection } from '@/lib/dashboard-navigation';
import { CreateProjectDialog } from './create-project-dialog';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
    BookAIcon,
    BookMarkedIcon,
    BookOpenIcon,
    Building2Icon,
    FileTextIcon,
    FolderSymlink,
    Image as ImageIcon,
    LanguagesIcon,
    UsersRoundIcon,
} from 'lucide-react';
import { useSidebar } from '@/hooks/useSidebar';
import { useTranslations } from 'next-intl';

type NavigationItem = {
    href: string;
    icon: LucideIcon;
    label: string;
};

type SidebarProps = {
    onNavigate?: () => void;
};

export default function Sidebar({ onNavigate }: SidebarProps) {
    const { isSidebarOpen } = useSidebar();
    const pathname = usePathname();
    const t = useTranslations('Dashboard');
    const navigationItems: NavigationItem[] = [
        { href: '/dashboard', icon: BookMarkedIcon, label: t('myProjects') },
        { href: '/dashboard/instant-translate', icon: LanguagesIcon, label: t('instantTranslate') },
        { href: '/dashboard/image-intelligence', icon: ImageIcon, label: t('imageTranslate') },
        {
            href: '/dashboard/document-intelligence',
            icon: FileTextIcon,
            label: t('documentTranslate'),
        },
        { href: '/dashboard/dictionaries', icon: BookAIcon, label: t('dictionaries') },
        { href: '/dashboard/memories', icon: FolderSymlink, label: t('translationMemory') },
        { href: '/dashboard/tenant', icon: Building2Icon, label: t('tenantManagement') },
        { href: '/docs', icon: BookOpenIcon, label: t('documentation') },
    ];

    return (
        <aside
            id="dashboard-sidebar"
            className={cn(
                'relative flex h-full flex-col overflow-y-auto pb-12',
                isSidebarOpen ? 'w-64' : 'w-16'
            )}
        >
            <div className="px-3 py-4">
                <div className="pb-4">
                    <CreateProjectDialog triggerVariant="auto" />
                </div>
                <div className="h-px bg-border/80" />
            </div>

            <nav className="flex flex-col gap-1 px-3">
                {navigationItems.map(item => {
                    const active = isCurrentDashboardSection(pathname, item.href);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            prefetch={false}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            aria-label={item.label}
                            title={isSidebarOpen ? undefined : item.label}
                            className={cn(
                                'relative flex min-h-10 w-full items-center rounded-md px-2.5 text-sm font-medium outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                                isSidebarOpen ? 'justify-start gap-2.5' : 'justify-center',
                                active
                                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                        >
                            <Icon className="size-4 shrink-0" aria-hidden="true" />
                            <span className={isSidebarOpen ? 'truncate' : 'sr-only'}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}

                <a
                    href="https://github.com/hint-lab/deeptrans-studio"
                    target="_blank"
                    rel="noreferrer"
                    onClick={onNavigate}
                    aria-label={t('community')}
                    title={isSidebarOpen ? undefined : t('community')}
                    className={cn(
                        'flex min-h-10 w-full items-center rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        isSidebarOpen ? 'justify-start gap-2.5' : 'justify-center'
                    )}
                >
                    <UsersRoundIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span className={isSidebarOpen ? 'truncate' : 'sr-only'}>{t('community')}</span>
                </a>
            </nav>
        </aside>
    );
}
