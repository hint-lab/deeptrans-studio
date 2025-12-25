'use client';
import { cn } from 'src/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CreateProjectDialog } from './create-project-dialog';
import BottomSidebarCard from './bottom-sidebar-card';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    FileEdit,
    BookAIcon,
    GanttChartIcon,
    BookMarkedIcon,
    BookOpenIcon,
    FolderSymlink,
    UsersRoundIcon,
    LanguagesIcon,
    PackageIcon,
    MessageSquareIcon,
    FileTextIcon,
    Image as ImageIcon,
} from 'lucide-react';
import { useSidebar } from '@/hooks/useSidebar';
import { useTranslations } from 'next-intl';

export default function Sidebar() {
    const { isSidebarOpen } = useSidebar();
    const pathname = usePathname();
    const t = useTranslations('Dashboard');

    return (
        <div
            className={cn(
                'relative flex h-full flex-col space-y-4 pb-12',
                isSidebarOpen ? 'w-64' : 'w-16'
            )}
        >
            <div className="relative flex flex-col space-y-4 py-4">
                <div className="flex flex-col space-y-2 px-3 text-foreground">
                    <div className="pb-4">
                        <CreateProjectDialog triggerVariant="auto" />
                    </div>
                    <div className="h-[1px] items-center bg-gray-500" />

                    <Link
                        className={`link ${pathname === '/dashboard' ? 'active' : ''}`}
                        href="/dashboard"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2 pt-3',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <BookMarkedIcon size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('myProjects')}
                            </span>
                        </Button>
                    </Link>

                    <Link
                        className={`link ${pathname === '/dashboard/instant-translate' ? 'active' : ''}`}
                        href="/dashboard/instant-translate"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <LanguagesIcon size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('instantTranslate')}
                            </span>
                        </Button>
                    </Link>

                    <Link
                        className={`link ${pathname === '/dashboard/image-intelligence' ? 'active' : ''}`}
                        href="/dashboard/image-intelligence"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <ImageIcon size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('imageTranslate')}
                            </span>
                        </Button>
                    </Link>

                    <Link
                        className={`link ${pathname === '/dashboard/document-intelligence' ? 'active' : ''}`}
                        href="/dashboard/document-intelligence"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <FileTextIcon size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('documentTranslate')}
                            </span>
                        </Button>
                    </Link>

                    <Link
                        className={`link ${pathname === '/dashboard/dictionaries' ? 'active' : ''}`}
                        href="/dashboard/dictionaries"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <BookAIcon size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('dictionaries')}
                            </span>
                        </Button>
                    </Link>

                    <Link
                        className={`link ${pathname === '/dashboard/memories' ? 'active' : ''}`}
                        href="/dashboard/memories"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <FolderSymlink size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('translationMemory')}
                            </span>
                        </Button>
                    </Link>

                    {/* 模型管理入口已移除 */}

                    <Link className={`link ${pathname === '/docs' ? 'active' : ''}`} href="/docs">
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <BookOpenIcon size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('documentation')}
                            </span>
                        </Button>
                    </Link>

                    <Link
                        className={`link ${pathname === '/support' ? 'active' : ''}`}
                        href="https://github.com/hint-lab/deeptrans-studio"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full gap-2',
                                isSidebarOpen ? 'justify-start' : 'justify-center'
                            )}
                        >
                            <UsersRoundIcon size="16" />
                            <span className={isSidebarOpen ? 'inline' : 'hidden'}>
                                {t('community')}
                            </span>
                        </Button>
                    </Link>
                </div>
            </div>
            {/* <div className="absolute bottom-3 w-full">
        //考虑捐赠，项目进行不下去了
        <BottomSidebarCard />
      </div> */}
        </div>
    );
}
