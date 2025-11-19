import type { DocumentTerm } from './types'
import { extractLatinTokens, extractCjkChargrams } from './tokenize'

export function splitChunks(raw: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < raw.length; i += Math.max(1, (chunkSize - overlap))) {
    const end = Math.min(raw.length, i + chunkSize)
    chunks.push(raw.slice(i, end))
    if (end >= raw.length) break
  }
  return chunks
}

export function buildStatCandidates(raw: string, chunkSize: number, overlap: number, maxCandidates: number): DocumentTerm[] {
  const chunks = splitChunks(raw, chunkSize, overlap)
  const totalChunks = Math.max(1, chunks.length)

  const tokenChunkPresence = new Map<string, Set<number>>()
  const tokenFreq = new Map<string, number>()
  const leftNeighbors = new Map<string, Set<string>>()
  const rightNeighbors = new Map<string, Set<string>>()

  const unigramCounts = new Map<string, number>()
  const bigramCounts = new Map<string, number>()
  const trigramCounts = new Map<string, number>()
  let totalUnigrams = 0

  chunks.forEach((c, idx) => {
    const latin = extractLatinTokens(c)
    const cjk = extractCjkChargrams(c)
    const tokens = [...latin, ...cjk]
    const seen = new Set<string>()

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      if (!tok) continue
      const key = String(tok).trim()
      if (!key) continue

      tokenFreq.set(key, (tokenFreq.get(key) ?? 0) + 1)
      unigramCounts.set(key, (unigramCounts.get(key) ?? 0) + 1)
      totalUnigrams += 1

      const left = tokens[i - 1]
      const right = tokens[i + 1]
      if (left) {
        if (!leftNeighbors.has(key)) leftNeighbors.set(key, new Set<string>())
        leftNeighbors.get(key)!.add(String(left))
      }
      if (right) {
        if (!rightNeighbors.has(key)) rightNeighbors.set(key, new Set<string>())
        rightNeighbors.get(key)!.add(String(right))
      }

      if (i + 1 < tokens.length && tokens[i] && tokens[i + 1]) {
        const bg = `${String(tokens[i])} ${String(tokens[i + 1])}`
        bigramCounts.set(bg, (bigramCounts.get(bg) ?? 0) + 1)
      }
      if (i + 2 < tokens.length && tokens[i] && tokens[i + 1] && tokens[i + 2]) {
        const tg = `${String(tokens[i])} ${String(tokens[i + 1])} ${String(tokens[i + 2])}`
        trigramCounts.set(tg, (trigramCounts.get(tg) ?? 0) + 1)
      }

      if (!seen.has(key)) {
        if (!tokenChunkPresence.has(key)) tokenChunkPresence.set(key, new Set<number>())
        tokenChunkPresence.get(key)!.add(idx)
        seen.add(key)
      }
    }
  })

  function computePMIForNgram(ngram: string): number {
    const parts = ngram.split(' ')
    if (parts.length === 2) {
      const c12 = bigramCounts.get(ngram) ?? 0
      const p0 = String(parts[0] ?? '')
      const p1s = String(parts[1] ?? '')
      const c1 = unigramCounts.get(p0) ?? 1
      const c2 = unigramCounts.get(p1s) ?? 1
      const p12 = c12 / Math.max(1, totalUnigrams)
      const p1 = c1 / Math.max(1, totalUnigrams)
      const p2 = c2 / Math.max(1, totalUnigrams)
      return Math.log((p12 + 1e-9) / (p1 * p2 + 1e-12))
    }
    if (parts.length === 3) {
      const p0 = String(parts[0] ?? '')
      const p1s = String(parts[1] ?? '')
      const p2s = String(parts[2] ?? '')
      const c123 = trigramCounts.get(ngram) ?? 0
      const c12 = bigramCounts.get(`${p0} ${p1s}`) ?? 1
      const c23 = bigramCounts.get(`${p1s} ${p2s}`) ?? 1
      const c1 = unigramCounts.get(p0) ?? 1
      const c2 = unigramCounts.get(p1s) ?? 1
      const c3 = unigramCounts.get(p2s) ?? 1
      const p123 = c123 / Math.max(1, totalUnigrams)
      const p12 = c12 / Math.max(1, totalUnigrams)
      const p23 = c23 / Math.max(1, totalUnigrams)
      const p1 = c1 / Math.max(1, totalUnigrams)
      const p2 = c2 / Math.max(1, totalUnigrams)
      const p3 = c3 / Math.max(1, totalUnigrams)
      const denom = p1 * p2 * p3
      return Math.log((p123 + 1e-9) / (denom + 1e-12)) + Math.log((p12 + 1e-9) * (p23 + 1e-9) + 1e-12)
    }
    return 0
  }

  const candidateMap = new Map<string, { freq: number; chunks: number }>()
  for (const [t, f] of tokenFreq.entries()) {
    const present = tokenChunkPresence.get(t)?.size ?? 0
    const coverage = present / totalChunks
    if (coverage > 0.8) continue
    if (!/[\u4e00-\u9fff]/.test(t) && t.length < 3) continue
    candidateMap.set(t, { freq: f, chunks: present })
  }
  for (const [bg, f] of bigramCounts.entries()) {
    if (f < 2) continue
    candidateMap.set(bg, { freq: f, chunks: totalChunks })
  }
  for (const [tg, f] of trigramCounts.entries()) {
    if (f < 2) continue
    candidateMap.set(tg, { freq: f, chunks: totalChunks })
  }

  const scored: Array<{ term: string; score: number; count: number }> = []
  for (const [term, meta] of candidateMap.entries()) {
    const df = Math.max(1, meta.chunks)
    const idf = Math.log((totalChunks + 1) / (df + 0.5)) + 1
    const tfidf = meta.freq * idf
    const lenBoost = Math.log2((/\s+/.test(term) ? term.split(/\s+/).length : term.length) + 1)
    const ldiv = (leftNeighbors.get(term)?.size ?? 0)
    const rdiv = (rightNeighbors.get(term)?.size ?? 0)
    const diversity = Math.log(1 + ldiv + rdiv)
    let pmiBoost = 0
    if (/\s/.test(term)) {
      const parts = term.split(' ')
      if (parts.length === 2 || parts.length === 3) pmiBoost = Math.max(0, computePMIForNgram(term))
    }
    const score = 0.5 * tfidf + 0.3 * pmiBoost + 0.2 * diversity + 0.1 * lenBoost
    scored.push({ term, score, count: meta.freq })
  }

  scored.sort((a, b) => (b.score - a.score) || (b.count - a.count) || ((b.term?.length || 0) - (a.term?.length || 0)))
  const out: DocumentTerm[] = scored.slice(0, Math.max(1, maxCandidates)).map(s => ({ term: s.term, count: s.count, score: s.score }))
  return out
}


