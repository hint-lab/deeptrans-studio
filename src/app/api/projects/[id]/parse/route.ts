import { NextRequest, NextResponse } from 'next/server'
import { DocumentStatus } from '@/types/enums'
import { getRedis } from '@/lib/redis'
import { findDocumentsByProjectIdDB, findDocumentByIdDB, updateDocumentStatusDB } from '@/db/document'
import { extractTextFromUrl } from '@/lib/file-parser'
import { extractDocxFromUrl } from '@/lib/parsers/docx-parser'
import { TTL_PREVIEW, TTL_BATCH, setTextWithTTL } from '@/lib/redis-ttl'

function makePreviewHtmlFromText(content: string): string {
  const raw = String(content || '').slice(0, 5000)
  const esc = raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const htmlBody = esc.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')
  return `<div>${htmlBody}</div>`
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    const redis = await getRedis()
    const { id: projectIdFromParams } = await (ctx?.params || {})
    const q = req.nextUrl.searchParams
    let body: any = {}
    try { body = await req.json() } catch {}
    const batchId = String(q.get('batchId') || body?.batchId || '')
    const docIdFromReq = String(q.get('docId') || body?.documentId || '') || undefined
    if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 })

    const only = docIdFromReq
      ? await findDocumentByIdDB(docIdFromReq)
      : (await findDocumentsByProjectIdDB(projectIdFromParams))?.[0]
    if (!only || !only.url) return NextResponse.json({ error: 'document not found' }, { status: 404 })
    try { await updateDocumentStatusDB(only.id, DocumentStatus.PARSING as any) } catch {}

    let content = ''
    let previewHtml: string | undefined
    try {
      const { text, html, structured } = await extractDocxFromUrl(only.url)
      if (text || html) {
        content = String(text || '').trim()
        previewHtml = html
      }
      if (structured) {
        await setTextWithTTL(redis, `init:${batchId}:docx:structured`, JSON.stringify(structured), TTL_BATCH)
      }
    } catch {}
    if (!content) {
      const { text } = await extractTextFromUrl(only.url)
      content = String(text || '').trim()
    }
    if (!content) return NextResponse.json({ error: 'empty content' }, { status: 400 })
    if (!previewHtml) previewHtml = makePreviewHtmlFromText(content)
    const preview = content.slice(0, 1200)
    await setTextWithTTL(redis, `init:${batchId}:preview`, preview, TTL_PREVIEW)
    if (previewHtml && previewHtml.trim()) await setTextWithTTL(redis, `init:${batchId}:previewHtml`, previewHtml.slice(0, 200_000), TTL_PREVIEW)
    try { await updateDocumentStatusDB(only.id, DocumentStatus.PREPROCESSED as any) } catch {}
    return NextResponse.json({ ok: true, step: 'parse' })
  } catch (e: any) {
    try {
      const { id: projectIdFromParams } = await ctx.params
      const docs = await findDocumentsByProjectIdDB(projectIdFromParams)
      const only = docs?.[0]
      if (only?.id) { try { await updateDocumentStatusDB(only.id, DocumentStatus.ERROR as any) } catch {} }
    } catch {}
    return NextResponse.json({ error: e?.message || 'parse failed' }, { status: 500 })
  }
}


