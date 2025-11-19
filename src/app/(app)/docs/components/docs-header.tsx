"use client";
import Link from "next/link";
import { Search, Home} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeSelector } from "./theme-selector";
import LocaleSwitcher from "@/components/locale-switcher";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Image from "next/image";

export function DocsHeader({ onSearchChange }: { onSearchChange?: (q: string) => void }) {
  const t = useTranslations('Docs');
  const [q, setQ] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const paletteInputRef = useRef<HTMLInputElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const navItems = useMemo(() => [
    { href: "/docs", title: t("overview") },
    { href: "/docs/getting-started", title: t("gettingStarted") },
    { href: "/docs/installation", title: t("installation") },
    { href: "/docs/concepts", title: t("concepts") },
    { href: "/docs/workflows", title: t("workflows") },
    { href: "/docs/ui", title: t("ui") },
    { href: "/docs/server-actions", title: t("serverActions") },
    { href: "/docs/state", title: t("state") },
    { href: "/docs/ai", title: t("ai") },
    { href: "/docs/database", title: t("database") },
    { href: "/docs/troubleshooting", title: t("troubleshooting") },
    { href: "/docs/faq", title: t("faq") },
  ], [t]);

  const results = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return [] as { href: string; title: string }[];
    return navItems.filter((it) => it.title.toLowerCase().includes(keyword));
  }, [q, navItems]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setPaletteQuery((prev) => (prev || q));
        setPaletteOpen(true);
        setTimeout(() => paletteInputRef.current?.focus(), 0);
        return;
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [q]);
  const headerClass = "fixed top-0 z-30 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60";

  return (
    <header className={headerClass}>
      <div className="flex h-10 items-center gap-3 px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <Link href="/dashboard" scroll={false} className="flex items-center justify-center h-8 w-8 p-0 hover:bg-accent rounded-md transition-colors">
              <Home size="16" className="text-foreground" />
            </Link>
            <Link href="/dashboard" scroll={false} className="flex items-center">
              <span className="block dark:hidden">
                <Image src="/logo3.svg" alt="DeepTrans" width={50} height={20} priority className="h-6 w-auto" />
              </span>
              <span className="hidden dark:block">
                <Image src="/logo3_dark.svg" alt="DeepTrans" width={50} height={20} priority className="h-6 w-auto" />
              </span>
            </Link>
            <div className="flex items-center ml-3">
              <div className="h-4 w-px bg-border"></div>
              <Link href="/docs" scroll={false} className="text-lg font-bold tracking-tight hover:text-primary transition-colors ml-3">
                Docs
              </Link>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-48 md:w-72">
            <label className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  const v = e.target.value;
                  setQ(v);
                  onSearchChange?.(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = (results[0] ?? navItems.find(it => it.title.toLowerCase() === q.trim().toLowerCase()));
                    if (target) router.push(target.href);
                  }
                }}
                placeholder={t('searchPlaceholder')}
                className={
                  "h-7 w-full rounded-md bg-primary/5 pl-9 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:bg-primary/10 " +
                  (mounted ? "pr-16" : "pr-3")
                }
              />
              {mounted && (
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex select-none gap-1 text-[10px] text-muted-foreground">
                  <span className="rounded border bg-background px-1.5 py-0.5">⌘</span>
                  <span className="rounded border bg-background px-1.5 py-0.5">K</span>
                </span>
              )}
              {q && results.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-background shadow">
                  <ul className="max-h-64 overflow-auto py-1 text-sm">
                    {results.map((r) => (
                      <li key={r.href}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-primary/5"
                          onClick={() => router.push(r.href)}
                        >
                          {r.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </label>
          </div>
          <LocaleSwitcher />
          <ThemeSelector />
        </div>
        {paletteOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setPaletteOpen(false)}
              onMouseDown={() => setPaletteOpen(false)}
            />
            <div className="relative mt-24 w-full max-w-xl overflow-hidden rounded-lg border bg-background shadow-lg">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  ref={paletteInputRef}
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const kw = paletteQuery.trim().toLowerCase();
                      const list = navItems.filter(it => it.title.toLowerCase().includes(kw));
                      const target = (list[0] ?? navItems.find(it => it.title.toLowerCase() === kw));
                      if (target) {
                        setPaletteOpen(false);
                        router.push(target.href);
                      }
                    }
                    if (e.key === 'Escape') setPaletteOpen(false);
                  }}
                  placeholder={t('searchPlaceholder')}
                  className="h-11 w-full rounded-none border-0 bg-transparent pl-9 pr-3 text-sm outline-none ring-0 focus:border-0"
                />
              </div>
              <div className="max-h-80 overflow-auto border-t">
                <ul className="py-1 text-sm">
                  {(() => {
                    const kw = paletteQuery.trim().toLowerCase();
                    const list = kw ? navItems.filter(it => it.title.toLowerCase().includes(kw)) : navItems;
                    return list.map((r) => (
                      <li key={r.href}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-primary/5"
                          onClick={() => { setPaletteOpen(false); router.push(r.href); }}
                        >
                          {r.title}
                        </button>
                      </li>
                    ));
                  })()}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}


