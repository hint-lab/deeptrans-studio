import { NextRequest, NextResponse } from 'next/server'
import { DocumentStatus } from '@/types/enums'
import { getQueue } from '@/worker/queue'
import { getRedis } from '@/lib/redis'
import { TTL_PROGRESS, TTL_BATCH, setJSONWithTTL, setTextWithTTL } from '@/lib/redis-ttl'
import { findDocumentsByProjectIdDB, findDocumentByIdDB, updateDocumentStatusDB } from '@/db/document'
import { createDocumentItemsBulkDB, deleteDocumentItemsByDocumentIdDB } from '@/db/documentItem'
import { extractTextFromUrl } from '@/lib/file-parser'
import { getFileUrlAction } from '@/actions/upload'

async function buildTextFromStructuredHelper(only: any, opts?: { isPreview?: boolean; headChars?: number; maxParas?: number }): Promise<string> {
  const isPreview = !!opts?.isPreview
  const headChars = Math.max(100, Math.min(8000, Number(opts?.headChars || 0)))
  const maxParas = Math.max(1, Number(opts?.maxParas || 0))
  try {
    const artifacts = (only as any)?.structured?.artifacts
    if (!artifacts) return ''
    let jsonUrl: string | null = artifacts?.jsonUrl || null
    if (!jsonUrl && artifacts?.jsonFile) {
      try { const r = await getFileUrlAction(String(artifacts.jsonFile)); jsonUrl = (r as any)?.data?.fileUrl || null } catch {}
    }
    if (!jsonUrl) return ''
    const r = await fetch(jsonUrl)
    if (!r.ok) return ''
    const j = await r.json()
    const paras = Array.isArray(j?.paragraphs) ? j.paragraphs : []
    if (!paras.length) return ''
    const out: string[] = []
    let n = 1
    let accLen = 0
    for (const p of paras) {
      const t = String(p?.text || '').trim()
      if (!t) continue
      const line = `${t}`
      const nextLen = accLen + line.length + 2
      out.push(line)
      accLen = nextLen
      n += 1
      if (isPreview) {
        if (maxParas && out.length >= maxParas) break
        if (headChars && accLen >= headChars) break
      }
    }
    return out.join('\n\n')
  } catch { return '' }
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
    const segment = {
      headChars: Number(q.get('headChars') || body?.segment?.headChars || 0) || undefined,
      preview: q.get('preview') === '1' ? true : (body?.segment?.preview === true)
    } as { headChars?: number; preview?: boolean }
    if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 })

    const only = docIdFromReq
      ? await findDocumentByIdDB(docIdFromReq)
      : (await findDocumentsByProjectIdDB(projectIdFromParams))?.[0]
    if (!only || !only.url) return NextResponse.json({ error: 'document not found' }, { status: 404 })
    try { await updateDocumentStatusDB(only.id, DocumentStatus.SEGMENTING as any) } catch {}

    // 构造正文（优先 structured）
    const isPreview = segment?.preview === true
    const previewHead = Math.max(500, Math.min(8000, Number(segment?.headChars ?? 2000)))
    let bodyText = await buildTextFromStructuredHelper(only, isPreview ? { isPreview: true, headChars: previewHead, maxParas: 20 } : undefined)
    if (!bodyText) {
      try {
        const { text } = await extractTextFromUrl(only.url)
        bodyText = String(text || '').trim()
      } catch {}
    }
    if (!bodyText) return NextResponse.json({ error: 'empty content' }, { status: 400 })

    const segBatch = isPreview ? `preview:${batchId}` : batchId

    if (isPreview) {
      // 直接按 structured JSON 的 paragraphs 输出分段（透传 level/styleName/runs/placeholderSpans）
      let paragraphs: Array<{ text?: string; level?: number|null; styleName?: string; runs?: any[]; placeholderSpans?: any[] }> = []
      try {
        const raw = await redis.get(`init.${batchId}.docx.structured`)
        if (raw) {
          const obj = JSON.parse(String(raw))
          if (Array.isArray(obj?.paragraphs)) paragraphs = obj.paragraphs as any[]
        }
      } catch {}
      // 若 Redis 不存在，尝试从对象存储读取
      if (!paragraphs.length) {
        try {
          const artifacts = (only as any)?.structured?.artifacts
          let jsonUrl: string | null = artifacts?.jsonUrl || null
          if (!jsonUrl && artifacts?.jsonFile) {
            try { const r = await getFileUrlAction(String(artifacts.jsonFile)); jsonUrl = (r as any)?.data?.fileUrl || null } catch {}
          }
          if (jsonUrl) {
            const r = await fetch(jsonUrl)
            const j = await r.json()
            if (Array.isArray(j?.paragraphs)) paragraphs = j.paragraphs as any[]
          }
        } catch {}
      }
      const out: Array<{ type: string; sourceText: string; metadata?: any }> = []
      const title = String((only as any)?.originalName || '').trim()
      if (title) out.push({ type: 'TITLE', sourceText: title, metadata: { level: 1 } })
      for (const p of paragraphs.slice(0, 200)) {
        const t = String((p as any)?.text || '').trim()
        if (!t) continue
        const level = (p as any)?.level ?? null
        const styleName = (p as any)?.styleName
        const runs = (p as any)?.runs
        const placeholderSpans = (p as any)?.placeholderSpans
        // 类型推导：Heading -> HEADING-n，普通段 -> PARAGRAPH，保留 styleName 标记
        const type = (level && level >= 1 && level <= 6)
          ? `HEADING-${level}`
          : (styleName ? String(styleName).toUpperCase() : 'PARAGRAPH')
        out.push({ type, sourceText: t, metadata: { level, styleName, runs, placeholderSpans } })
      }
      await setTextWithTTL(redis, `seg.${segBatch}.total`, '1', TTL_PROGRESS)
      await setTextWithTTL(redis, `seg.${segBatch}.done`, '1', TTL_PROGRESS)
      await setJSONWithTTL(redis, `seg.${segBatch}.item.seg.all`, { segments: out }, TTL_BATCH)
      return NextResponse.json({ ok: true, step: 'segment-preview' })
    }

    // 非预览：直接按 structured JSON 的 paragraphs 输出全量分段（不入队）
    let paragraphsAll: Array<{ text?: string; level?: number|null; styleName?: string; runs?: any[]; placeholderSpans?: any[] }> = []
    try {
      const raw = await redis.get(`init.${batchId}.docx.structured`)
      if (raw) {
        const obj = JSON.parse(String(raw))
        if (Array.isArray(obj?.paragraphs)) paragraphsAll = obj.paragraphs as any[]
      }
    } catch {}
    if (!paragraphsAll.length) {
      try {
        const docs = await findDocumentsByProjectIdDB(projectIdFromParams as any)
        const onlyDoc = docs?.[0]
        const artifacts = (onlyDoc as any)?.structured?.artifacts
        let jsonUrl: string | null = artifacts?.jsonUrl || null
        if (!jsonUrl && artifacts?.jsonFile) {
          try { const r = await getFileUrlAction(String(artifacts.jsonFile)); jsonUrl = (r as any)?.data?.fileUrl || null } catch {}
        }
        if (jsonUrl) {
          const r = await fetch(jsonUrl)
          const j = await r.json()
          if (Array.isArray(j?.paragraphs)) paragraphsAll = j.paragraphs as any[]
        }
      } catch {}
    }
    const outAll: Array<{ type: string; sourceText: string; metadata?: any }> = []
    const titleFull = String((only as any)?.originalName || '').trim()
    if (titleFull) outAll.push({ type: 'TITLE', sourceText: titleFull, metadata: { level: 1 } })
    for (const p of paragraphsAll) {
      const t = String((p as any)?.text || '').trim()
      if (!t) continue
      const level = (p as any)?.level ?? null
      const styleName = (p as any)?.styleName
      const runs = (p as any)?.runs
      const placeholderSpans = (p as any)?.placeholderSpans
      const type = (level && level >= 1 && level <= 6)
        ? `HEADING-${level}`
        : (styleName ? String(styleName).toUpperCase() : 'PARAGRAPH')
      outAll.push({ type, sourceText: t, metadata: { level, styleName, runs, placeholderSpans } })
    }
    await setTextWithTTL(redis, `seg.${segBatch}.total`, '1', TTL_PROGRESS)
    await setTextWithTTL(redis, `seg.${segBatch}.done`, '1', TTL_PROGRESS)
    await setJSONWithTTL(redis, `seg.${segBatch}.item.seg.all`, { segments: outAll }, TTL_BATCH)
    // 持久化为 DocumentItem，供 IDE 使用
    try {
      const docId = (only as any)?.id
      if (docId && outAll.length) {
        try { await deleteDocumentItemsByDocumentIdDB(docId) } catch {}
        const items = outAll.map((s, idx) => ({
          documentId: docId,
          order: idx + 1,
          sourceText: s.sourceText,
          targetText: null,
          status: 'NOT_STARTED' as any,
          type: s.type || 'TEXT',
          metadata: s.metadata ?? null,
        }))
        if (items.length) await createDocumentItemsBulkDB(items as any)
      }
    } catch {}
    try { await updateDocumentStatusDB(only.id, DocumentStatus.PREPROCESSED as any) } catch {}
    return NextResponse.json({ ok: true, step: 'segment' })
  } catch (e: any) {
    try {
      const { id: projectIdFromParams } = await ctx.params
      const docs = await findDocumentsByProjectIdDB(projectIdFromParams)
      const only = docs?.[0]
      if (only?.id) { try { await updateDocumentStatusDB(only.id, DocumentStatus.ERROR as any) } catch {} }
    } catch {}
    return NextResponse.json({ error: e?.message || 'segment failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, ctx: any) {
  try {
    await (ctx?.params)
    const batchId = req.nextUrl.searchParams.get('batchId') || ''
    if (!batchId) return NextResponse.json({ error: 'missing batchId' }, { status: 400 })
    const waitMs = Math.max(0, Math.min(30000, Number(req.nextUrl.searchParams.get('wait') || '0')))
    const previewMode = req.nextUrl.searchParams.get('preview') === '1'
    const showAll = req.nextUrl.searchParams.get('all') === '1'
    const segBatch = previewMode ? `preview:${batchId}` : batchId
    const redis = await getRedis()
    const toPct = (t: any, d: any) => Number(t) > 0 ? Math.min(100, Math.round((Number(d) / Number(t)) * 100)) : 0
    async function readStatus() {
      const [segT, segD, segItemJson] = await Promise.all([
        redis.get(`seg.${segBatch}.total`),
        redis.get(`seg.${segBatch}.done`),
        redis.get(`seg.${segBatch}.item.seg.all`),
      ])
      const segProgress = toPct(segT, segD)
      let segments: Array<{ type: string; sourceText: string; metadata?: any }> | undefined
      try {
        const obj = segItemJson ? JSON.parse(String(segItemJson)) : null
        const arr = obj && Array.isArray(obj.segments) ? obj.segments : undefined
        if (arr) {
          segments = arr.map((s: any) => ({ type: s?.type, sourceText: String(s?.sourceText || ''), metadata: s?.metadata }))
        } else {
          const total = Number(segT) || 0
          if (total > 0) {
            const parts: Array<{ type: string; sourceText: string; metadata?: any }> = []
            for (let i = 0; i < total; i++) {
              const raw = await redis.get(`seg.${segBatch}.item.seg.part.${i}`)
              if (!raw) continue
              const pj = JSON.parse(String(raw))
              const parr = pj && Array.isArray(pj.segments) ? pj.segments : []
              for (const s of parr) parts.push({ type: s?.type, sourceText: String(s?.sourceText || ''), metadata: s?.metadata })
            }
            if (parts.length) segments = parts
          }
        }
      } catch {}
      if (previewMode && Array.isArray(segments) && !showAll) segments = segments.slice(0, 20)
      return { segProgress, segments }
    }

    if (waitMs > 0) {
      const start = Date.now()
      while (Date.now() - start < waitMs) {
        const [segT, segD] = await Promise.all([
          redis.get(`seg.${segBatch}.total`),
          redis.get(`seg.${segBatch}.done`),
        ])
        const curSeg = toPct(segT, segD)
        if (previewMode && curSeg > 0) return NextResponse.json(await readStatus())
        await new Promise(r => setTimeout(r, 3000))
      }
      return NextResponse.json(await readStatus())
    }
    return NextResponse.json(await readStatus())
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'status failed' }, { status: 500 })
  }
}


