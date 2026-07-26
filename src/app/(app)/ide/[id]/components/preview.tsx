'use client';

import { fetchDocumentPreviewByDocIdAction } from '@/actions/document';
import { getFileUrlAction } from '@/actions/upload';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { createLogger } from '@/lib/logger';
import {
    INITIAL_PREVIEW_DEPENDENCY_STATES,
    PREVIEW_DEPENDENCY_TIMEOUT_MS,
    PreviewTimeoutError,
    arePreviewDependenciesReady,
    getFailedPreviewDependencies,
    getPreviewDependencies,
    type PreviewDependency,
    type PreviewDependencyStates,
    type PreviewFileType,
    withPreviewTimeout,
} from '@/lib/preview-dependencies';
import {
    getPreviewRequestScope,
    isCurrentPreviewRequest,
    shouldClearPreview,
} from '@/lib/preview-request';
import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import React, { useEffect, useRef, useState } from 'react';
import { getContentByIdAction } from 'src/actions/document-item';

// --- 类型定义 ---
type FileType = PreviewFileType;

interface InteractiveParagraph {
    str: string;
    domElement: HTMLElement;
    // PDF 专用属性
    page?: number;
    lastBottom?: number;
    avgHeight?: number;
}

const logger = createLogger(
    {
        type: 'client:preview-card',
    },
    { json: false, pretty: false, colors: true }
);

// --- 资源配置 ---
const SCALE = 1.2;
const PDFJS_VERSION = '3.11.174';
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
const PDFJS_CMAP_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/cmaps/`;

const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const DOCX_JS_URL = 'https://unpkg.com/docx-preview@0.1.15/dist/docx-preview.js';

function isPreviewDependencyAvailable(dependency: PreviewDependency): boolean {
    if (typeof window === 'undefined') return false;
    const globals = window as any;
    if (dependency === 'pdfjs') return Boolean(globals.pdfjsLib?.getDocument);
    if (dependency === 'jszip') return Boolean(globals.JSZip);
    return Boolean(globals.JSZip && globals.docx?.renderAsync);
}

const PreviewCard: React.FC = () => {
    const t = useTranslations('IDE.preview');
    const { activeDocumentItem } = useActiveDocumentItem();
    const { explorerTabs } = useExplorerTabs();
    const params = useParams<{ id?: string | string[] }>();

    // 基础状态
    const [url, setUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState('');
    const [fileType, setFileType] = useState<FileType>('unknown');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Externally hosted preview dependencies are deliberately tracked per
    // format. A disconnected CDN must result in a recoverable UI state, not a
    // permanently visible loading skeleton.
    const [dependencyStates, setDependencyStates] = useState<PreviewDependencyStates>(
        INITIAL_PREVIEW_DEPENDENCY_STATES
    );
    const [dependencyRetry, setDependencyRetry] = useState(0);
    // 【核心状态】：存储所有可交互段落（不分文件类型）
    const [interactiveParagraphs, setInteractiveParagraphs] = useState<InteractiveParagraph[]>([]);
    const [textLines, setTextLines] = useState<string[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const textContainerRef = useRef<HTMLDivElement>(null);
    const activePreviewScopeRef = useRef<string | null>(null);
    const previewLoadRequestRef = useRef(0);
    const previewRenderRequestRef = useRef(0);
    const projectId = Array.isArray(params?.id) ? params.id[0] || '' : String(params?.id || '');
    const explorerProjectId = String(explorerTabs?.projectId || '');
    const isExplorerProjectCurrent = Boolean(projectId && explorerProjectId === projectId);
    const tabs = isExplorerProjectCurrent ? explorerTabs?.documentTabs ?? [] : [];
    const aid = (activeDocumentItem as any)?.id;
    const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
    const docId = (currentTab as any)?.id || '';
    const previewScope = getPreviewRequestScope(projectId, docId);
    const failedDependencies = getFailedPreviewDependencies(fileType, dependencyStates);
    const dependenciesReady = arePreviewDependenciesReady(fileType, dependencyStates);
    const dependencyFailure = failedDependencies.length > 0;

    const setDependencyState = (
        dependency: PreviewDependency,
        state: PreviewDependencyStates[PreviewDependency]
    ) => {
        setDependencyStates(previous =>
            previous[dependency] === state ? previous : { ...previous, [dependency]: state }
        );
    };

    const markDependencyReady = (dependency: PreviewDependency) => {
        setDependencyState(
            dependency,
            isPreviewDependencyAvailable(dependency) ? 'ready' : 'failed'
        );
    };

    // Start only the dependencies required for the detected document type.
    // A fresh document or an explicit retry can retry a previously failed CDN
    // script; an already available global is reused without another request.
    useEffect(() => {
        if (!url) return;
        const required = getPreviewDependencies(fileType);
        if (!required.length) return;

        setDependencyStates(previous => {
            let changed = false;
            const next = { ...previous };
            for (const dependency of required) {
                const nextState = isPreviewDependencyAvailable(dependency) ? 'ready' : 'loading';
                if (next[dependency] !== nextState) {
                    next[dependency] = nextState;
                    changed = true;
                }
            }
            return changed ? next : previous;
        });
    }, [url, fileType, dependencyRetry]);

    // `next/script` may not surface a network failure promptly. Bound every
    // pending external script so offline use cannot leave the panel loading.
    useEffect(() => {
        if (!url) return;
        const pending = getPreviewDependencies(fileType).filter(
            dependency => dependencyStates[dependency] === 'loading'
        );
        if (!pending.length) return;

        const timeout = window.setTimeout(() => {
            setDependencyStates(previous => {
                let changed = false;
                const next = { ...previous };
                for (const dependency of pending) {
                    if (next[dependency] === 'loading') {
                        next[dependency] = 'failed';
                        changed = true;
                    }
                }
                return changed ? next : previous;
            });
        }, PREVIEW_DEPENDENCY_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [url, fileType, dependencyRetry, dependencyStates]);

    useEffect(() => {
        if (!url || !dependencyFailure) return;
        setError(null);
        setLoading(false);
    }, [url, dependencyFailure]);

    // 1. 获取 URL 并通过预加载识别类型
    useEffect(() => {
        let activeObjectUrl: string | null = null;
        let isMounted = true;
        const requestId = ++previewLoadRequestRef.current;
        const downloadController = new AbortController();
        const isCurrentRequest = () =>
            isMounted &&
            isCurrentPreviewRequest(
                requestId,
                previewLoadRequestRef.current,
                previewScope || '',
                activePreviewScopeRef.current
            );

        if (shouldClearPreview(previewScope)) {
            activePreviewScopeRef.current = null;
            setLoading(false);
            setError(null);
            setUrl(null);
            setFileName('');
            setFileType('unknown');
            setInteractiveParagraphs([]);
            setTextLines([]);
            setDependencyStates({ ...INITIAL_PREVIEW_DEPENDENCY_STATES });
            containerRef.current?.replaceChildren();
            return () => {
                isMounted = false;
                downloadController.abort();
            };
        }

        const loadUrl = async () => {
            if (activePreviewScopeRef.current === previewScope && url) return;
            activePreviewScopeRef.current = previewScope;
            setLoading(true);
            setError(null);
            setInteractiveParagraphs([]);
            setTextLines([]);
            setUrl(null); // 切换不同文档时，先置空防止显示旧内容
            setFileName('');
            setFileType('unknown');
            setDependencyStates({ ...INITIAL_PREVIEW_DEPENDENCY_STATES });
            containerRef.current?.replaceChildren();
            try {
                const info = await fetchDocumentPreviewByDocIdAction(docId);
                if (!isCurrentRequest()) return;
                if (!info?.name) throw new Error('Missing preview file name');
                const r = await getFileUrlAction(String(info?.name));
                const fetchUrl = (r as any)?.data?.fileUrl || null;
                if (!isCurrentRequest()) return;
                logger.info('Fetched preview URL:', fetchUrl);
                if (!fetchUrl) {
                    setError(t('previewError'));
                    setLoading(false);
                    return;
                }

                const response = await fetch(fetchUrl, { signal: downloadController.signal });
                if (!response.ok) throw new Error(`Download failed: ${response.status}`);

                const blob = await response.blob();
                if (!isCurrentRequest()) return;
                const contentType = response.headers.get('content-type') || '';

                let detectedType: FileType = 'unknown';

                if (contentType.includes('application/pdf')) {
                    detectedType = 'pdf';
                } else if (
                    contentType.includes('wordprocessingml') ||
                    contentType.includes('msword')
                ) {
                    detectedType = 'docx';
                } else if (
                    contentType.startsWith('text/') ||
                    contentType.includes('json') ||
                    contentType.includes('javascript') ||
                    contentType.includes('xml')
                ) {
                    detectedType = 'text';
                }

                if (detectedType === 'unknown' || contentType === 'application/octet-stream') {
                    const buffer = await blob.slice(0, 4).arrayBuffer();
                    const header = new DataView(buffer);
                    const magic = header.getUint32(0, false);

                    if (magic === 0x25504446) detectedType = 'pdf';
                    else if (magic === 0x504b0304) detectedType = 'docx';
                    else {
                        const fileName = (
                            activeDocumentItem?.name ||
                            info?.name ||
                            ''
                        ).toLowerCase();
                        if (fileName.endsWith('.pdf')) detectedType = 'pdf';
                        else if (fileName.endsWith('.docx') || fileName.endsWith('.doc'))
                            detectedType = 'docx';
                        else detectedType = 'unknown';
                    }
                }

                activeObjectUrl = URL.createObjectURL(blob);
                setUrl(activeObjectUrl);
                setFileName(String(info?.name || activeDocumentItem?.name || 'document'));
                setFileType(detectedType);
                if (detectedType === 'unknown') setLoading(false);
            } catch (e) {
                // 仅当当前 docId 仍然匹配时才报错，防止切换后的报错干扰
                if (isCurrentRequest() && !(e instanceof DOMException && e.name === 'AbortError')) {
                    logger.error('Failed to load/detect document', e);
                    setError(t('previewError'));
                    setLoading(false);
                }
            }
        };

        loadUrl();

        return () => {
            isMounted = false;
            downloadController.abort();
            if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
        };
    }, [docId, previewScope, t]);

    // 2. 核心渲染分发器
    useEffect(() => {
        const requestId = ++previewRenderRequestRef.current;
        if (!url || dependencyFailure || !dependenciesReady) return;
        const isCurrentRender = () => requestId === previewRenderRequestRef.current;

        // --- A. PDF 渲染逻辑 ---
        if (fileType === 'pdf' && containerRef.current) {
            let isCancelled = false;
            let loadingTask: any;
            const renderPDF = async () => {
                try {
                    const pdfjsLib = (window as any).pdfjsLib;
                    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
                    loadingTask = pdfjsLib.getDocument({
                        url,
                        cMapUrl: PDFJS_CMAP_URL,
                        cMapPacked: true,
                    });
                    const pdfDoc: any = await withPreviewTimeout<any>(loadingTask.promise);

                    if (isCancelled || !isCurrentRender()) return;
                    const renderHost = document.createElement('div');

                    const paragraphs: InteractiveParagraph[] = [];
                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        if (isCancelled || !isCurrentRender()) return;
                        await renderPagePDF(pdfDoc, i, paragraphs, renderHost, () =>
                            !isCancelled && isCurrentRender()
                        );
                    }
                    if (!isCancelled && isCurrentRender()) {
                        containerRef.current?.replaceChildren(...Array.from(renderHost.childNodes));
                        setInteractiveParagraphs(paragraphs);
                        setLoading(false);
                    }
                } catch (err: any) {
                    if (!isCancelled && isCurrentRender()) {
                        if (err instanceof PreviewTimeoutError) {
                            setDependencyStates(previous => ({ ...previous, pdfjs: 'failed' }));
                            setError(null);
                        } else {
                            setError(t('previewError'));
                        }
                        setLoading(false);
                    }
                }
            };
            renderPDF();
            return () => {
                isCancelled = true;
                loadingTask?.destroy?.();
            };
        }

        // --- B. DOCX 渲染逻辑 (增强版) ---
        else if (fileType === 'docx' && containerRef.current) {
            let isCancelled = false;
            const docxController = new AbortController();
            const renderDocx = async () => {
                try {
                    const res = await fetch(url, { signal: docxController.signal });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    if (isCancelled || !isCurrentRender()) return;

                    if (containerRef.current) {
                        const renderHost = document.createElement('div');
                        await withPreviewTimeout(
                            Promise.resolve(
                                (window as any).docx.renderAsync(blob, renderHost, null, {
                                    className: 'docx-wrapper',
                                    inWrapper: true,
                                    ignoreWidth: false,
                                    experimental: true,
                                })
                            )
                        );
                        if (isCancelled || !isCurrentRender()) return;

                        // 【DOCX 核心增强】：渲染后注入交互 DOM
                        const elements = renderHost.querySelectorAll(
                            '.docx-wrapper p, .docx-wrapper h1, .docx-wrapper h2, .docx-wrapper h3, .docx-wrapper h4'
                        );
                        const paragraphs: InteractiveParagraph[] = [];

                        elements.forEach(el => {
                            const htmlEl = el as HTMLElement;
                            // 注入交互样式：增加内边距和圆角，让高亮更像一个“块”
                            // border-transparent 用于占位，防止高亮时布局抖动
                            htmlEl.classList.add(
                                'cursor-pointer',
                                'transition-all',
                                'duration-200',
                                'border-2',
                                'border-transparent',
                                'hover:bg-blue-500/10',
                                'rounded-sm',
                                'px-1',
                                '-mx-1' // 微调负边距，让背景色稍微扩出去一点，视觉更好
                            );

                            if (htmlEl.innerText.trim().length > 0) {
                                paragraphs.push({
                                    str: htmlEl.innerText,
                                    domElement: htmlEl,
                                });
                            }
                        });
                        if (isCancelled || !isCurrentRender()) return;
                        containerRef.current?.replaceChildren(...Array.from(renderHost.childNodes));
                        setInteractiveParagraphs(paragraphs);
                    }
                    if (!isCancelled && isCurrentRender()) setLoading(false);
                } catch (err: any) {
                    if (!isCancelled && isCurrentRender()) {
                        if (err instanceof PreviewTimeoutError) {
                            setDependencyStates(previous => ({ ...previous, docx: 'failed' }));
                            setError(null);
                        } else {
                            setError(t('previewError'));
                        }
                        setLoading(false);
                    }
                }
            };
            renderDocx();
            return () => {
                isCancelled = true;
                docxController.abort();
            };
        }

        // --- C. Text 渲染逻辑 ---
        else if (fileType === 'text') {
            let isCancelled = false;
            const textController = new AbortController();
            const renderText = async () => {
                try {
                    const res = await fetch(url, { signal: textController.signal });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const text = await res.text();
                    if (isCancelled || !isCurrentRender()) return;
                    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                    setTextLines(lines);
                    setLoading(false);
                } catch (err: any) {
                    if (
                        !isCancelled &&
                        isCurrentRender() &&
                        !(err instanceof DOMException && err.name === 'AbortError')
                    ) {
                        setError(t('previewError'));
                        setLoading(false);
                    }
                }
            };
            renderText();
            return () => {
                isCancelled = true;
                textController.abort();
            };
        }
    }, [url, fileType, dependenciesReady, dependencyFailure, t]);

    // 2.1 文本模式 DOM 收集
    useEffect(() => {
        if (fileType === 'text' && textLines.length > 0 && textContainerRef.current) {
            const elements = textContainerRef.current.querySelectorAll('.text-paragraph');
            const paragraphs: InteractiveParagraph[] = [];
            elements.forEach(el => {
                const htmlEl = el as HTMLElement;
                paragraphs.push({
                    str: htmlEl.innerText,
                    domElement: htmlEl,
                });
            });
            setInteractiveParagraphs(paragraphs);
        }
    }, [textLines, fileType]);

    // 3. 通用自动定位
    useEffect(() => {
        if (interactiveParagraphs.length === 0 || !activeDocumentItem?.id) return;

        let isMounted = true;
        const locate = async () => {
            try {
                const docItem = await getContentByIdAction(activeDocumentItem.id);
                if (!isMounted) return;
                const activeText = docItem?.sourceText;
                if (!activeText) return;

                const matchIndices = findMatches(activeText, interactiveParagraphs);
                if (matchIndices.length > 0) {
                    highlightAndScroll(matchIndices);
                }
            } catch (err) {
                /* ignore */
            }
        };
        locate();
        return () => {
            isMounted = false;
        };
    }, [activeDocumentItem?.id, interactiveParagraphs]);

    /* ================= 关键修复：支持中文的匹配算法 ================= */

    // 清洗文本：替换所有“非字母、非数字、非汉字”的字符为空
    // 之前是 /[^a-zA-Z0-9]/g，这会导致中文被删光，从而无法匹配
    const normalize = (s: string) => {
        // 使用 Unicode Property Escapes 匹配所有语言的字母和数字
        // \p{L} = Any Letter, \p{N} = Any Number
        // 如果浏览器不支持，回退到简单的去除空白符
        try {
            return s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
        } catch (e) {
            // 回退方案：只去除非单词字符（可能不完美，但比删光中文好）
            return s.replace(/\s+/g, '').toLowerCase();
        }
    };

    const findMatches = (activeMdText: string, paragraphs: InteractiveParagraph[]): number[] => {
        const mdClean = normalize(activeMdText);
        const matches: number[] = [];
        // 中文环境下 3 个字符可能太短，但为了兼容英文，保持不变，或者根据内容调整
        if (mdClean.length < 2) return matches;

        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            if (!p) continue;
            const pdfClean = normalize(p.str);
            if (pdfClean.length < 2) continue;

            // 1. 精确匹配
            if (mdClean === pdfClean) {
                matches.push(i);
                continue;
            }
            // 2. 包含匹配 (MD 包含 DOCX 段落，常见于 MD 把 DOCX 的多行合并了)
            if (mdClean.includes(pdfClean) && pdfClean.length > 10) {
                matches.push(i);
                continue;
            }
            // 3. 反向包含 (DOCX 段落包含 MD，常见于 MD 是摘录)
            if (pdfClean.includes(mdClean) && mdClean.length > 5) {
                matches.push(i);
                continue;
            }
            // 4. 前缀匹配 (标题)
            if (pdfClean.length < 50 && mdClean.startsWith(pdfClean)) {
                matches.push(i);
                continue;
            }
        }
        return matches;
    };

    const highlightAndScroll = (indices: number[]) => {
        // 清除旧高亮
        document.querySelectorAll('.active-highlight').forEach(el => {
            el.classList.remove('active-highlight', 'bg-blue-500/25', 'border-blue-700', 'z-[100]');

            // 恢复默认状态
            if (el.classList.contains('absolute')) {
                // PDF 恢复淡蓝
                el.classList.add('border-blue-500/20', 'bg-blue-500/5');
                el.classList.remove('border-blue-700');
            } else {
                // DOCX/Text 恢复透明
                el.classList.add('border-transparent');
                el.classList.remove('border-blue-700', 'border-2'); // 确保移除边框颜色
            }
        });

        // 添加新高亮
        indices.forEach(index => {
            const target = interactiveParagraphs[index];
            if (target && target.domElement) {
                const el = target.domElement;

                // 移除默认状态
                el.classList.remove('border-blue-500/20', 'bg-blue-500/5', 'border-transparent');

                // 添加高亮状态
                // 注意：DOCX 元素是块级元素，bg-blue-500/25 会填充整个背景
                el.classList.add(
                    'active-highlight',
                    'bg-blue-500/25',
                    'border-blue-700',
                    'z-[100]'
                );

                // 确保 DOCX 元素有边框宽度
                if (!el.classList.contains('absolute')) {
                    el.classList.add('border-2');
                }
            }
        });

        // 滚动
        if (indices.length > 0) {
            const firstIndex = indices[0];
            if (firstIndex !== undefined) {
                const firstTarget = interactiveParagraphs[firstIndex];
                if (firstTarget?.domElement) {
                    firstTarget.domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    };

    /* ================= PDF 专用渲染 ================= */
    const renderPagePDF = async (
        pdfDoc: any,
        pageNum: number,
        paragraphs: InteractiveParagraph[],
        renderHost: HTMLElement,
        isCurrentRender: () => boolean
    ) => {
        if (!isCurrentRender()) return;
        const page = await pdfDoc.getPage(pageNum);
        if (!isCurrentRender()) return;
        const viewport = page.getViewport({ scale: SCALE });
        const pdfjsLib = (window as any).pdfjsLib;

        const wrapper = document.createElement('div');
        wrapper.className = 'relative shadow-md bg-white mb-4 mx-auto';
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'absolute inset-0 z-10';

        wrapper.appendChild(canvas);
        wrapper.appendChild(textLayerDiv);
        renderHost.appendChild(wrapper);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        if (!isCurrentRender()) return;
        const textContent = await page.getTextContent();
        if (!isCurrentRender()) return;

        const items = textContent.items
            .map((item: any) => {
                const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
                return {
                    str: item.str,
                    x: tx[4],
                    y: tx[5] - fontHeight,
                    width: item.width * SCALE,
                    height: fontHeight,
                    isBlank: item.str.trim().length === 0,
                };
            })
            .filter((item: any) => !item.isBlank && item.width > 2);

        items.sort((a: any, b: any) => (Math.abs(a.y - b.y) < 5 ? a.x - b.x : a.y - b.y));

        let currentP: any = null;
        const pageParas: any[] = [];
        items.forEach((item: any) => {
            if (!currentP) {
                currentP = { ...item, lastBottom: item.y + item.height, avgHeight: item.height };
            } else {
                const fontSizeDiff = Math.abs(item.height - currentP.avgHeight);
                const vGap = item.y - currentP.lastBottom;
                const xDiff = Math.abs(item.x - currentP.x);
                const isSpecial = /^(Figure|Table|Abstract|\d\s+[A-Z])/.test(item.str);

                if (
                    fontSizeDiff > 1.5 ||
                    vGap > item.height * 0.6 ||
                    (xDiff > item.height * 4 && vGap > 0) ||
                    isSpecial
                ) {
                    pageParas.push(currentP);
                    currentP = {
                        ...item,
                        lastBottom: item.y + item.height,
                        avgHeight: item.height,
                    };
                } else {
                    currentP.str += ' ' + item.str;
                    currentP.width = Math.max(currentP.width, item.x + item.width - currentP.x);
                    currentP.height = Math.max(currentP.height, item.y + item.height - currentP.y);
                    currentP.lastBottom = item.y + item.height;
                }
            }
        });
        if (currentP) pageParas.push(currentP);

        pageParas.forEach(p => {
            const div = document.createElement('div');
            div.className =
                'absolute cursor-pointer border border-blue-500/20 bg-blue-500/5 rounded transition-all duration-100 hover:border-blue-500/80 hover:bg-blue-500/10 hover:z-50';
            div.style.left = `${p.x}px`;
            div.style.top = `${p.y}px`;
            div.style.width = `${p.width}px`;
            div.style.height = `${p.height}px`;
            paragraphs.push({ str: p.str, page: pageNum, domElement: div });
            textLayerDiv.appendChild(div);
        });
    };

    const retryScriptSource = (source: string) => {
        if (!dependencyRetry) return source;
        const separator = source.includes('?') ? '&' : '?';
        return `${source}${separator}deeptransPreviewRetry=${dependencyRetry}`;
    };

    const handleDownload = () => {
        if (!url) return;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName || `document.${fileType === 'docx' ? 'docx' : 'pdf'}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };
    const handleOpenNew = () => url && window.open(url, '_blank', 'noopener,noreferrer');
    const handleRetryDependencies = () => {
        if (!url) return;
        setError(null);
        setLoading(true);
        setDependencyStates(previous => {
            const next = { ...previous };
            for (const dependency of getPreviewDependencies(fileType)) {
                if (next[dependency] !== 'ready') next[dependency] = 'loading';
            }
            return next;
        });
        setDependencyRetry(previous => previous + 1);
    };
    const dependencyLabel = (dependency: PreviewDependency) => {
        if (dependency === 'pdfjs') return 'PDF.js';
        if (dependency === 'jszip') return 'JSZip';
        return 'docx-preview';
    };
    const previewFormat = fileType === 'pdf' ? t('pdfFormat') : t('docxFormat');
    const failedDependencyLabels = failedDependencies.map(dependencyLabel).join(', ');

    return (
        <div className="relative flex size-full flex-col rounded-tl-md bg-background">
            {url && fileType === 'pdf' && dependencyStates.pdfjs === 'loading' && (
                <Script
                    key={`pdfjs-${dependencyRetry}`}
                    src={retryScriptSource(PDFJS_URL)}
                    strategy="afterInteractive"
                    onLoad={() => markDependencyReady('pdfjs')}
                    onError={() => setDependencyState('pdfjs', 'failed')}
                />
            )}
            {url && fileType === 'docx' && dependencyStates.jszip === 'loading' && (
                <Script
                    key={`jszip-${dependencyRetry}`}
                    src={retryScriptSource(JSZIP_URL)}
                    strategy="afterInteractive"
                    onLoad={() => markDependencyReady('jszip')}
                    onError={() => setDependencyState('jszip', 'failed')}
                />
            )}
            {url &&
                fileType === 'docx' &&
                dependencyStates.jszip === 'ready' &&
                dependencyStates.docx === 'loading' && (
                    <Script
                        key={`docx-preview-${dependencyRetry}`}
                        src={retryScriptSource(DOCX_JS_URL)}
                        strategy="afterInteractive"
                        onLoad={() => markDependencyReady('docx')}
                        onError={() => setDependencyState('docx', 'failed')}
                    />
                )}

            <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1 text-[11px] text-foreground/70">
                <span className="flex items-center gap-2 font-medium">
                    {fileType === 'pdf' && (
                        <span className="rounded border border-red-200 bg-red-50 px-1 text-[10px] font-bold text-red-500">
                            PDF
                        </span>
                    )}
                    {fileType === 'docx' && (
                        <span className="rounded border border-blue-200 bg-blue-50 px-1 text-[10px] font-bold text-blue-600">
                            DOCX
                        </span>
                    )}
                    {fileType === 'text' && (
                        <span className="rounded border border-gray-200 bg-gray-50 px-1 text-[10px] font-bold text-gray-600">
                            TXT
                        </span>
                    )}
                    {t('title')}
                </span>
                <div className="flex items-center gap-1">
                    <Button
                        className="h-7 border-0 bg-transparent px-2 text-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                        onClick={handleDownload}
                        disabled={!url}
                        aria-label={t('downloadPreviewAria')}
                        title={t('downloadPreviewAria')}
                    >
                        <Download className="h-3 w-3" />
                    </Button>
                    <Button
                        className="h-7 border-0 bg-transparent px-2 text-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                        onClick={handleOpenNew}
                        disabled={!url}
                        aria-label={t('openPreviewAria')}
                        title={t('openPreviewAria')}
                    >
                        <ExternalLink className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-gray-100 p-4" id="pdf-scroll-container">
                {dependencyFailure ? (
                    <div
                        className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-950"
                        role="alert"
                    >
                        <FileText className="h-8 w-8 opacity-70" />
                        <div className="space-y-1">
                            <p className="font-medium">{t('dependencyUnavailableTitle')}</p>
                            <p className="text-amber-900/85">
                                {t('dependencyUnavailableDescription', { format: previewFormat })}
                            </p>
                            <p className="text-xs text-amber-900/75">
                                {t('dependencyUnavailableDetails', {
                                    dependencies: failedDependencyLabels,
                                })}
                            </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button size="sm" variant="outline" onClick={handleRetryDependencies}>
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                {t('retryDependencies')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleDownload}
                                disabled={!url}
                            >
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                {t('downloadOriginal')}
                            </Button>
                        </div>
                        <p className="text-xs text-amber-900/75">{t('downloadOriginalHint')}</p>
                    </div>
                ) : loading ? (
                    <Skeleton className="m-3 h-[calc(100%-24px)] w-[calc(100%-24px)]" />
                ) : error ? (
                    <div
                        className="flex h-full flex-col items-center justify-center gap-2 text-sm text-red-500"
                        role="alert"
                    >
                        <FileText className="h-8 w-8 opacity-50" />
                        {error}
                    </div>
                ) : null}

                <div
                    ref={containerRef}
                    className={`flex flex-col items-center transition-opacity duration-300 ${(fileType === 'pdf' || fileType === 'docx') && !loading && !dependencyFailure ? 'opacity-100' : 'opacity-0'} ${fileType === 'text' ? 'hidden' : ''}`}
                />

                {fileType === 'text' && !loading && (
                    <div
                        ref={textContainerRef}
                        className="mx-auto min-h-full w-full max-w-3xl rounded-sm border border-gray-200 bg-white p-8 shadow-sm"
                    >
                        {textLines.map((line, i) => (
                            <div
                                key={i}
                                className="text-paragraph -mx-1 mb-2 cursor-pointer whitespace-pre-wrap rounded border-2 border-transparent px-1 font-mono text-sm leading-relaxed text-gray-800 transition-colors hover:bg-blue-500/10"
                            >
                                {line}
                            </div>
                        ))}
                    </div>
                )}

                {!loading && !error && !url && (
                    <div className="p-4 text-sm text-muted-foreground">{t('noPreviewContent')}</div>
                )}
            </div>
        </div>
    );
};

export default PreviewCard;
