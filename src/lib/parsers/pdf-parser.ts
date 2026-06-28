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

function getMineruConfig() {
    const token = process.env.MINERU_API_TOKEN;
    if (!token) return null;
    return {
        token,
        baseUrl: (process.env.MINERU_API_BASE_URL || 'https://mineru.net/api/v4').replace(/\/$/, ''),
        modelVersion: process.env.MINERU_MODEL_VERSION || 'pipeline',
        timeoutMs: Number(process.env.MINERU_TIMEOUT_MS || 120000),
        pollIntervalMs: Number(process.env.MINERU_POLL_INTERVAL_MS || 2500),
        isOcr: process.env.MINERU_IS_OCR !== 'false',
        enableFormula: process.env.MINERU_ENABLE_FORMULA === 'true',
    };
}

async function mineruRequest(url: string, init: RequestInit, token: string) {
    const res = await fetch(url, {
        ...init,
        headers: {
            Accept: '*/*',
            Authorization: `Bearer ${token}`,
            ...(init.headers || {}),
        },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0) {
        throw new Error(body?.msg || body?.message || `MinerU request failed: ${res.status}`);
    }
    return body;
}

async function parseWithMineru(url: string) {
    const cfg = getMineruConfig();
    if (!cfg) return null;

    const created = await mineruRequest(
        `${cfg.baseUrl}/extract/task`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                model_version: cfg.modelVersion,
                is_ocr: cfg.isOcr,
                enable_formula: cfg.enableFormula,
            }),
        },
        cfg.token
    );

    const taskId = created?.data?.task_id;
    if (!taskId) throw new Error('MinerU task id missing');

    const startedAt = Date.now();
    while (Date.now() - startedAt < cfg.timeoutMs) {
        const result = await mineruRequest(
            `${cfg.baseUrl}/extract/task/${encodeURIComponent(taskId)}`,
            { method: 'GET' },
            cfg.token
        );
        const data = result?.data || {};
        if (data.state === 'failed') throw new Error(data.err_msg || 'MinerU parse failed');
        if (data.state === 'done') {
            if (!data.full_zip_url) throw new Error('MinerU result zip missing');
            return extractMarkdownFromMineruZip(data.full_zip_url);
        }
        await new Promise(resolve => setTimeout(resolve, cfg.pollIntervalMs));
    }
    throw new Error('MinerU parse timeout');
}

async function extractMarkdownFromMineruZip(fullZipUrl: string) {
    const res = await fetch(fullZipUrl);
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
            source: 'mineru',
            markdownFile: markdownEntry.name,
        },
    };
}

export async function pdfParseToStructuredJson(
    url: string
): Promise<{ text: string; html?: string; contentType?: string; structured?: any }> {
    const mineruResult = await parseWithMineru(url).catch(() => null);
    if (mineruResult) return mineruResult;

    const { text, contentType } = await extractTextFromUrl(url);
    const { structured, html } = buildStructured(text);
    return {
        text,
        html,
        contentType: contentType || 'application/pdf',
        structured,
    };
}
