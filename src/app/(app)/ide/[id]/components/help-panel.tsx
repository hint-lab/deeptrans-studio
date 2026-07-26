'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Search, X, Loader2 } from 'lucide-react';
import { SanitizedHtml } from '@/components/sanitized-html';
import { isCurrentHelpPanelRequest } from '@/lib/help-panel-request';

type HelpPanelProps = { src?: string };

// 组件方式渲染文档主体，并提供简单搜索
export default function HelpPanel({ src }: HelpPanelProps) {
    const locale = useLocale();
    const t = useTranslations('IDE.helpPanel');
    const rawDefault = src || '/docs/getting-started';
    const ensureLocalePath = useCallback(
        (href: string) => {
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
        },
        [locale]
    );
    const stripLocalePath = useCallback((href: string = '/docs/getting-started') => {
        const m = href.match(/^\/(\w[\w-]*)\/(.*)$/);
        if (m && m[1] && m[2] && ['en', 'zh'].includes(m[1])) return `/${m[2]}`;
        return href;
    }, []);
    const defaultPath = ensureLocalePath(rawDefault);
    const [currentPath, setCurrentPath] = useState<string>(defaultPath);
    const [html, setHtml] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
    const docRequestIdRef = useRef(0);
    const searchRequestIdRef = useRef(0);
    const searchAbortRef = useRef<AbortController | null>(null);
    const currentPathRef = useRef(currentPath);
    currentPathRef.current = currentPath;

    useEffect(() => {
        // Keep the open article when the interface locale changes instead of
        // leaving an old-language route mounted in the side panel.
        setCurrentPath(path => ensureLocalePath(stripLocalePath(path)));
    }, [ensureLocalePath, stripLocalePath]);

    // 支持的文档入口（可按需扩展）
    const docEntries = useMemo(() => ['/docs/getting-started', '/docs/faq'], []);

    const extractMainHtml = useCallback((fullHtml: string): string => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fullHtml, 'text/html');
            let container: Element | null = doc.querySelector('main');
            if (!container) container = doc.querySelector('article');
            if (!container) container = doc.body;
            // 移除站点头/脚导航等
            container
                .querySelectorAll('header,[role="banner"],nav,footer,[role="contentinfo"]')
                .forEach(el => el.remove());
            // 清理可能的脚注或注入脚本
            container.querySelectorAll('script,style').forEach(el => el.remove());
            return container.innerHTML || '';
        } catch {
            return fullHtml;
        }
    }, []);

    useEffect(() => {
        const requestId = ++docRequestIdRef.current;
        const requestedPath = currentPath;
        const controller = new AbortController();
        const isCurrentRequest = () =>
            isCurrentHelpPanelRequest(
                requestId,
                docRequestIdRef.current,
                requestedPath,
                currentPathRef.current
            );

        const loadDoc = async () => {
            try {
                setLoading(true);
                setError(null);
                // 优先尝试带 locale 的地址，不行再回退
                let target = ensureLocalePath(requestedPath);
                let res = await fetch(target, {
                    headers: { Accept: 'text/html' },
                    signal: controller.signal,
                });
                if (!res.ok) {
                    // 去掉语言前缀再试
                    const stripped = stripLocalePath(requestedPath);
                    target = stripped;
                    res = await fetch(target, {
                        headers: { Accept: 'text/html' },
                        signal: controller.signal,
                    });
                }
                if (!res.ok) throw new Error(`加载失败: ${res.status}`);
                const text = await res.text();
                if (!isCurrentRequest()) return;
                const mainHtml = extractMainHtml(text);
                setHtml(mainHtml);
            } catch (error) {
                if (
                    isCurrentRequest() &&
                    !(error instanceof DOMException && error.name === 'AbortError')
                ) {
                    setHtml('');
                    setError(t('loadFailed'));
                }
            } finally {
                if (isCurrentRequest()) setLoading(false);
            }
        };

        void loadDoc();
        return () => controller.abort();
    }, [currentPath, reloadKey, ensureLocalePath, extractMainHtml, stripLocalePath, t]);

    const openDocument = useCallback(
        (path: string) => {
            // Clear the previous article synchronously with navigation. The
            // pending effect is invalidated before it can paint or overwrite
            // the new article with an older response.
            docRequestIdRef.current += 1;
            setLoading(true);
            setHtml('');
            setError(null);
            const nextPath = ensureLocalePath(path);
            if (nextPath === currentPathRef.current) {
                setReloadKey(value => value + 1);
                return;
            }
            setCurrentPath(nextPath);
        },
        [ensureLocalePath]
    );

    // 拦截内容中的内部链接
    const onContentClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const anchor = (e.target as HTMLElement)?.closest?.('a');
            if (!anchor) return;
            const href = (anchor as HTMLAnchorElement).getAttribute('href') || '';
            if (!href) return;
            const isInternal = href.startsWith('/docs') || /^\/(\w[\w-]*)\/docs/.test(href);
            if (isInternal) {
                e.preventDefault();
                openDocument(href);
            }
        },
        [openDocument]
    );

    // 简单搜索：在预定义文档中查找匹配
    const [query, setQuery] = useState<string>('');
    const [results, setResults] = useState<Array<{ path: string; title: string; snippet: string }>>(
        []
    );
    const doSearch = useCallback(async () => {
        const querySnapshot = query.trim();
        searchAbortRef.current?.abort();
        const requestId = ++searchRequestIdRef.current;
        if (!querySnapshot) {
            setResults([]);
            setSearchedQuery(null);
            setSearchError(null);
            setIsSearching(false);
            return;
        }
        const controller = new AbortController();
        searchAbortRef.current = controller;
        const q = querySnapshot.toLowerCase();
        const out: Array<{ path: string; title: string; snippet: string }> = [];
        let loadedAnyDocument = false;
        const isCurrentSearch = () =>
            isCurrentHelpPanelRequest(
                requestId,
                searchRequestIdRef.current,
                querySnapshot,
                query.trim()
            );

        setIsSearching(true);
        setSearchError(null);
        setSearchedQuery(querySnapshot);
        setResults([]);
        for (const p of docEntries) {
            try {
                let target = ensureLocalePath(p);
                let resp = await fetch(target, {
                    headers: { Accept: 'text/html' },
                    signal: controller.signal,
                });
                if (!resp.ok) {
                    target = p; // 回退到无 locale
                    resp = await fetch(target, {
                        headers: { Accept: 'text/html' },
                        signal: controller.signal,
                    });
                }
                if (!resp.ok) continue;
                loadedAnyDocument = true;
                const t = await resp.text();
                if (!isCurrentSearch()) return;
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
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') return;
            }
        }
        if (!isCurrentSearch()) return;
        setResults(out);
        setSearchError(loadedAnyDocument ? null : t('searchFailed'));
        setIsSearching(false);
    }, [query, docEntries, ensureLocalePath, t]);

    const clearSearch = () => {
        searchAbortRef.current?.abort();
        searchRequestIdRef.current += 1;
        setQuery('');
        setResults([]);
        setSearchedQuery(null);
        setSearchError(null);
        setIsSearching(false);
    };

    const handleQueryChange = (nextQuery: string) => {
        // A changed query makes any older search result misleading. Abort it
        // immediately instead of leaving the spinner/results to settle later.
        searchAbortRef.current?.abort();
        searchRequestIdRef.current += 1;
        setQuery(nextQuery);
        setResults([]);
        setSearchedQuery(null);
        setSearchError(null);
        setIsSearching(false);
    };

    return (
        <div className="flex h-full w-full flex-col">
            <div className="border-b bg-muted/20 p-2.5">
                <form
                    className="relative"
                    role="search"
                    onSubmit={event => {
                        event.preventDefault();
                        void doSearch();
                    }}
                >
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={e => handleQueryChange(e.target.value)}
                        placeholder={t('searchPlaceholder')}
                        aria-label={t('searchPlaceholder')}
                        className="h-9 w-full rounded-md border bg-background pl-8 pr-16 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    />
                    {(loading || isSearching) && (
                        <Loader2 className="absolute right-8 top-2.5 h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                    {query && (
                        <button
                            type="button"
                            aria-label={t('clearSearch')}
                            className="absolute right-2.5 top-2.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                            onClick={clearSearch}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </form>
            </div>
            {(results.length > 0 || searchError || (searchedQuery && !isSearching)) && (
                <div
                    className="max-h-40 space-y-1 overflow-auto border-b bg-background p-2"
                    aria-live="polite"
                >
                    {searchError && (
                        <p className="px-1 py-1 text-xs text-destructive">{searchError}</p>
                    )}
                    {!searchError && searchedQuery && !results.length && (
                        <p className="px-1 py-1 text-xs text-muted-foreground">
                            {t('noResults', { query: searchedQuery })}
                        </p>
                    )}
                    {results.map(r => (
                        <div key={`${r.path}-${r.title}`} className="text-xs">
                            <a
                                href={r.path}
                                onClick={e => {
                                    e.preventDefault();
                                    openDocument(r.path);
                                    clearSearch();
                                }}
                                className="font-medium text-foreground hover:underline"
                            >
                                {r.title}
                            </a>
                            <div className="line-clamp-2 text-foreground/70">{r.snippet}</div>
                        </div>
                    ))}
                </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto" onClick={onContentClick}>
                {loading ? (
                    <div className="p-3 text-xs text-muted-foreground" role="status">
                        {t('loading')}
                    </div>
                ) : error ? (
                    <div
                        className="m-3 flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
                        role="alert"
                    >
                        <p>{error}</p>
                        <button
                            type="button"
                            className="rounded-md border border-destructive/30 bg-background px-2 py-1 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => {
                                setLoading(true);
                                setError(null);
                                setHtml('');
                                setReloadKey(value => value + 1);
                            }}
                        >
                            {t('retry')}
                        </button>
                    </div>
                ) : !html ? (
                    <div className="p-3 text-xs text-muted-foreground">{t('noContent')}</div>
                ) : (
                    <SanitizedHtml
                        className="prose dark:prose-invert max-w-none p-3"
                        html={html}
                        profile="help"
                    />
                )}
            </div>
        </div>
    );
}
