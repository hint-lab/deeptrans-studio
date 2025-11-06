/*
  Usage:
    yarn tsx scripts/test-docx-parser.ts https://example.com/sample.docx
*/

import { extractDocxFromUrl } from '@/lib/parsers/docx-parser';
import fs from 'fs/promises';
import path from 'path';

function truncate(s: string | undefined, n: number) {
  if (!s) return '';
  const t = String(s);
  return t.length <= n ? t : t.slice(0, n) + '…';
}

async function main() {
  const argv = process.argv.slice(2);
  let url = '';
  let outPath: string | undefined;
  let htmlOutPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a == null) continue;
    if (a === '--out' || a === '-o') {
      outPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (a.startsWith('--out=')) {
      outPath = a.slice(6);
      continue;
    }
    if (a === '--html' || a === '--html-out' || a === '-H') {
      htmlOutPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (a.startsWith('--html=')) {
      htmlOutPath = a.slice(7);
      continue;
    }
    if (!url) url = a;
  }

  if (!url) {
    console.error('请提供 DOCX 的 URL 或本地路径，例如:');
    console.error('  yarn tsx scripts/test-docx-parser.ts https://example.com/sample.docx');
    console.error('  yarn tsx scripts/test-docx-parser.ts data/中华人民共和国学前教育法_20241108.docx');
    process.exit(1);
  }

  const res = await extractDocxFromUrl(url);
  const { text, html, contentType, structured } = res || {} as any;

  const outline = structured?.outline ?? [];
  const lists = structured?.lists ?? [];
  const tables = structured?.tables ?? [];
  const links = structured?.links ?? [];
  const footnotes = structured?.footnotes ?? [];
  const images = structured?.images ?? [];

  const preview = {
    meta: {
      contentType: contentType || '',
    },
    text: {
      length: typeof text === 'string' ? text.length : 0,
      sample: truncate(text, 300),
    },
    html: {
      length: typeof html === 'string' ? html.length : 0,
      sample: truncate(html, 300),
    },
    structuredSummary: {
      outlineCount: outline.length,
      listsCount: lists.length,
      tablesCount: tables.length,
      linksCount: links.length,
      footnotesCount: footnotes.length,
      imagesCount: images.length,
      samples: {
        outline: outline.slice(0, 5).map((o: any) => ({ level: o.level, index: o.index, text: truncate(o.text, 80) })),
        lists: lists.slice(0, 5).map((l: any) => ({ level: l.level, ordered: !!l.ordered, text: truncate(l.text, 80) })),
        tables: tables.slice(0, 2).map((t: any) => ({ rows: Array.isArray(t.rows) ? t.rows.length : 0, firstRow: Array.isArray(t.rows?.[0]) ? t.rows[0].slice(0, 3).map((c: any) => ({ text: truncate(c?.text, 40), colspan: c?.colspan, rowspan: c?.rowspan })) : [] })),
        links: links.slice(0, 5).map((k: any) => ({ text: truncate(k.text, 60), href: k.href })),
        footnotes: footnotes.slice(0, 5).map((f: any) => ({ id: f.id, text: truncate(f.text, 80) })),
        images: images.slice(0, 5).map((im: any) => ({ rid: im.rid, target: im.target })),
      }
    }
  };

  console.log(JSON.stringify(preview, null, 2));

  if (outPath) {
    const out = outPath ?? '';
    const abs = path.isAbsolute(out) ? out : path.resolve(process.cwd(), out);
    const dir = path.dirname(abs);
    try { await fs.mkdir(dir, { recursive: true }); } catch {}
    const full = { meta: { contentType }, text, html, structured };
    await fs.writeFile(abs, JSON.stringify(full, null, 2), 'utf8');
    console.error(`已写入: ${abs}`);
  }

  if (htmlOutPath) {
    const out = htmlOutPath ?? '';
    const abs = path.isAbsolute(out) ? out : path.resolve(process.cwd(), out);
    const dir = path.dirname(abs);
    try { await fs.mkdir(dir, { recursive: true }); } catch {}
    const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DOCX 预览</title></head><body>${html ?? '<pre>（无 HTML 预览）</pre>'}</body></html>`;
    await fs.writeFile(abs, page, 'utf8');
    console.error(`HTML 预览已写入: ${abs}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


