'use client';
import React from 'react';
import { type PropsWithChildren } from 'react';
import Header from './components/header';
import Sidebar from './components/sidebar';
import { useSidebar } from '@/hooks/useSidebar';
import { useSession } from 'next-auth/react';
import { useState, useEffect, useMemo } from 'react';
export default function DashboardLayout({ children }: PropsWithChildren) {
    const { data: session, status, update } = useSession();
    const { isSidebarOpen } = useSidebar();
    const interval = 15;
    useEffect(() => {
        console.log('客户端Layout Session状态:', status);
        //console.log("客户端Layout Session数据:", session);
        //console.log("客户端Layout 过期时间:",  session?.expires ? new Date(session.expires).toLocaleString() : "未设置");
    }, [session, status]);
    useEffect(() => {
        const timer = setInterval(() => {
            update(); // 手动更新 session
        }, interval * 1000);

        return () => clearInterval(timer);
    }, [interval, update]);
    return (
        <div className="fixed relative inset-0 overflow-hidden bg-gradient-to-br from-[#0f1020] via-[#11122a] to-[#0b0c1a]">
            {/* 背景装饰 - 渐变光晕 */}
            <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/40 via-purple-500/10 to-transparent blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/30 via-blue-400/10 to-transparent blur-3xl" />

            {/* 背景装饰 - 网格细线 */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
            {/* Header */}
            <div className="fixed left-0 right-0 top-0 z-50 h-10 bg-primary">
                <Header />
            </div>
            {/* Sidebar */}
            <div
                className={
                    isSidebarOpen
                        ? 'fixed bottom-1 left-0 top-10 z-40 mt-1 w-64 border-border/60 bg-card'
                        : 'fixed bottom-1 left-0 top-10 z-40 mt-1 w-16 rounded-r-md border-border/60 bg-transparent'
                }
            >
                <Sidebar />
            </div>

            {/* Content */}
            <div
                className={
                    isSidebarOpen
                        ? 'fixed bottom-1 left-64 right-0 top-10 z-30 ml-1 mt-1 overflow-auto border-l border-border/60 bg-transparent p-4'
                        : 'fixed bottom-1 left-16 right-0 top-10 z-30 ml-1 mt-1 overflow-auto border-l border-border/60 bg-transparent p-4'
                }
            >
                <div className="mt-4 flex items-center justify-center">
                    <div className="mx-auto w-full md:max-w-3xl lg:max-w-4xl xl:max-w-6xl">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
