export interface AhoNode {
    children: Map<string, number>;
    fail: number;
    outputs: number[];
}

export interface AhoAutomaton {
    nodes: AhoNode[];
    patterns: string[];
}

function normalize(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getNode(nodes: AhoNode[], index: number): AhoNode {
    return nodes[index] ?? nodes[0]!;
}

export function buildAutomaton(rawPatterns: string[]): AhoAutomaton {
    const patterns = rawPatterns
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
        .map(p => normalize(p))
        .filter(p => p.length > 0);

    const nodes: AhoNode[] = [{ children: new Map<string, number>(), fail: 0, outputs: [] }];

    // 构建 Trie
    for (let i = 0; i < patterns.length; i++) {
        const patternStr = patterns[i]!;
        let current = 0;
        for (const ch of patternStr) {
            const currentNode = getNode(nodes, current);
            if (!currentNode.children.has(ch)) {
                currentNode.children.set(ch, nodes.length);
                nodes.push({ children: new Map<string, number>(), fail: 0, outputs: [] });
            }
            const nextIndex = currentNode.children.get(ch);
            current = typeof nextIndex === 'number' ? nextIndex : 0;
        }
        getNode(nodes, current).outputs.push(i);
    }

    // 构建失败指针（BFS）
    const queue: number[] = [];
    for (const [ch, next] of getNode(nodes, 0).children.entries()) {
        void ch;
        getNode(nodes, next).fail = 0;
        queue.push(next);
    }

    while (queue.length > 0) {
        const state = queue.shift()!;
        const stateNode = getNode(nodes, state);
        for (const [ch, next] of stateNode.children.entries()) {
            queue.push(next);
            let f = stateNode.fail;
            while (f !== 0 && !getNode(nodes, f).children.has(ch)) {
                f = getNode(nodes, f).fail;
            }
            if (getNode(nodes, f).children.has(ch)) {
                const failNext = getNode(nodes, f).children.get(ch);
                getNode(nodes, next).fail = typeof failNext === 'number' ? failNext : 0;
            } else {
                getNode(nodes, next).fail = 0;
            }
            getNode(nodes, next).outputs.push(...getNode(nodes, getNode(nodes, next).fail).outputs);
        }
    }

    return { nodes, patterns };
}

export function findMatches(rawText: string, automaton: AhoAutomaton): Set<number> {
    const text = normalize(rawText);
    const matched = new Set<number>();

    let state = 0;
    for (const ch of text) {
        while (state !== 0 && !getNode(automaton.nodes, state).children.has(ch)) {
            state = getNode(automaton.nodes, state).fail;
        }
        if (getNode(automaton.nodes, state).children.has(ch)) {
            const nextIndex = getNode(automaton.nodes, state).children.get(ch);
            state = typeof nextIndex === 'number' ? nextIndex : 0;
        }
        for (const out of getNode(automaton.nodes, state).outputs) {
            matched.add(out);
        }
    }

    return matched;
}

export function buildGlossaryFromMatches(
    text: string,
    terms: Array<{ source: string; target: string }>,
    maxItems = 200
): Record<string, string> {
    const patterns = terms.map(t => t.source ?? '').filter(Boolean);
    const automaton = buildAutomaton(patterns);
    const matchedIdx = findMatches(text, automaton);

    const glossary: Record<string, string> = {};
    let count = 0;
    for (const idx of matchedIdx) {
        if (count >= maxItems) break;
        const t = terms[idx];
        if (!t) continue;
        const source = t.source;
        const target = t.target;
        if (!source || !target) continue;
        if (!(source in glossary)) {
            glossary[source] = target;
            count++;
        }
    }
    return glossary;
}
