// 专用于 DOCX 的解析器：返回原始文本、可选 HTML 预览与结构化信息
import path from 'path';
import fs from 'fs/promises';
import { buildSentencePlaceholders, type PlaceholderSpan } from '../placeholder';

export async function extractDocxFromUrl(
    url: string
): Promise<{ text: string; html?: string; contentType?: string; structured?: any }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
        let buffer: Buffer;
        let contentType = '';
        // 本地 data 目录优先（支持 file://、绝对/相对路径、data/ 前缀）
        const baseDir = path.resolve(process.cwd(), 'data');
        let localCandidate: string | null = null;
        try {
            if (url.startsWith('file://')) {
                localCandidate = decodeURI(new URL(url).pathname);
            } else if (!/^https?:\/\//i.test(url)) {
                const abs = path.isAbsolute(url)
                    ? url
                    : url.startsWith('data/')
                      ? path.resolve(baseDir, url.replace(/^data[\\\/]?/, ''))
                      : path.resolve(process.cwd(), url);
                localCandidate = abs;
            }
        } catch {}
        if (localCandidate) {
            const abs = path.resolve(localCandidate);
            const rel = path.relative(baseDir, abs);
            if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
                buffer = await fs.readFile(abs);
                contentType =
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            } else {
                throw new Error('Local path is outside data directory');
            }
        } else {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) {
                return { text: '', contentType: res.headers.get('content-type') || '' };
            }
            contentType = (res.headers.get('content-type') || '').toLowerCase();
            const arrayBuf = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuf);
        }
        let html: string | undefined;
        let structured: any | undefined;
        let text: string = '';
        try {
            const parsed = await parseDocxStructure(buffer);
            text = String(parsed?.text || '');
            html = parsed?.html;
            if (parsed) {
                const { text: _t, html: _h, ...rest } = parsed as any;
                structured = rest;
            }
        } catch {}
        return { text, html, contentType, structured };
    } catch {
        return { text: '', contentType: '' };
    } finally {
        clearTimeout(timer);
    }
}

// 解析 DOCX 内部 XML，提取：大纲、列表、表格、链接、脚注、图片等
async function parseDocxStructure(buffer: Buffer): Promise<any> {
    const jszipMod = await import('jszip');
    const JSZip = (jszipMod as any).default || (jszipMod as any);
    const fxp = await import('fast-xml-parser');
    const XMLParser = (fxp as any).XMLParser;
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        removeNSPrefix: true,
        allowBooleanAttributes: true,
        trimValues: false,
    });
    const zip = await JSZip.loadAsync(buffer);

    async function readText(path: string): Promise<string | null> {
        const f = zip.file(path);
        if (!f) return null;
        return await f.async('string');
    }

    const [docXml, stylesXml, numXml, footXml, relsXml] = await Promise.all([
        readText('word/document.xml'),
        readText('word/styles.xml'),
        readText('word/numbering.xml'),
        readText('word/footnotes.xml'),
        readText('word/_rels/document.xml.rels'),
    ]);

    const document = docXml ? parser.parse(docXml) : null;
    const numbering = numXml ? parser.parse(numXml) : null;
    const footnotes = footXml ? parser.parse(footXml) : null;
    const rels = relsXml ? parser.parse(relsXml) : null;

    // 关系映射 rId -> target
    const relMap: Record<string, string> = {};
    try {
        const relList = rels?.Relationships?.Relationship;
        const arr = Array.isArray(relList) ? relList : relList ? [relList] : [];
        for (const r of arr) {
            const id = String(r?.['@_Id'] || '');
            const target = String(r?.['@_Target'] || '');
            if (id) relMap[id] = target;
        }
    } catch {}

    // numbering：numId -> { abstractNumId, lvls: { [ilvl]: { format, text } } }
    const numIdToDef: Record<
        string,
        { abstractNumId: string; lvls: Record<string, { format?: string; text?: string }> }
    > = {};
    try {
        const abstractNums = numbering?.numbering?.abstractNum;
        const nums = numbering?.numbering?.num;
        const absArr = Array.isArray(abstractNums)
            ? abstractNums
            : abstractNums
              ? [abstractNums]
              : [];
        const numArr = Array.isArray(nums) ? nums : nums ? [nums] : [];
        const absMap: Record<string, any> = {};
        for (const a of absArr) {
            const aid = String(a?.['@_abstractNumId'] || '');
            const lvls = Array.isArray(a?.lvl) ? a.lvl : a?.lvl ? [a.lvl] : [];
            const m: Record<string, { format?: string; text?: string }> = {};
            for (const l of lvls) {
                const ilvl = String(l?.['@_ilvl'] ?? '0');
                const fmt = l?.numFmt?.['@_val'];
                const txt = l?.lvlText?.['@_val'];
                m[ilvl] = { format: fmt, text: txt };
            }
            absMap[aid] = { lvls: m };
        }
        for (const n of numArr) {
            const nid = String(n?.['@_numId'] || '');
            const aid = String(n?.abstractNumId?.['@_val'] || '');
            if (!nid) continue;
            numIdToDef[nid] = { abstractNumId: aid, lvls: absMap[aid]?.lvls || {} };
        }
    } catch {}

    function textFromRuns(p: any): string {
        try {
            const runs = Array.isArray(p?.r) ? p.r : p?.r ? [p.r] : [];
            let out = '';
            for (const r of runs) {
                const t = r?.t;
                const br = r?.br;
                if (typeof t === 'string') out += t;
                else if (t && typeof t['#text'] === 'string') out += t['#text'];
                if (br) out += '\n';
            }
            return out;
        } catch {
            return '';
        }
    }

    // 提取段落内 run 级样式信息（字体/字号/颜色/粗斜体/下划线），并保留换行
    function runsFromParagraph(
        p: any
    ): Array<{
        text: string;
        br?: boolean;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        color?: string;
        sizePt?: number;
        font?: string;
    }> {
        try {
            const rArr = Array.isArray(p?.r) ? p.r : p?.r ? [p.r] : [];
            const out: Array<{
                text: string;
                br?: boolean;
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                color?: string;
                sizePt?: number;
                font?: string;
            }> = [];
            for (const r of rArr) {
                // 换行 run
                if (r?.br) {
                    out.push({ text: '', br: true });
                    continue;
                }
                let t = '';
                const rawt = r?.t;
                if (typeof rawt === 'string') t = rawt;
                else if (rawt && typeof rawt['#text'] === 'string') t = rawt['#text'];
                const rPr = r?.rPr || {};
                const bold = !!(rPr?.b && rPr?.b['@_val'] !== '0');
                const italic = !!(rPr?.i && rPr?.i['@_val'] !== '0');
                const uVal = rPr?.u
                    ? typeof rPr.u === 'object'
                        ? rPr.u['@_val']
                        : rPr.u
                    : undefined;
                const underline = !!(uVal && uVal !== 'none' && uVal !== '0');
                const colorVal = rPr?.color?.['@_val'];
                const color =
                    typeof colorVal === 'string' && colorVal.toLowerCase() !== 'auto'
                        ? `#${colorVal.replace(/^#/, '')}`
                        : undefined;
                const szHalf = Number(rPr?.sz?.['@_val'] || rPr?.szCs?.['@_val'] || 0);
                const sizePt = szHalf ? szHalf / 2 : undefined; // Word 存半磅
                const rf = rPr?.rFonts || {};
                const font = rf?.eastAsia || rf?.ascii || rf?.hAnsi || undefined;
                out.push({ text: t, bold, italic, underline, color, sizePt, font });
            }
            return out;
        } catch {
            return [];
        }
    }

    const outline: Array<{ level: number; text: string; index: number }> = [];
    const lists: Array<{
        level: number;
        ordered: boolean;
        text: string;
        numId?: string;
        ilvl?: number;
    }> = [];
    const links: Array<{ text: string; href: string }> = [];
    const images: Array<{ rid: string; target: string; contentType?: string }> = [];
    const tables: Array<{
        rows: Array<Array<{ text: string; colspan?: number; rowspan?: number }>>;
    }> = [];
    const footnoteMap: Record<string, string> = {};
    const paragraphs: Array<{
        level?: number | null;
        styleName?: string;
        text: string;
        runs: Array<{
            text: string;
            br?: boolean;
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            color?: string;
            sizePt?: number;
            font?: string;
        }>;
        placeholderSpans?: PlaceholderSpan[];
    }> = [];

    // 脚注
    try {
        const list = footnotes?.footnotes?.footnote;
        const arr = Array.isArray(list) ? list : list ? [list] : [];
        for (const n of arr) {
            const id = String(n?.['@_id'] ?? '');
            const paras = Array.isArray(n?.p) ? n.p : n?.p ? [n.p] : [];
            const txt = paras
                .map((pp: any) => textFromRuns(pp))
                .filter(Boolean)
                .join('\n');
            if (id) footnoteMap[id] = txt;
        }
    } catch {}

    // 图片（关系）
    try {
        const mediaIds: Array<string> = [];
        const b = document?.document?.body;
        const walk = (node: any) => {
            if (!node) return;
            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }
            if (
                node.drawing &&
                node.drawing?.inline?.graphic?.graphicData?.pic?.blipFill?.blip?.['@_embed']
            ) {
                mediaIds.push(
                    String(node.drawing.inline.graphic.graphicData.pic.blipFill.blip['@_embed'])
                );
            }
            for (const k of Object.keys(node)) {
                const v = (node as any)[k];
                if (v && typeof v === 'object') walk(v);
            }
        };
        walk(b);
        for (const rid of mediaIds) {
            const target = relMap[rid];
            if (target) images.push({ rid, target });
        }
    } catch {}

    // 表格提取（简化版）
    try {
        const b = document?.document?.body;
        const tbllist = Array.isArray(b?.tbl) ? b.tbl : b?.tbl ? [b.tbl] : [];
        for (const tbl of tbllist) {
            const rows: Array<Array<{ text: string; colspan?: number; rowspan?: number }>> = [];
            const trArr = Array.isArray(tbl?.tr) ? tbl.tr : tbl?.tr ? [tbl.tr] : [];
            const rowspans: number[] = [];
            for (const tr of trArr) {
                const cells: Array<{ text: string; colspan?: number; rowspan?: number }> = [];
                const tcArr = Array.isArray(tr?.tc) ? tr.tc : tr?.tc ? [tr.tc] : [];
                let colIndex = 0;
                for (const tc of tcArr) {
                    // 应用上方跨行占位
                    while ((rowspans[colIndex] || 0) > 0) {
                        rowspans[colIndex] = Math.max(0, (rowspans[colIndex] || 0) - 1);
                        colIndex += 1;
                    }
                    const pArr = Array.isArray(tc?.p) ? tc.p : tc?.p ? [tc.p] : [];
                    const text = pArr
                        .map((pp: any) => textFromRuns(pp))
                        .filter(Boolean)
                        .join('\n');
                    const gridSpan = Number(tc?.tcPr?.gridSpan?.['@_val'] || '0') || undefined;
                    const vMerge = tc?.tcPr?.vMerge?.['@_val'];
                    const isVMergeContinue = vMerge === 'continue';
                    const cell: any = { text };
                    if (gridSpan && gridSpan > 1) cell.colspan = gridSpan;
                    if (tc?.tcPr?.vMerge && !isVMergeContinue) {
                        cell.rowspan = 1;
                        rowspans[colIndex] = Math.max(rowspans[colIndex] || 0, 1);
                    }
                    cells.push(cell);
                    colIndex += gridSpan && gridSpan > 1 ? gridSpan : 1;
                }
                rows.push(cells);
            }
            tables.push({ rows });
        }
    } catch {}

    // 段落（标题/列表/链接） + 文本/HTML 预览
    try {
        const b = document?.document?.body;
        const pList = Array.isArray(b?.p) ? b.p : b?.p ? [b.p] : [];
        let idx = 0;
        const textLines: string[] = [];
        const htmlParts: string[] = [];
        const escapeHtml = (s: string) =>
            String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const runsToHtml = (
            runs: Array<{
                text: string;
                br?: boolean;
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                color?: string;
                sizePt?: number;
                font?: string;
            }>
        ) => {
            const parts: string[] = [];
            for (const r of runs) {
                if (r.br) {
                    parts.push('<br/>');
                    continue;
                }
                const style: string[] = [];
                if (r.bold) style.push('font-weight:700');
                if (r.italic) style.push('font-style:italic');
                if (r.underline) style.push('text-decoration:underline');
                if (r.color) style.push(`color:${r.color}`);
                if (typeof r.sizePt === 'number') style.push(`font-size:${r.sizePt}pt`);
                if (r.font) style.push(`font-family:"${String(r.font).replace(/"/g, '\\"')}"`);
                const styleAttr = style.length ? ` style="${style.join(';')}"` : '';
                parts.push(`<span${styleAttr}>${escapeHtml(r.text)}</span>`);
            }
            return parts.join('');
        };
        for (const p of pList) {
            const runs = runsFromParagraph(p);
            const txt = runs
                .map(r => r.text)
                .join('')
                .trim();
            if (!txt) {
                idx++;
                continue;
            }
            const styleName = p?.pPr?.pStyle?.['@_val'];
            const outlineLvl = p?.pPr?.outlineLvl?.['@_val'];
            let level: number | null = null;
            if (styleName && /^Heading\s+(\d+)/i.test(styleName)) {
                const m = styleName.match(/(\d+)/);
                level = m ? Number(m[1]) : null;
            } else if (typeof outlineLvl !== 'undefined') {
                level = Number(outlineLvl) + 1;
            }
            if (level && level >= 1 && level <= 6) {
                outline.push({ level, text: txt, index: idx });
            }

            const numPr = p?.pPr?.numPr;
            if (numPr?.numId) {
                const numId = String(numPr?.numId?.['@_val'] ?? '');
                const ilvl = Number(numPr?.ilvl?.['@_val'] ?? '0');
                const def = numIdToDef[numId];
                const fmt = def?.lvls?.[String(ilvl)]?.format || '';
                const ordered = /^decimal|lower|upper|roman/i.test(String(fmt));
                lists.push({ level: ilvl, ordered, text: txt, numId, ilvl });
            }

            const h = p?.hyperlink;
            const hrefItems = Array.isArray(h) ? h : h ? [h] : [];
            for (const hi of hrefItems) {
                const rid = String(hi?.['@_id'] || hi?.['@_r:id'] || '');
                const htxt = textFromRuns(hi) || txt;
                const href = rid && relMap[rid] ? relMap[rid] : '';
                if (href) links.push({ text: htxt, href });
            }

            const rArr = Array.isArray(p?.r) ? p.r : p?.r ? [p.r] : [];
            for (const r of rArr) {
                const fref = r?.footnoteReference?.['@_id'];
                if (typeof fref !== 'undefined') {
                    const id = String(fref);
                    const note = footnoteMap[id];
                    if (note) links.push({ text: `footnote:${id}`, href: `#footnote-${id}` });
                }
            }

            // 段落记录（含 runs 与句级占位符 spans）
            const placeholderSpans = buildSentencePlaceholders(txt);
            paragraphs.push({ level, styleName, text: txt, runs, placeholderSpans });
            // 文本与 HTML 预览（标题 -> hN，其余 -> p），保留 run 样式
            textLines.push(txt);
            if (level && level >= 1 && level <= 6) {
                htmlParts.push(`<h${level}>${runsToHtml(runs)}</h${level}>`);
            } else {
                htmlParts.push(`<p>${runsToHtml(runs)}</p>`);
            }

            idx++;
        }

        // 将生成的预览挂到返回对象上（后续在返回时解构）
        (parseDocxStructure as any)._previewText = textLines.join('\n');
        (parseDocxStructure as any)._previewHtml = htmlParts.join('');
    } catch {}

    const footnoteArr = Object.keys(footnoteMap).map(k => ({
        id: Number(k),
        text: footnoteMap[k],
    }));

    const previewText: string = (parseDocxStructure as any)._previewText || '';
    const previewHtml: string = (parseDocxStructure as any)._previewHtml || '';

    return {
        outline,
        lists,
        tables,
        links,
        footnotes: footnoteArr,
        images,
        paragraphs,
        text: previewText,
        html: previewHtml,
    };
}
