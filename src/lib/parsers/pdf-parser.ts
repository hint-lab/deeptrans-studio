import { extractTextFromUrl } from '@/lib/file-parser';
import JSZip from 'jszip';

function escapeHtml(value: string) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function buildStructured(text: string) {
    const paragraphs = String(text || '')
        .split(/\n\s*\n|\r\n\s*\r\n/)
        .map(item => item.trim())
        .filter(Boolean);

    const structured = {
        outline: [] as any[],
        lists: [] as any[],
        tables: [] as any[],
        links: [] as any[],
        footnotes: [] as any[],
        images: [] as any[],
        paragraphs: paragraphs.map(para => ({
            level: null,
            text: para,
            runs: [
                {
                    text: `${para}  `,
                    bold: false,
                    italic: false,
                    underline: false,
                    sizePt: 12,
                },
            ],
            placeholderSpans: [
                {
                    index: 0,
                    text: para,
                    start: 0,
                    end: para.length,
                },
            ],
        })),
    };

    const html = paragraphs.map(para => `<p>${escapeHtml(para)}</p>`).join('');
    return { paragraphs, structured, html: html ? `<div>${html}</div>` : undefined };
}

type MineruParseOptions = {
    language?: string;
    isOcr?: boolean;
    enableTable?: boolean;
    enableFormula?: boolean;
    timeoutMs?: number;
};

function getMineruConfig(options?: MineruParseOptions) {
    const mode = (process.env.MINERU_API_MODE || 'agent').toLowerCase();
    const token = process.env.MINERU_API_TOKEN;
    return {
        mode,
        token,
        apiBaseUrl: (process.env.MINERU_API_BASE_URL || 'https://mineru.net/api/v4').replace(
            /\/$/,
            ''
        ),
        agentBaseUrl: (
            process.env.MINERU_AGENT_BASE_URL || 'https://mineru.net/api/v1/agent'
        ).replace(/\/$/, ''),
        modelVersion: process.env.MINERU_MODEL_VERSION || 'vlm',
        timeoutMs: options?.timeoutMs ?? Number(process.env.MINERU_TIMEOUT_MS || 300000),
        pollIntervalMs: Number(process.env.MINERU_POLL_INTERVAL_MS || 3000),
        language: options?.language || process.env.MINERU_LANGUAGE || 'ch',
        isOcr: options?.isOcr ?? process.env.MINERU_IS_OCR === 'true',
        enableTable: options?.enableTable ?? process.env.MINERU_ENABLE_TABLE !== 'false',
        enableFormula: options?.enableFormula ?? process.env.MINERU_ENABLE_FORMULA !== 'false',
        pageRange: process.env.MINERU_PAGE_RANGE || undefined,
    };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) {
            throw new Error(body?.msg || body?.message || `MinerU request failed: ${res.status}`);
        }
        return body;
    } finally {
        clearTimeout(timer);
    }
}

async function mineruApiRequest(
    url: string,
    init: RequestInit,
    token: string | undefined,
    timeoutMs: number
) {
    if (!token || token.includes('<'))
        throw new Error('MINERU_API_TOKEN 未配置，无法使用精准解析 API');
    const body = await fetchJson(
        url,
        {
            ...init,
            headers: {
                Accept: '*/*',
                Authorization: `Bearer ${token}`,
                ...(init.headers || {}),
            },
        },
        timeoutMs
    );
    if (body.code !== 0) throw new Error(body?.msg || `MinerU request failed: code ${body.code}`);
    return body;
}

async function fetchText(url: string, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`MinerU result download failed: ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

async function parseWithMineru(url: string, options?: MineruParseOptions) {
    const cfg = getMineruConfig(options);
    if (cfg.mode === 'standard' || cfg.mode === 'precise') return parseWithMineruStandard(url, cfg);
    if (cfg.mode === 'agent') return parseWithMineruAgent(url, cfg);
    throw new Error(`未知 MinerU API 模式: ${cfg.mode}`);
}

async function parseWithMineruAgent(url: string, cfg: ReturnType<typeof getMineruConfig>) {
    const body: Record<string, unknown> = {
        url,
        language: cfg.language,
        enable_table: cfg.enableTable,
        is_ocr: cfg.isOcr,
        enable_formula: cfg.enableFormula,
    };
    if (cfg.pageRange) body.page_range = cfg.pageRange;

    const created = await fetchJson(
        `${cfg.agentBaseUrl}/parse/url`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
        cfg.timeoutMs
    );
    if (created.code !== 0)
        throw new Error(created?.msg || `MinerU Agent request failed: ${created.code}`);
    const taskId = created?.data?.task_id;
    if (!taskId) throw new Error('MinerU Agent task id missing');

    const startedAt = Date.now();
    while (Date.now() - startedAt < cfg.timeoutMs) {
        const result = await fetchJson(
            `${cfg.agentBaseUrl}/parse/${encodeURIComponent(taskId)}`,
            { method: 'GET' },
            cfg.timeoutMs
        );
        if (result.code !== 0)
            throw new Error(result?.msg || `MinerU Agent request failed: ${result.code}`);
        const data = result?.data || {};
        if (data.state === 'failed') throw new Error(data.err_msg || 'MinerU Agent parse failed');
        if (data.state === 'done') {
            if (!data.markdown_url) throw new Error('MinerU Agent markdown url missing');
            const text = await fetchText(data.markdown_url, cfg.timeoutMs);
            const { structured, html } = buildStructured(text);
            return {
                text,
                html,
                contentType: 'application/pdf',
                structured: {
                    ...structured,
                    source: 'mineru-agent',
                    markdownUrl: data.markdown_url,
                    taskId,
                },
            };
        }
        await new Promise(resolve => setTimeout(resolve, cfg.pollIntervalMs));
    }
    throw new Error('MinerU Agent parse timeout');
}

async function parseWithMineruStandard(url: string, cfg: ReturnType<typeof getMineruConfig>) {
    const body: Record<string, unknown> = {
        url,
        model_version: cfg.modelVersion,
        is_ocr: cfg.isOcr,
        enable_table: cfg.enableTable,
        enable_formula: cfg.enableFormula,
        language: cfg.language,
    };
    if (cfg.pageRange) body.page_ranges = cfg.pageRange;

    const created = await mineruApiRequest(
        `${cfg.apiBaseUrl}/extract/task`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
        cfg.token,
        cfg.timeoutMs
    );

    const taskId = created?.data?.task_id;
    if (!taskId) throw new Error('MinerU task id missing');

    const startedAt = Date.now();
    while (Date.now() - startedAt < cfg.timeoutMs) {
        const result = await mineruApiRequest(
            `${cfg.apiBaseUrl}/extract/task/${encodeURIComponent(taskId)}`,
            { method: 'GET' },
            cfg.token,
            cfg.timeoutMs
        );
        const data = result?.data || {};
        if (data.state === 'failed') throw new Error(data.err_msg || 'MinerU parse failed');
        if (data.state === 'done') {
            if (!data.full_zip_url) throw new Error('MinerU result zip missing');
            return extractMarkdownFromMineruZip(data.full_zip_url, cfg.timeoutMs, taskId);
        }
        await new Promise(resolve => setTimeout(resolve, cfg.pollIntervalMs));
    }
    throw new Error('MinerU parse timeout');
}

async function extractMarkdownFromMineruZip(fullZipUrl: string, timeoutMs: number, taskId: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
        res = await fetch(fullZipUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`MinerU result download failed: ${res.status}`);
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    const markdownEntry =
        zip.file(/(^|\/)full\.md$/i)[0] ||
        zip.file(/\.md$/i).sort((a, b) => a.name.length - b.name.length)[0];
    if (!markdownEntry) throw new Error('MinerU markdown missing');
    const text = await markdownEntry.async('string');
    const { structured, html } = buildStructured(text);
    return {
        text,
        html,
        contentType: 'application/pdf',
        structured: {
            ...structured,
            source: 'mineru-standard',
            markdownFile: markdownEntry.name,
            zipUrl: fullZipUrl,
            taskId,
        },
    };
}

async function parsePdfLocally(url: string) {
    const { text, contentType } = await extractTextFromUrl(url);
    const { structured, html } = buildStructured(text);
    return {
        text,
        html,
        contentType: contentType || 'application/pdf',
        structured: {
            ...structured,
            source: 'pdf-parse',
        },
    };
}

export async function pdfParseToStructuredJson(
    url: string,
    options?: MineruParseOptions
): Promise<{ text: string; html?: string; contentType?: string; structured?: any }> {
    if (process.env.MINERU_DISABLE === 'true') return parsePdfLocally(url);

    return parseWithMineru(url, options);
}
