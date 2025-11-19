"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";

type HelpPanelProps = { src?: string };

// 组件方式渲染文档主体，并提供简单搜索
export default function HelpPanel({ src }: HelpPanelProps) {
    const locale = useLocale();
    const rawDefault = src || "/docs/getting-started";
    const ensureLocalePath = useCallback((href: string) => {
        if (!href) return `/${locale}/docs/getting-started`;
        // 如果已包含 locale，则替换为当前 locale
        const m = href.match(/^\/(\w[\w-]*)\/(.*)$/);
        if (m && m[2]?.startsWith('docs')) {
            return `/${locale}/${m[2]}`;
        }
        // 若以 /docs 开头则加上 locale 前缀
        if (href.startsWith('/docs')) return `/${locale}${href}`;
        // 其他相对路径，补全并加前缀
        return `/${locale}${href.startsWith('/') ? href : `/${href}`}`;
    }, [locale]);
    const stripLocalePath = useCallback((href: string = "/docs/getting-started") => {
        const m = href.match(/^\/(\w[\w-]*)\/(.*)$/);
        if (m && m[1] && m[2] && ["en", "zh"].includes(m[1])) return `/${m[2]}`;
        return href;
    }, []);
    const defaultPath = ensureLocalePath(rawDefault);
    const [currentPath, setCurrentPath] = useState<string>(defaultPath);
    const [html, setHtml] = useState<string>("<div class='p-3 text-xs text-foreground/70'>Loading...</div>");
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // 支持的文档入口（可按需扩展）
    const docEntries = useMemo(() => [
        "/docs/getting-started",
        "/docs/faq",
    ], []);

    const extractMainHtml = useCallback((fullHtml: string): string => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fullHtml, 'text/html');
            let container: Element | null = doc.querySelector('main');
            if (!container) container = doc.querySelector('article');
            if (!container) container = doc.body;
            // 移除站点头/脚导航等
            container.querySelectorAll('header,[role="banner"],nav,footer,[role="contentinfo"]').forEach(el => el.remove());
            // 清理可能的脚注或注入脚本
            container.querySelectorAll('script,style').forEach(el => el.remove());
            return container.innerHTML || '';
        } catch {
            return fullHtml;
        }
    }, []);

    const loadDoc = useCallback(async (path: string) => {
        try {
            setLoading(true);
            setError(null);
            // 优先尝试带 locale 的地址，不行再回退
            let target = ensureLocalePath(path);
            let res = await fetch(target, { headers: { 'Accept': 'text/html' } });
            if (!res.ok) {
                // 去掉语言前缀再试
                const stripped = stripLocalePath(path);
                target = stripped;
                res = await fetch(target, { headers: { 'Accept': 'text/html' } });
            }
            if (!res.ok) {
                // 最后回退到默认入口（无前缀）
                target = '/docs/getting-started';
                res = await fetch(target, { headers: { 'Accept': 'text/html' } });
            }
            if (!res.ok) throw new Error(`加载失败: ${res.status}`);
            const text = await res.text();
            const mainHtml = extractMainHtml(text);
            setHtml(mainHtml || '<div class="p-3 text-xs text-foreground/70">No content</div>');
        } catch (e: any) {
            setError(e?.message || String(e));
            setHtml('<div class="p-3 text-xs text-red-600">加载文档失败</div>');
        } finally {
            setLoading(false);
        }
    }, [extractMainHtml, ensureLocalePath, stripLocalePath]);

    useEffect(() => { loadDoc(currentPath); }, [currentPath, loadDoc]);

    // 拦截内容中的内部链接
    const onContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const anchor = (e.target as HTMLElement)?.closest?.('a');
        if (!anchor) return;
        const href = (anchor as HTMLAnchorElement).getAttribute('href') || '';
        if (!href) return;
        const isInternal = href.startsWith('/docs') || /^\/(\w[\w-]*)\/docs/.test(href);
        if (isInternal) {
            e.preventDefault();
            setCurrentPath(ensureLocalePath(href));
        }
    }, [ensureLocalePath]);

    // 简单搜索：在预定义文档中查找匹配
    const [query, setQuery] = useState<string>("");
    const [results, setResults] = useState<Array<{ path: string; title: string; snippet: string }>>([]);
    const doSearch = useCallback(async () => {
        if (!query.trim()) { setResults([]); return; }
        const q = query.trim().toLowerCase();
        const out: Array<{ path: string; title: string; snippet: string }> = [];
        for (const p of docEntries) {
            try {
                let target = ensureLocalePath(p);
                let resp = await fetch(target, { headers: { 'Accept': 'text/html' } });
                if (!resp.ok) {
                    target = p; // 回退到无 locale
                    resp = await fetch(target, { headers: { 'Accept': 'text/html' } });
                }
                if (!resp.ok) continue;
                const t = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(t, 'text/html');
                const main = doc.querySelector('main') || doc.querySelector('article') || doc.body;
                const textContent = (main?.textContent || '').replace(/\s+/g, ' ').trim();
                const idx = textContent.toLowerCase().indexOf(q);
                if (idx !== -1) {
                    const title = (doc.querySelector('h1')?.textContent || doc.title || p).trim();
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(textContent.length, idx + q.length + 40);
                    const snippet = `${textContent.slice(start, idx)}${textContent.slice(idx, idx + q.length)}${textContent.slice(idx + q.length, end)}`;
                    out.push({ path: ensureLocalePath(p), title, snippet });
                }
            } catch { }
        }
        setResults(out);
    }, [query, docEntries, ensureLocalePath]);

    return (
        <div className="w-full h-full flex flex-col">
            <div className="p-2 border-b">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
                        placeholder="搜索文档..."
                        className="w-full h-9 bg-background text-sm placeholder:text-muted-foreground pl-8 pr-16 rounded-md border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    />
                    {loading && (
                        <Loader2 className="absolute right-8 top-2.5 h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                    {query && (
                        <button
                            aria-label="清空"
                            className="absolute right-2.5 top-2.5 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted text-muted-foreground"
                            onClick={() => { setQuery(""); setResults([]); }}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
            {!!results.length && (
                <div className="p-2 border-b space-y-1 max-h-40 overflow-auto">
                    {results.map((r) => (
                        <div key={`${r.path}-${r.title}`} className="text-xs">
                            <a
                                href={r.path}
                                onClick={(e) => { e.preventDefault(); setCurrentPath(r.path); setResults([]); }}
                                className="font-medium text-foreground hover:underline"
                            >{r.title}</a>
                            <div className="text-foreground/70 line-clamp-2">{r.snippet}</div>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto" onClick={onContentClick}>
                {loading ? (
                    <div className="p-3 text-xs text-foreground/70">Loading...</div>
                ) : error ? (
                    <div className="p-3 text-xs text-red-600">{error}</div>
                ) : (
                    <div ref={contentRef} className="prose dark:prose-invert max-w-none p-3" dangerouslySetInnerHTML={{ __html: html }} />
                )}
            </div>
        </div>
    );
}


