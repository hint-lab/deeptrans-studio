export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { findDocumentItemTextPairsByDocumentIdDB } from '@/db/documentItem';
import type { TableRow as DocxTableRow } from 'docx';

export async function GET(req: Request) {
  try {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } = await import('docx');
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');
    const mode = (searchParams.get('mode') || 'bilingual').toLowerCase(); // 'bilingual' | 'target'
    const layout = (searchParams.get('layout') || 'horizontal').toLowerCase(); // 'horizontal' | 'vertical'
    if (!documentId) return NextResponse.json({ ok: false, error: '缺少 documentId' }, { status: 400 });

    const items = await findDocumentItemTextPairsByDocumentIdDB(documentId);

    let rows: DocxTableRow[] = [];
    let useTable = false;
    if (layout === 'horizontal' && mode !== 'target') {
      rows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: '源文', heading: HeadingLevel.HEADING_3 })], width: { size: 50, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ text: '译文', heading: HeadingLevel.HEADING_3 })], width: { size: 50, type: WidthType.PERCENTAGE } }),
          ],
        }),
        ...items.map((it) => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: (it.sourceText || '').trim() || '-' })] }),
            new TableCell({ children: [new Paragraph({ text: (it.targetText || '').trim() || '-' })] }),
          ],
        })),
      ];
      useTable = true;
    }

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: mode === 'target' ? '译文导出' : (layout === 'horizontal' ? '双语导出（左右）' : '双语导出（上下）'), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: ' ' }),
            ...(useTable
              ? [new Table({ rows })]
              : (
                  mode === 'target'
                    ? items.flatMap((it) => [
                        new Paragraph({ text: (it.targetText || '').trim() || '-' }),
                        new Paragraph({ text: ' ' }),
                      ])
                    : items.flatMap((it) => [
                        new Paragraph({ text: '源文', heading: HeadingLevel.HEADING_3 }),
                        new Paragraph({ text: (it.sourceText || '').trim() || '-' }),
                        new Paragraph({ text: ' ' }),
                        new Paragraph({ text: '译文', heading: HeadingLevel.HEADING_3 }),
                        new Paragraph({ text: (it.targetText || '').trim() || '-' }),
                        new Paragraph({ text: ' ' }),
                      ])
                )
            ),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${mode === 'target' ? 'translation' : (layout === 'horizontal' ? 'bilingual-horizontal' : 'bilingual-vertical')}.docx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}


