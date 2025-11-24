import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SidebarNav, type NavItem } from "./components/sidebar-nav";
import { DocsHeader } from "./components/docs-header";
import { DocsPager } from "./components/docs-pager";
import { OnThisPage } from "./components/on-this-page";
import { getDocsTranslations, getDocsT } from "./i18n";

export default async function LearnLayout({ children }: { children: ReactNode }) {
  const translations = await getDocsTranslations();
  const t = getDocsT(translations);
  
  const navItems: NavItem[] = [
    { href: "/docs", title: t("navigation.overview") },
    { href: "/docs/getting-started", title: t("navigation.gettingStarted") },
    { href: "/docs/installation", title: t("navigation.installation") },
    { href: "/docs/concepts", title: t("navigation.concepts") },
    { href: "/docs/workflows", title: t("navigation.workflows") },
    { href: "/docs/ui", title: t("navigation.ui") },
    { href: "/docs/server-actions", title: t("navigation.serverActions") },
    { href: "/docs/state", title: t("navigation.state") },
    { href: "/docs/ai", title: t("navigation.ai") },
    { href: "/docs/database", title: t("navigation.database") },
    { href: "/docs/troubleshooting", title: t("navigation.troubleshooting") },
    { href: "/docs/faq", title: t("navigation.faq") },
  ];
  return (
    <div className="w-full">
      <DocsHeader />
      <div className="h-10" /> {/* 占位，与 header 高度相同 */}
      {/* 顶部：移动端横向导航 */}
      <div className="border-b xl:hidden">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex gap-2 overflow-x-auto py-3 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-primary hover:bg-primary/10",
                )}
              >
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 主体：左侧和右侧靠边，中间内容居中 */}
      <div className="px-4">
        <div className="grid grid-cols-1 gap-6 py-6 xl:grid-cols-[240px_minmax(0,1fr)_240px]">
          <aside className="hidden xl:block">
            <SidebarNav items={navItems} />
          </aside>
          <main className="min-w-0 w-full">
            <div className="w-full max-w-7xl mx-auto">
              {children}
              <DocsPager items={navItems} />
            </div>
          </main>
          <OnThisPage />
        </div>
      </div>
    </div>
  );
}


