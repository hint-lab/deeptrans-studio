'use client';
import { useSidebar } from '@/hooks/useSidebar';
import { useSession } from 'next-auth/react';
import { useEffect, useState, type PropsWithChildren } from 'react';
import Header from './components/header';
import Sidebar from './components/sidebar';
export default function DashboardLayout({ children }: PropsWithChildren) {
    const { status, update } = useSession();
    const { isSidebarOpen } = useSidebar();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // 页面变为可见时只刷新已登录会话，避免登录跳转期间触发无效 session fetch。
                if (status === "authenticated") {
                    update();
                }

            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [status, update]);

    const sidebarClass = isSidebarOpen
        ? 'fixed bottom-1 left-0 top-10 z-40 mt-1 w-64 border-border/60 bg-card'
        : 'fixed bottom-1 left-0 top-10 z-40 mt-1 w-16 rounded-r-md border-border/60 bg-transparent';
    const contentClass = isSidebarOpen
        ? 'fixed bottom-1 left-64 right-0 top-10 z-30 ml-1 mt-1 overflow-auto border-l border-border/60 bg-transparent p-4'
        : 'fixed bottom-1 left-16 right-0 top-10 z-30 ml-1 mt-1 overflow-auto border-l border-border/60 bg-transparent p-4';

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
            {/* Header */}
            <div className="fixed left-0 right-0 top-0 z-50 h-10 bg-primary">
                <Header />
            </div>
            {/* Sidebar */}
            <div className={sidebarClass}>
                <Sidebar />
            </div>

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
