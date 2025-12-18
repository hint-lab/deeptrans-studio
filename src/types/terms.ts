export interface DictEntry {
    term: string;
    translation: string;
    notes?: string;
    source?: string;
    dictionaryId?: string;
    id?: string;
}

export interface TermCandidate {
    term: string;
    score?: number;
}
