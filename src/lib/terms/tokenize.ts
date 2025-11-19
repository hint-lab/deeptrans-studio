export function extractLatinTokens(text: string): string[] {
  const out: string[] = []
  const re = /[A-Za-z][A-Za-z0-9\-_.]*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const w = String(m[0] || '')
    if (!w) continue
    if (/^[0-9]+$/.test(w)) continue
    out.push(w)
  }
  return out
}

export function extractCjkChargrams(text: string, minN = 2, maxN = 6): string[] {
  const only = text.replace(/[^\u4e00-\u9fff]/g, '')
  const out: string[] = []
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= only.length; i++) {
      out.push(only.slice(i, i + n))
    }
  }
  return out
}


