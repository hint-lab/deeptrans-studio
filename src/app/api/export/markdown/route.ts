export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { findDocumentItemTextPairsByDocumentIdDB } from '@/db/documentItem';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');
    const mode = (searchParams.get('mode') || 'bilingual').toLowerCase();
    const layout = (searchParams.get('layout') || 'vertical').toLowerCase();
    if (!documentId) return NextResponse.json({ ok: false, error: '缺少 documentId' }, { status: 400 });

    const items = await findDocumentItemTextPairsByDocumentIdDB(documentId);

    const lines: string[] = [];
    if (mode === 'target') {
      items.forEach((it) => {
        lines.push((it.targetText || '').trim());
      });
    } else if (layout === 'horizontal') {
      const escapeCell = (s: string) => (s || '').trim().replace(/\|/g, '\\|').replace(/\n/g, '<br/>');
      lines.push(`| 源文 | 译文 |`);
      lines.push(`| --- | --- |`);
      items.forEach((it) => {
        lines.push(`| ${escapeCell(it.sourceText || '')} | ${escapeCell(it.targetText || '')} |`);
      });
    } else {
      items.forEach((it) => {
        lines.push(`**源文**`);
        lines.push((it.sourceText || '').trim());
        lines.push('');
        lines.push(`**译文**`);
        lines.push((it.targetText || '').trim());
        lines.push('');
      });
    }

    const body = lines.join('\n');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${mode === 'target' ? 'translation' : (layout === 'horizontal' ? 'bilingual-horizontal' : 'bilingual-vertical')}.md"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}


