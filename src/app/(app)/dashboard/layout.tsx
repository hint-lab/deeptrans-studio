'use client';
import { useSidebar } from '@/hooks/useSidebar';
import { useEffect, useState, type PropsWithChildren } from 'react';
import Header from './components/header';
import Sidebar from './components/sidebar';
import { ProtectedSessionGuard } from '@/components/protected-session-guard';

const MOBILE_SIDEBAR_MEDIA_QUERY = '(max-width: 767px)';

export default function DashboardLayout({ children }: PropsWithChildren) {
    const { closeSidebar, isSidebarOpen } = useSidebar();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY);
        const closeWhenMobile = () => {
            if (mediaQuery.matches) {
                closeSidebar();
            }
        };

        closeWhenMobile();
        mediaQuery.addEventListener('change', closeWhenMobile);

        return () => mediaQuery.removeEventListener('change', closeWhenMobile);
    }, [closeSidebar]);

    const closeSidebarAfterMobileNavigation = () => {
        if (window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY).matches) {
            closeSidebar();
        }
    };

    const sidebarClass = isSidebarOpen
        ? 'fixed bottom-1 left-0 top-10 z-40 mt-1 w-64 border-border/60 bg-card max-md:bottom-0 max-md:mt-0 max-md:w-72 max-md:max-w-[calc(100vw-3rem)] max-md:shadow-xl max-md:transition-transform max-md:duration-200 max-md:ease-out'
        : 'fixed bottom-1 left-0 top-10 z-40 mt-1 w-16 rounded-r-md border-border/60 bg-transparent max-md:bottom-0 max-md:mt-0 max-md:w-72 max-md:max-w-[calc(100vw-3rem)] max-md:-translate-x-full max-md:transition-transform max-md:duration-200 max-md:ease-out';
    const contentClass = isSidebarOpen
        ? 'fixed bottom-1 left-64 right-0 top-10 z-30 ml-1 mt-1 overflow-auto border-l border-border/60 bg-transparent p-4 max-md:bottom-0 max-md:left-0 max-md:ml-0 max-md:mt-0 max-md:border-l-0 max-md:p-3'
        : 'fixed bottom-1 left-16 right-0 top-10 z-30 ml-1 mt-1 overflow-auto border-l border-border/60 bg-transparent p-4 max-md:bottom-0 max-md:left-0 max-md:ml-0 max-md:mt-0 max-md:border-l-0 max-md:p-3';

    if (!mounted) {
        return (
            <div className="fixed inset-0 overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
                <div className="fixed left-0 right-0 top-0 z-50 h-10 bg-background/95 backdrop-blur" />
                <div className={sidebarClass} />
                <div className={contentClass} />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
            <ProtectedSessionGuard />
            {/* Header */}
            <div className="fixed left-0 right-0 top-0 z-50 h-10 bg-primary">
                <Header />
            </div>
            {/* Sidebar */}
            <div className={sidebarClass}>
                <Sidebar onNavigate={closeSidebarAfterMobileNavigation} />
            </div>

            {isSidebarOpen ? (
                <button
                    type="button"
                    className="fixed inset-x-0 bottom-0 top-10 z-[35] bg-slate-950/35 md:hidden"
                    aria-label="Close navigation"
                    onClick={closeSidebar}
                />
            ) : null}

            {/* Content */}
            <div className={contentClass}>
                <div className="mt-4 flex items-center justify-center">
                    <div className="mx-auto w-full md:max-w-3xl lg:max-w-4xl xl:max-w-6xl">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
