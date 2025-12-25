import { auth } from '@/auth';
import { Toaster } from '@/components/ui/sonner';
import '@/styles/globals.css';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
// 导入TooltipProvider
import { TooltipProvider } from '@/components/ui/tooltip';
import { createLogger } from '@/lib/logger';
// 设置页面元数据
export const metadata: Metadata = {
    title: 'DeepTrans Studio App',
    description:
        'DeepTrans Studio, the best tool for translating professional documents to another language',
    icons: [{ rel: 'icon', url: '/favicon.ico' }],
};

// 强制此布局及其子树在 Node.js runtime 下运行，避免 Edge 环境引发的依赖问题
export const runtime = 'nodejs';

// 根布局组件
export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    const locale = await getLocale();
    const messages = await getMessages();
    // --- 1. 日志记录设置 ---
    const logger = createLogger({
        type: 'layout:root',
    }, {
        json: false,// 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    });
    logger.debug(
        'Server Page session过期时间:',
        session?.expires ? new Date(session.expires).toLocaleString() : '未设置'
    );
    return (
        <html lang={locale} suppressHydrationWarning className={`${GeistSans.variable}`}>
            <body>
                <SessionProvider session={session}>
                    <NextIntlClientProvider messages={messages} locale={locale}>
                        <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
                            {/* 使用时需要包裹在TooltipProvider中 */}
                            <TooltipProvider>{children}</TooltipProvider>
                        </NextThemeProvider>
                        <Toaster />
                    </NextIntlClientProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
