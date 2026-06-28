import { extractTextFromUrl } from '@/lib/file-parser';

function escapeHtml(value: string) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export async function pdfParseToStructuredJson(
    url: string
): Promise<{ text: string; html?: string; contentType?: string; structured?: any }> {
    const { text, contentType } = await extractTextFromUrl(url);
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
    return {
        text,
        html: html ? `<div>${html}</div>` : undefined,
        contentType: contentType || 'application/pdf',
        structured,
    };
}
