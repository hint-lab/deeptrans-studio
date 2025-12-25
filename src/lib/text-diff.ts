// Lightweight text diff helpers shared across panels

export function tokenizeWords(text: string): string[] {
    return text.match(/\w+|[^\w\s]|\s+/g) || [];
}

export function wordDiff(
    a: string,
    b: string
): {
    baseline: Array<{ text: string; type: 'equal' | 'del' }>;
    embedded: Array<{ text: string; type: 'equal' | 'ins' }>;
} {
    const aTokens = tokenizeWords(a);
    const bTokens = tokenizeWords(b);
    const n = aTokens.length;
    const m = bTokens.length;
    if (n * m > 300000) {
        let start = 0;
        const maxStart = Math.min(n, m);
        while (start < maxStart && aTokens[start] === bTokens[start]) start++;
        let endA = n - 1;
        let endB = m - 1;
        while (endA >= start && endB >= start && aTokens[endA] === bTokens[endB]) {
            endA--;
            endB--;
        }
        const baseline: Array<{ text: string; type: 'equal' | 'del' }> = [];
        const embedded: Array<{ text: string; type: 'equal' | 'ins' }> = [];
        for (let i = 0; i < start; i++) {
            baseline.push({ text: String(aTokens[i] ?? ''), type: 'equal' });
            embedded.push({ text: String(bTokens[i] ?? ''), type: 'equal' });
        }
        for (let i = start; i <= endA; i++)
            baseline.push({ text: String(aTokens[i] ?? ''), type: 'del' });
        for (let j = start; j <= endB; j++)
            embedded.push({ text: String(bTokens[j] ?? ''), type: 'ins' });
        for (let i = endA + 1, j = endB + 1; i < n && j < m; i++, j++) {
            baseline.push({ text: String(aTokens[i] ?? ''), type: 'equal' });
            embedded.push({ text: String(bTokens[j] ?? ''), type: 'equal' });
        }
        return { baseline, embedded };
    }
    const cols = m + 1;
    const dp = new Array((n + 1) * (m + 1)).fill(0) as number[];
    const at = (i: number, j: number): number => {
        if (i < 0 || j < 0 || i > n || j > m) return 0;
        const v = dp[i * cols + j];
        return typeof v === 'number' ? v : 0;
    };
    const set = (i: number, j: number, v: number) => {
        if (i >= 0 && j >= 0 && i <= n && j <= m) dp[i * cols + j] = v;
    };
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            if ((aTokens[i] ?? '') === (bTokens[j] ?? '')) set(i, j, at(i + 1, j + 1) + 1);
            else set(i, j, Math.max(at(i + 1, j), at(i, j + 1)));
        }
    }
    const baseline: Array<{ text: string; type: 'equal' | 'del' }> = [];
    const embedded: Array<{ text: string; type: 'equal' | 'ins' }> = [];
    let i = 0,
        j = 0;
    while (i < n && j < m) {
        if ((aTokens[i] ?? '') === (bTokens[j] ?? '')) {
            baseline.push({ text: String(aTokens[i] ?? ''), type: 'equal' });
            embedded.push({ text: String(bTokens[j] ?? ''), type: 'equal' });
            i++;
            j++;
        } else if (at(i + 1, j) >= at(i, j + 1)) {
            baseline.push({ text: String(aTokens[i] ?? ''), type: 'del' });
            i++;
        } else {
            embedded.push({ text: String(bTokens[j] ?? ''), type: 'ins' });
            j++;
        }
    }
    while (i < n) {
        baseline.push({ text: String(aTokens[i] ?? ''), type: 'del' });
        i++;
    }
    while (j < m) {
        embedded.push({ text: String(bTokens[j] ?? ''), type: 'ins' });
        j++;
    }
    return { baseline, embedded };
}
