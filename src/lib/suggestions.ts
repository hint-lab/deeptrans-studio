export type ApplySuggestion = {
    id?: string;
    source: string;
    target: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
};

export function applySuggestionsToText(
    text: string,
    suggs: ApplySuggestion[]
): { text: string; appliedIds: string[] } {
    if (!text || !suggs?.length) return { text, appliedIds: [] };
    let out = text;
    const appliedIds: string[] = [];
    for (const s of suggs) {
        const src = s.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = s.wholeWord ? `(^|\\b)${src}(?=\\b|$)` : src;
        const flags = s.caseSensitive ? 'g' : 'gi';
        const before = out;
        out = out.replace(new RegExp(pattern, flags), s.target);
        if (out !== before && s.id) appliedIds.push(s.id);
    }
    return { text: out, appliedIds };
}
