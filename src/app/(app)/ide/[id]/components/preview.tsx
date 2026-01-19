'use client';

import { fetchDocumentPreviewByDocIdAction } from '@/actions/document';
import { getFileUrlAction } from '@/actions/upload';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { createLogger } from '@/lib/logger';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Script from 'next/script';
import React, { useEffect, useRef, useState } from 'react';
import { getContentByIdAction } from 'src/actions/document-item';

// --- 类型定义 ---
type FileType = 'pdf' | 'docx' | 'text' | 'unknown';

interface InteractiveParagraph {
    str: string;
    domElement: HTMLElement;
    // PDF 专用属性
    page?: number;
    lastBottom?: number;
    avgHeight?: number;
}

const logger = createLogger({
    type: 'client:preview-card',
}, { json: false, pretty: false, colors: true });

// --- 资源配置 ---
const SCALE = 1.2;
const PDFJS_VERSION = '3.11.174';
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
const PDFJS_CMAP_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/cmaps/`;

const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const DOCX_JS_URL = 'https://unpkg.com/docx-preview@0.1.15/dist/docx-preview.js';

const PreviewCard: React.FC = () => {
    const t = useTranslations('IDE.preview');
    const { activeDocumentItem } = useActiveDocumentItem();
    const { explorerTabs } = useExplorerTabs();

    // 基础状态
    const [url, setUrl] = useState<string | null>(null);
    const [fileType, setFileType] = useState<FileType>('unknown');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 库加载状态
    const [pdfLibReady, setPdfLibReady] = useState(false);
    const [docxLibReady, setDocxLibReady] = useState(false);
    // 【新增】用于严格控制加载顺序
    const [jszipLoaded, setJszipLoaded] = useState(false);
    // 【核心状态】：存储所有可交互段落（不分文件类型）
    const [interactiveParagraphs, setInteractiveParagraphs] = useState<InteractiveParagraph[]>([]);
    const [textLines, setTextLines] = useState<string[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const textContainerRef = useRef<HTMLDivElement>(null);
    const lastLoadedId = useRef<string | null>(null);
    const activeDocIdRef = useRef<string | null>(null);
    const tabs = explorerTabs?.documentTabs ?? [];
    const aid = (activeDocumentItem as any)?.id;
    const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
    const docId = (currentTab as any)?.id || '';

    // 0. 全局库检测
    useEffect(() => {
        const checkLibs = () => {
            if (typeof window === 'undefined') return;
            if (!pdfLibReady && (window as any).pdfjsLib) setPdfLibReady(true);
            if (!docxLibReady && (window as any).docx && (window as any).JSZip) setDocxLibReady(true);
        };
        checkLibs();
        const timer = setInterval(checkLibs, 500);
        return () => clearInterval(timer);
    }, [pdfLibReady, docxLibReady]);

    // 1. 获取 URL 并通过预加载识别类型
    useEffect(() => {
        let activeObjectUrl: string | null = null;
        let isMounted = true; // 增加挂载标记，处理异步竞态
        const loadUrl = async () => {
            if (!docId) return;
            if (activeDocIdRef.current === docId && url) return;
            if (lastLoadedId.current === activeDocumentItem?.id && url) return;
            activeDocIdRef.current = docId;
            setLoading(true);
            setError(null);
            setInteractiveParagraphs([]);
            setTextLines([]);
            setUrl(null); // 切换不同文档时，先置空防止显示旧内容
            try {
                const info = await fetchDocumentPreviewByDocIdAction(docId);
                if (!isMounted || activeDocIdRef.current !== docId) return;
                const r = await getFileUrlAction(String(info?.name));
                const fetchUrl = (r as any)?.data?.fileUrl || null;
                if (!isMounted || activeDocIdRef.current !== docId) return;
                logger.info('Fetched preview URL:', fetchUrl);
                if (!fetchUrl) {
                    setError(t('previewError'));
                    setLoading(false);
                    return;
                }

                const response = await fetch(fetchUrl);
                if (!response.ok) throw new Error(`Download failed: ${response.status}`);

                const blob = await response.blob();
                if (!isMounted || activeDocIdRef.current !== docId) return;
                const contentType = response.headers.get('content-type') || '';

                let detectedType: FileType = 'unknown';

                if (contentType.includes('application/pdf')) {
                    detectedType = 'pdf';
                } else if (contentType.includes('wordprocessingml') || contentType.includes('msword')) {
                    detectedType = 'docx';
                } else if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('javascript') || contentType.includes('xml')) {
                    detectedType = 'text';
                }

                if (detectedType === 'unknown' || contentType === 'application/octet-stream') {
                    const buffer = await blob.slice(0, 4).arrayBuffer();
                    const header = new DataView(buffer);
                    const magic = header.getUint32(0, false);

                    if (magic === 0x25504446) detectedType = 'pdf';
                    else if (magic === 0x504B0304) detectedType = 'docx';
                    else {
                        const fileName = (activeDocumentItem?.name || info?.name || '').toLowerCase();
                        if (fileName.endsWith('.pdf')) detectedType = 'pdf';
                        else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) detectedType = 'docx';
                        else detectedType = 'unknown';
                    }
                }

                activeObjectUrl = URL.createObjectURL(blob);
                setUrl(activeObjectUrl);
                setFileType(detectedType);
                //lastLoadedId.current = activeDocumentItem.id;

                if (detectedType === 'unknown') setLoading(false);

            } catch (e) {
                // 仅当当前 docId 仍然匹配时才报错，防止切换后的报错干扰
                if (isMounted && activeDocIdRef.current === docId) {
                    logger.error('Failed to load/detect document', e);
                    setError(t('previewError'));
                    setLoading(false);
                }
            }
        };

        loadUrl();

        return () => {
            isMounted = false;
            if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
        };
    }, [docId, t]);

    // 2. 核心渲染分发器
    useEffect(() => {
        if (!url) return;

        // --- A. PDF 渲染逻辑 ---
        if (fileType === 'pdf' && pdfLibReady && containerRef.current) {
            let isCancelled = false;
            const renderPDF = async () => {
                try {
                    const pdfjsLib = (window as any).pdfjsLib;
                    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
                    const loadingTask = pdfjsLib.getDocument({ url, cMapUrl: PDFJS_CMAP_URL, cMapPacked: true });
                    const pdfDoc = await loadingTask.promise;

                    if (isCancelled) return;
                    if (containerRef.current) containerRef.current.innerHTML = '';

                    const paragraphs: InteractiveParagraph[] = [];
                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        if (isCancelled) return;
                        await renderPagePDF(pdfDoc, i, paragraphs);
                    }
                    if (!isCancelled) {
                        setInteractiveParagraphs(paragraphs);
                        setLoading(false);
                    }
                } catch (err: any) {
                    if (!isCancelled) {
                        setError(`PDF Error: ${err.message}`);
                        setLoading(false);
                    }
                }
            };
            renderPDF();
            return () => { isCancelled = true; };
        }

        // --- B. DOCX 渲染逻辑 (增强版) ---
        else if (fileType === 'docx' && docxLibReady && containerRef.current) {
            const renderDocx = async () => {
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();

                    if (containerRef.current) {
                        containerRef.current.innerHTML = '';
                        await (window as any).docx.renderAsync(blob, containerRef.current, null, {
                            className: "docx-wrapper",
                            inWrapper: true,
                            ignoreWidth: false,
                            experimental: true
                        });

                        // 【DOCX 核心增强】：渲染后注入交互 DOM
                        const elements = containerRef.current.querySelectorAll('.docx-wrapper p, .docx-wrapper h1, .docx-wrapper h2, .docx-wrapper h3, .docx-wrapper h4');
                        const paragraphs: InteractiveParagraph[] = [];

                        elements.forEach((el) => {
                            const htmlEl = el as HTMLElement;
                            // 注入交互样式：增加内边距和圆角，让高亮更像一个“块”
                            // border-transparent 用于占位，防止高亮时布局抖动
                            htmlEl.classList.add(
                                'cursor-pointer', 'transition-all', 'duration-200',
                                'border-2', 'border-transparent',
                                'hover:bg-blue-500/10', 'rounded-sm',
                                'px-1', '-mx-1' // 微调负边距，让背景色稍微扩出去一点，视觉更好
                            );

                            if (htmlEl.innerText.trim().length > 0) {
                                paragraphs.push({
                                    str: htmlEl.innerText,
                                    domElement: htmlEl
                                });
                            }
                        });
                        setInteractiveParagraphs(paragraphs);
                    }
                    setLoading(false);
                } catch (err: any) {
                    setError(`DOCX Error: ${err.message}`);
                    setLoading(false);
                }
            };
            renderDocx();
        }

        // --- C. Text 渲染逻辑 ---
        else if (fileType === 'text') {
            const renderText = async () => {
                try {
                    const res = await fetch(url);
                    const text = await res.text();
                    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                    setTextLines(lines);
                    setLoading(false);
                } catch (err: any) {
                    setError(`Text Error: ${err.message}`);
                    setLoading(false);
                }
            };
            renderText();
        }

    }, [url, fileType, pdfLibReady, docxLibReady]);

    // 2.1 文本模式 DOM 收集
    useEffect(() => {
        if (fileType === 'text' && textLines.length > 0 && textContainerRef.current) {
            const elements = textContainerRef.current.querySelectorAll('.text-paragraph');
            const paragraphs: InteractiveParagraph[] = [];
            elements.forEach(el => {
                const htmlEl = el as HTMLElement;
                paragraphs.push({
                    str: htmlEl.innerText,
                    domElement: htmlEl
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
            } catch (err) { /* ignore */ }
        };
        locate();
        return () => { isMounted = false; };
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
            const p = paragraphs[i]; if (!p) continue;
            const pdfClean = normalize(p.str); if (pdfClean.length < 2) continue;

            // 1. 精确匹配
            if (mdClean === pdfClean) { matches.push(i); continue; }
            // 2. 包含匹配 (MD 包含 DOCX 段落，常见于 MD 把 DOCX 的多行合并了)
            if (mdClean.includes(pdfClean) && pdfClean.length > 10) { matches.push(i); continue; }
            // 3. 反向包含 (DOCX 段落包含 MD，常见于 MD 是摘录)
            if (pdfClean.includes(mdClean) && mdClean.length > 5) { matches.push(i); continue; }
            // 4. 前缀匹配 (标题)
            if (pdfClean.length < 50 && mdClean.startsWith(pdfClean)) { matches.push(i); continue; }
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
                el.classList.add('active-highlight', 'bg-blue-500/25', 'border-blue-700', 'z-[100]');

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
    const renderPagePDF = async (pdfDoc: any, pageNum: number, paragraphs: InteractiveParagraph[]) => {
        const page = await pdfDoc.getPage(pageNum);
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
        if (containerRef.current) containerRef.current.appendChild(wrapper);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const textContent = await page.getTextContent();

        const items = textContent.items.map((item: any) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
            return { str: item.str, x: tx[4], y: tx[5] - fontHeight, width: item.width * SCALE, height: fontHeight, isBlank: item.str.trim().length === 0 };
        }).filter((item: any) => !item.isBlank && item.width > 2);

        items.sort((a: any, b: any) => (Math.abs(a.y - b.y) < 5) ? a.x - b.x : a.y - b.y);

        let currentP: any = null;
        const pageParas: any[] = [];
        items.forEach((item: any) => {
            if (!currentP) { currentP = { ...item, lastBottom: item.y + item.height, avgHeight: item.height }; }
            else {
                const fontSizeDiff = Math.abs(item.height - currentP.avgHeight);
                const vGap = item.y - currentP.lastBottom;
                const xDiff = Math.abs(item.x - currentP.x);
                const isSpecial = /^(Figure|Table|Abstract|\d\s+[A-Z])/.test(item.str);

                if (fontSizeDiff > 1.5 || vGap > (item.height * 0.6) || (xDiff > item.height * 4 && vGap > 0) || isSpecial) {
                    pageParas.push(currentP);
                    currentP = { ...item, lastBottom: item.y + item.height, avgHeight: item.height };
                } else {
                    currentP.str += ' ' + item.str;
                    currentP.width = Math.max(currentP.width, (item.x + item.width) - currentP.x);
                    currentP.height = Math.max(currentP.height, (item.y + item.height) - currentP.y);
                    currentP.lastBottom = item.y + item.height;
                }
            }
        });
        if (currentP) pageParas.push(currentP);

        pageParas.forEach((p) => {
            const div = document.createElement('div');
            div.className = 'absolute cursor-pointer border border-blue-500/20 bg-blue-500/5 rounded transition-all duration-100 hover:border-blue-500/80 hover:bg-blue-500/10 hover:z-50';
            div.style.left = `${p.x}px`; div.style.top = `${p.y}px`; div.style.width = `${p.width}px`; div.style.height = `${p.height}px`;
            paragraphs.push({ str: p.str, page: pageNum, domElement: div });
            textLayerDiv.appendChild(div);
        });
    };

    const handleDownload = () => url && window.open(url, '_blank');
    const handleOpenNew = () => url && window.open(url, '_blank');

    return (
        <div className="flex size-full flex-col rounded-tl-md bg-background relative">
            <Script src={PDFJS_URL} onLoad={() => setPdfLibReady((p) => p || true)} />
            <Script src={JSZIP_URL} onLoad={() => setJszipLoaded(true)} />
            {jszipLoaded && (
                <Script src={DOCX_JS_URL} />
            )}

            <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1 text-[11px] text-foreground/70">
                <span className="font-medium flex items-center gap-2">
                    {fileType === 'pdf' && <span className="text-red-500 font-bold text-[10px] border border-red-200 bg-red-50 px-1 rounded">PDF</span>}
                    {fileType === 'docx' && <span className="text-blue-600 font-bold text-[10px] border border-blue-200 bg-blue-50 px-1 rounded">DOCX</span>}
                    {fileType === 'text' && <span className="text-gray-600 font-bold text-[10px] border border-gray-200 bg-gray-50 px-1 rounded">TXT</span>}
                    {t('title')}
                </span>
                <div className="flex items-center gap-1">
                    <Button className="h-7 px-2 hover:bg-accent hover:text-accent-foreground bg-transparent text-foreground shadow-none border-0" onClick={handleDownload} disabled={!url}><Download className="h-3 w-3" /></Button>
                    <Button className="h-7 px-2 hover:bg-accent hover:text-accent-foreground bg-transparent text-foreground shadow-none border-0" onClick={handleOpenNew} disabled={!url}><ExternalLink className="h-3 w-3" /></Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-gray-100" id="pdf-scroll-container">
                {loading && <Skeleton className="m-3 h-[calc(100%-24px)] w-[calc(100%-24px)]" />}
                {!loading && error && <div className="flex h-full items-center justify-center text-red-500 text-sm flex-col gap-2"><FileText className="h-8 w-8 opacity-50" />{error}</div>}

                <div
                    ref={containerRef}
                    className={`flex flex-col items-center transition-opacity duration-300 ${(fileType === 'pdf' || fileType === 'docx') && !loading ? 'opacity-100' : 'opacity-0'} ${fileType === 'text' ? 'hidden' : ''}`}
                />

                {fileType === 'text' && !loading && (
                    <div ref={textContainerRef} className="bg-white p-8 shadow-sm min-h-full w-full max-w-3xl mx-auto rounded-sm border border-gray-200">
                        {textLines.map((line, i) => (
                            <div
                                key={i}
                                className="text-paragraph mb-2 font-mono text-sm text-gray-800 leading-relaxed whitespace-pre-wrap cursor-pointer border-2 border-transparent hover:bg-blue-500/10 rounded px-1 -mx-1 transition-colors"
                            >
                                {line}
                            </div>
                        ))}
                    </div>
                )}

                {!loading && !error && !url && <div className="text-sm text-muted-foreground p-4">{t('noPreviewContent')}</div>}
            </div>
        </div>
    );
};

export default PreviewCard;