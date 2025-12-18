import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import "@/styles/globals.css";
import { ThemeProvider as NextThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner"
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
// 导入TooltipProvider
import {
  TooltipProvider
} from "@/components/ui/tooltip";

// 设置页面元数据
export const metadata: Metadata = {
  title: "DeepTrans Studio App",
  description: "DeepTrans Studio, the best tool for translating professional documents to another language",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

// 强制此布局及其子树在 Node.js runtime 下运行，避免 Edge 环境引发的依赖问题
export const runtime = 'nodejs';


// 根布局组件
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();
  const messages = await getMessages();
  //console.log("服务端Session数据:", session);
  console.log("服务端过期时间:",  session?.expires ? new Date(session.expires).toLocaleString() : "未设置");
  return (
      <html lang={locale} suppressHydrationWarning className={`${GeistSans.variable}`}>
        <body>
          <SessionProvider session={session}>
            <NextIntlClientProvider messages={messages} locale={locale}>
              <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
                {/* 使用时需要包裹在TooltipProvider中 */}
                <TooltipProvider>
                  {children}
                </TooltipProvider>
              </NextThemeProvider>
              <Toaster />
            </NextIntlClientProvider>
          </SessionProvider>
        </body>
      </html>
  );
}
