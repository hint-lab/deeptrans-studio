export function extractLatinTokens(text: string): string[] {
    const out: string[] = [];
    const re = /[A-Za-z][A-Za-z0-9\-_.]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const w = String(m[0] || '');
        if (!w) continue;
        if (/^[0-9]+$/.test(w)) continue;
        out.push(w);
    }
    return out;
}

export function extractCjkChargrams(text: string, minN = 2, maxN = 6): string[] {
    const out: string[] = [];
    const runs = String(text || '').match(/[\u3400-\u9fff]+/g) || [];
    for (const run of runs) {
        for (let n = minN; n <= maxN; n++) {
            for (let i = 0; i + n <= run.length; i++) {
                out.push(run.slice(i, i + n));
            }
        }
    }
    return out;
}

/**
 * Produces readable Chinese term candidates instead of overlapping character
 * grams. Word boundaries come from the runtime segmenter, while adjacent
 * 2–4-word phrases retain domain expressions such as “生态环境主管部门”.
 */
export function extractCjkTerms(text: string, maxWords = 4, maxChars = 12): string[] {
    const out: string[] = [];
    const flush = (words: string[]) => {
        for (let size = 1; size <= Math.max(1, maxWords); size++) {
            for (let start = 0; start + size <= words.length; start++) {
                const phrase = words.slice(start, start + size).join('');
                if (phrase.length >= 2 && phrase.length <= maxChars) out.push(phrase);
            }
        }
    };

    try {
        const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
        let words: string[] = [];
        for (const part of segmenter.segment(String(text || ''))) {
            const value = String(part.segment || '').trim();
            if (part.isWordLike && /^[\u3400-\u9fff]+$/.test(value)) {
                words.push(value);
                continue;
            }
            if (words.length) flush(words);
            words = [];
        }
        if (words.length) flush(words);
        return out;
    } catch {
        return extractCjkChargrams(text, 2, Math.min(6, maxChars));
    }
}
