export const SYNTAX_CATEGORIES = [
    'modality_deontic',
    'condition_exception',
    'negation_scope',
    'actor_role',
    'coordination_logic',
    'attachment_boundary',
    'temporal_sequence',
    'quantifier_number',
    'reference_coreference',
    'grammar_register',
] as const;

export type SyntaxCategory = (typeof SYNTAX_CATEGORIES)[number];
export type SyntaxRelationStatus = 'preserved' | 'shifted' | 'omitted' | 'added' | 'uncertain';
export type SyntaxIssueSeverity = 'critical' | 'major' | 'minor';
export type SyntaxDimensionStatus = 'pass' | 'issue' | 'not_applicable' | 'uncertain';

export interface SyntaxRelation {
    id: string;
    category: SyntaxCategory;
    sourceSpan: string;
    targetSpan: string;
    sourceFunction?: string;
    targetFunction?: string;
    status: SyntaxRelationStatus;
    severity?: SyntaxIssueSeverity;
    confidence?: number;
    explanation?: string;
}

export interface SyntaxIssue {
    id: string;
    relationId?: string;
    category: SyntaxCategory;
    severity?: SyntaxIssueSeverity;
    sourceSpan: string;
    targetSpan: string;
    message: string;
    advice: string;
}

export interface SyntaxDimension {
    category: SyntaxCategory;
    status: SyntaxDimensionStatus;
    issueCount: number;
    note?: string;
}

export interface SyntaxQualitySummary {
    critical: number;
    major: number;
    minor: number;
    relationCount: number;
    checkedDimensionCount: number;
}

export interface SyntaxQualityResult {
    version: 2;
    status: 'complete' | 'partial' | 'failed';
    reviewStatus: 'pass' | 'needs_review' | 'unknown';
    legacy: boolean;
    warnings: string[];
    evaluation?: {
        id: string;
        sourceRevision: string;
        targetRevision: string;
        baseSource: string;
        baseTarget: string;
        embeddedIssueIds?: string[];
        proposalBaseTarget?: string;
    };
    relations: SyntaxRelation[];
    issues: SyntaxIssue[];
    dimensions: SyntaxDimension[];
    summary: SyntaxQualitySummary;
    selectedMap: Record<string, boolean>;
}

export interface SyntaxCueHints {
    source: Partial<Record<SyntaxCategory, string[]>>;
    target: Partial<Record<SyntaxCategory, string[]>>;
}

const CATEGORY_ALIASES: Record<string, SyntaxCategory> = {
    modality: 'modality_deontic',
    modal: 'modality_deontic',
    deontic: 'modality_deontic',
    modal_deontic: 'modality_deontic',
    modality_deontic: 'modality_deontic',
    conditional: 'condition_exception',
    condition: 'condition_exception',
    exception: 'condition_exception',
    condition_exception: 'condition_exception',
    negation: 'negation_scope',
    scope: 'negation_scope',
    negation_scope: 'negation_scope',
    actor: 'actor_role',
    role: 'actor_role',
    voice: 'actor_role',
    actor_role: 'actor_role',
    logic: 'coordination_logic',
    coordination: 'coordination_logic',
    conjunction: 'coordination_logic',
    coordination_logic: 'coordination_logic',
    attachment: 'attachment_boundary',
    boundary: 'attachment_boundary',
    parenthesis: 'attachment_boundary',
    attachment_boundary: 'attachment_boundary',
    temporal: 'temporal_sequence',
    tense: 'temporal_sequence',
    sequence: 'temporal_sequence',
    temporal_sequence: 'temporal_sequence',
    quantifier: 'quantifier_number',
    number: 'quantifier_number',
    quantity: 'quantifier_number',
    quantifier_number: 'quantifier_number',
    reference: 'reference_coreference',
    coreference: 'reference_coreference',
    pronoun: 'reference_coreference',
    reference_coreference: 'reference_coreference',
    grammar: 'grammar_register',
    register: 'grammar_register',
    punctuation: 'grammar_register',
    case: 'grammar_register',
    other: 'grammar_register',
    grammar_register: 'grammar_register',
};

const RELATION_STATUSES = new Set<SyntaxRelationStatus>([
    'preserved',
    'shifted',
    'omitted',
    'added',
    'uncertain',
]);
const ISSUE_SEVERITIES = new Set<SyntaxIssueSeverity>(['critical', 'major', 'minor']);
const DIMENSION_STATUSES = new Set<SyntaxDimensionStatus>([
    'pass',
    'issue',
    'not_applicable',
    'uncertain',
]);

function asString(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function asExactString(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function asRecord(value: unknown): Record<string, any> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, any>)
        : undefined;
}

function asNumber(value: unknown): number | undefined {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function clampConfidence(value: unknown): number | undefined {
    const parsed = asNumber(value);
    if (parsed === undefined) return undefined;
    const normalized = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
    return Math.max(0, Math.min(1, normalized));
}

function parseJsonLike(input: unknown): unknown {
    if (typeof input !== 'string') {
        const record = asRecord(input);
        if (record && typeof record.raw === 'string') {
            const parsedRaw = parseJsonLike(record.raw);
            if (parsedRaw !== undefined) return parsedRaw;
        }
        return input;
    }

    const text = input.trim();
    if (!text) return undefined;
    const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
    const candidate = (fenced?.[1] || text).trim();
    try {
        return JSON.parse(candidate);
    } catch {
        const firstBrace = candidate.indexOf('{');
        const lastBrace = candidate.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            try {
                return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
            } catch {
                return undefined;
            }
        }
        return undefined;
    }
}

function normalizeToken(value: unknown): string {
    return asString(value)
        .toLowerCase()
        .replace(/[\s/\-]+/g, '_');
}

function normalizeCategory(value: unknown): SyntaxCategory {
    return CATEGORY_ALIASES[normalizeToken(value)] || 'grammar_register';
}

function normalizeRelationStatus(
    value: unknown,
    sourceSpan: string,
    targetSpan: string,
    legacy: boolean
) {
    const token = normalizeToken(value) as SyntaxRelationStatus;
    if (RELATION_STATUSES.has(token)) return token;
    if (legacy) return 'uncertain' as const;
    if (sourceSpan && !targetSpan) return 'omitted' as const;
    if (!sourceSpan && targetSpan) return 'added' as const;
    return 'uncertain' as const;
}

function normalizeSeverity(value: unknown, fallback: SyntaxIssueSeverity = 'major') {
    const token = normalizeToken(value) as SyntaxIssueSeverity;
    return ISSUE_SEVERITIES.has(token) ? token : fallback;
}

function hashText(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function stableId(prefix: string, parts: unknown[], occurrence = 0): string {
    return `${prefix}-${hashText(parts.map(asString).join('\u241f'))}-${occurrence}`;
}

function relationSeverity(status: SyntaxRelationStatus): SyntaxIssueSeverity | undefined {
    if (status === 'omitted' || status === 'added' || status === 'shifted') return 'major';
    if (status === 'uncertain') return 'minor';
    return undefined;
}

function relationCandidates(value: Record<string, any>): unknown[] {
    for (const key of ['relations', 'syntaxRelations', 'syntaxPairs', 'pairs', 'items', 'data']) {
        if (Array.isArray(value[key])) return value[key];
    }
    return [];
}

function normalizeRelations(value: Record<string, any>, legacy: boolean): SyntaxRelation[] {
    const seen = new Map<string, number>();
    const usedIds = new Set<string>();
    return relationCandidates(value)
        .map((candidate, index): SyntaxRelation | undefined => {
            if (typeof candidate === 'string') {
                const parts = candidate.split(/=>|→|->/);
                candidate = {
                    sourceSpan: parts[0],
                    targetSpan: parts.length > 1 ? parts.slice(1).join('=>') : '',
                };
            }
            const item = asRecord(candidate);
            if (!item) return undefined;
            const sourceSpan = asString(
                item.sourceSpan ?? item.source ?? item.src ?? item.term ?? item.sourceMarker
            );
            const targetSpan = asString(
                item.targetSpan ?? item.target ?? item.tgt ?? item.translation ?? item.targetMarker
            );
            if (!sourceSpan && !targetSpan) return undefined;
            const category = normalizeCategory(item.category ?? item.type ?? item.markerType);
            const legacyScore = clampConfidence(item.score ?? item.alignment);
            const status = normalizeRelationStatus(item.status, sourceSpan, targetSpan, legacy);
            const fingerprint = [category, sourceSpan, targetSpan, status].map(asString).join('|');
            const occurrence = seen.get(fingerprint) || 0;
            seen.set(fingerprint, occurrence + 1);
            let id = asString(item.id) || stableId('rel', [fingerprint, index], occurrence);
            if (usedIds.has(id)) id = stableId('rel', [fingerprint, index], occurrence);
            usedIds.add(id);
            return {
                id,
                category,
                sourceSpan,
                targetSpan,
                sourceFunction: asString(item.sourceFunction) || undefined,
                targetFunction: asString(item.targetFunction) || undefined,
                status,
                severity: item.severity
                    ? normalizeSeverity(item.severity, relationSeverity(status) || 'minor')
                    : legacy
                      ? undefined
                      : relationSeverity(status),
                confidence: clampConfidence(item.confidence ?? item.score ?? item.alignment),
                explanation: asString(item.explanation ?? item.notes ?? item.note) || undefined,
            };
        })
        .filter((item): item is SyntaxRelation => Boolean(item));
}

function issueCandidates(value: Record<string, any>): unknown[] {
    return Array.isArray(value.issues)
        ? value.issues
        : Array.isArray(value.risks)
          ? value.risks
          : [];
}

function normalizeIssues(
    value: Record<string, any>,
    relations: SyntaxRelation[],
    legacy: boolean
): SyntaxIssue[] {
    const seen = new Map<string, number>();
    const usedIds = new Set<string>();
    const normalized = issueCandidates(value)
        .map((candidate, index): SyntaxIssue | undefined => {
            const item = asRecord(candidate);
            if (!item) return undefined;
            const category = normalizeCategory(item.category ?? item.type);
            const sourceSpan = asString(item.sourceSpan ?? item.source ?? item.span);
            const targetSpan = asString(item.targetSpan ?? item.target);
            const message = asString(
                item.message ?? item.problem ?? item.explanation ?? item.reason
            );
            const advice = asString(item.advice ?? item.suggestion ?? item.fix);
            if (!sourceSpan && !targetSpan && !message && !advice) return undefined;
            const relationId = asString(item.relationId) || undefined;
            const fingerprint = [category, sourceSpan, targetSpan, message, advice]
                .map(asString)
                .join('|');
            const occurrence = seen.get(fingerprint) || 0;
            seen.set(fingerprint, occurrence + 1);
            let id = asString(item.id) || stableId('issue', [fingerprint, index], occurrence);
            if (usedIds.has(id)) id = stableId('issue', [fingerprint, index], occurrence);
            usedIds.add(id);
            return {
                id,
                relationId,
                category,
                severity: item.severity
                    ? normalizeSeverity(item.severity)
                    : legacy
                      ? undefined
                      : 'major',
                sourceSpan,
                targetSpan,
                message: message || advice,
                advice,
            };
        })
        .filter((item): item is SyntaxIssue => Boolean(item));

    if (legacy) return normalized;

    const referenced = new Set(normalized.map(issue => issue.relationId).filter(Boolean));
    for (const relation of relations) {
        if (relation.status === 'preserved' || referenced.has(relation.id)) continue;
        const fingerprint = [
            relation.category,
            relation.sourceSpan,
            relation.targetSpan,
            relation.status,
        ];
        let id = stableId('issue', fingerprint);
        if (usedIds.has(id)) id = stableId('issue', [...fingerprint, relation.id]);
        usedIds.add(id);
        normalized.push({
            id,
            relationId: relation.id,
            category: relation.category,
            severity: relation.severity || relationSeverity(relation.status) || 'major',
            sourceSpan: relation.sourceSpan,
            targetSpan: relation.targetSpan,
            message: relation.explanation || `Relation is ${relation.status}.`,
            advice: '',
        });
    }
    return normalized;
}

function normalizeDimensions(
    value: Record<string, any>,
    relations: SyntaxRelation[],
    issues: SyntaxIssue[]
): SyntaxDimension[] {
    const supplied = new Map<SyntaxCategory, Record<string, any>>();
    if (Array.isArray(value.dimensions)) {
        for (const raw of value.dimensions) {
            const item = asRecord(raw);
            if (item) supplied.set(normalizeCategory(item.category ?? item.type), item);
        }
    }

    return SYNTAX_CATEGORIES.map(category => {
        const provided = supplied.get(category);
        const categoryRelations = relations.filter(relation => relation.category === category);
        const categoryIssues = issues.filter(issue => issue.category === category);
        let status: SyntaxDimensionStatus;
        const providedStatus = normalizeToken(provided?.status) as SyntaxDimensionStatus;
        if (DIMENSION_STATUSES.has(providedStatus)) status = providedStatus;
        else if (categoryIssues.length) status = 'issue';
        else if (categoryRelations.length) status = 'pass';
        else status = 'not_applicable';
        if (categoryIssues.length && status === 'pass') status = 'issue';
        return {
            category,
            status,
            issueCount: categoryIssues.length,
            note: asString(provided?.note ?? provided?.explanation) || undefined,
        };
    });
}

function normalizeSelection(
    value: Record<string, any>,
    issues: SyntaxIssue[]
): Record<string, boolean> {
    const supplied = asRecord(value.selectedMap) || {};
    const normalized: Record<string, boolean> = {};
    issues.forEach((issue, index) => {
        const legacyKey = [issue.category, issue.sourceSpan, issue.advice]
            .map(part => part.trim().toLowerCase())
            .join('|');
        normalized[issue.id] = supplied[issue.id] === true || supplied[legacyKey] === true;
        if (supplied[`idx:${index}`] === true) normalized[issue.id] = true;
    });
    return normalized;
}

export function normalizeSyntaxQualityResult(input: unknown): SyntaxQualityResult {
    const parsed = parseJsonLike(input);
    const value = asRecord(parsed) || {};
    const legacy = value.version !== 2 && value.schemaVersion !== '2.0';
    const hasRecognizedShape = [
        'relations',
        'syntaxRelations',
        'syntaxPairs',
        'pairs',
        'items',
        'data',
        'issues',
        'risks',
        'dimensions',
    ].some(key => Array.isArray(value[key]));
    const suppliedDimensions = Array.isArray(value.dimensions)
        ? value.dimensions
              .map(item => asRecord(item))
              .filter((item): item is Record<string, any> => Boolean(item))
        : [];
    const validSuppliedDimensionCategories = new Set(
        suppliedDimensions
            .filter(item => {
                const categoryToken = normalizeToken(item.category ?? item.type);
                const statusToken = normalizeToken(item.status) as SyntaxDimensionStatus;
                return (
                    Boolean(CATEGORY_ALIASES[categoryToken]) && DIMENSION_STATUSES.has(statusToken)
                );
            })
            .map(item => CATEGORY_ALIASES[normalizeToken(item.category ?? item.type)])
    );
    const hasCompleteV2Shape =
        Array.isArray(value.relations) &&
        Array.isArray(value.issues) &&
        Array.isArray(value.dimensions) &&
        SYNTAX_CATEGORIES.every(category => validSuppliedDimensionCategories.has(category));
    const relations = normalizeRelations(value, legacy);
    const issues = normalizeIssues(value, relations, legacy);
    const dimensions = normalizeDimensions(value, relations, issues);
    const selectedMap = normalizeSelection(value, issues);
    const storedEvaluation = asRecord(value.evaluation);
    const evaluation = storedEvaluation
        ? {
              id: asString(storedEvaluation.id),
              sourceRevision: asString(storedEvaluation.sourceRevision),
              targetRevision: asString(storedEvaluation.targetRevision),
              baseSource: asExactString(storedEvaluation.baseSource),
              baseTarget: asExactString(storedEvaluation.baseTarget),
              proposalBaseTarget:
                  storedEvaluation.proposalBaseTarget === undefined
                      ? undefined
                      : asExactString(storedEvaluation.proposalBaseTarget),
              embeddedIssueIds: Array.isArray(storedEvaluation.embeddedIssueIds)
                  ? storedEvaluation.embeddedIssueIds.map(asString).filter(Boolean)
                  : undefined,
          }
        : undefined;
    const severityCounts = issues.reduce(
        (counts, issue) => {
            if (issue.severity) counts[issue.severity] += 1;
            return counts;
        },
        { critical: 0, major: 0, minor: 0 }
    );
    const suppliedStatus = normalizeToken(value.status);
    const status: SyntaxQualityResult['status'] = !hasRecognizedShape
        ? 'failed'
        : suppliedStatus === 'failed'
          ? 'failed'
          : legacy || suppliedStatus === 'partial' || !hasCompleteV2Shape
            ? 'partial'
            : 'complete';
    const generatedWarnings = !hasRecognizedShape
        ? ['SYNTAX_QA_INVALID_RESPONSE']
        : legacy
          ? ['SYNTAX_QA_LEGACY_RESULT']
          : status === 'partial'
            ? ['SYNTAX_QA_PARTIAL_RESPONSE']
            : [];
    const suppliedWarnings = Array.isArray(value.warnings)
        ? value.warnings.map(asString).filter(Boolean)
        : [];
    const hasUncertainDimension = dimensions.some(item => item.status === 'uncertain');
    return {
        version: 2,
        status,
        reviewStatus:
            status === 'failed'
                ? 'unknown'
                : issues.length
                  ? 'needs_review'
                  : status === 'partial' || hasUncertainDimension
                    ? 'unknown'
                    : 'pass',
        legacy,
        warnings: [...new Set([...suppliedWarnings, ...generatedWarnings])],
        evaluation: evaluation?.id ? evaluation : undefined,
        relations,
        issues,
        dimensions,
        summary: {
            ...severityCounts,
            relationCount: relations.length,
            checkedDimensionCount: dimensions.filter(item => item.status !== 'not_applicable')
                .length,
        },
        selectedMap,
    };
}

export function buildSyntaxAlignmentResult(result: SyntaxQualityResult) {
    const alignedCount = result.relations.filter(
        relation => relation.sourceSpan && relation.targetSpan
    ).length;
    return {
        version: 2 as const,
        coverage: result.relations.length ? alignedCount / result.relations.length : 1,
        relations: result.relations,
    };
}

export function syntaxIssueKey(issue: SyntaxIssue): string {
    return issue.id;
}

export function isSyntaxEvaluationTargetCompatible(
    evaluation: SyntaxQualityResult['evaluation'],
    currentTarget: string,
    proposal?: string
): boolean {
    if (!evaluation) return false;
    return (
        currentTarget === evaluation.baseTarget ||
        (!!proposal && currentTarget === proposal) ||
        (evaluation.proposalBaseTarget !== undefined &&
            currentTarget === evaluation.proposalBaseTarget)
    );
}

const CUE_PATTERNS: Record<SyntaxCategory, RegExp[]> = {
    modality_deontic: [
        /\b(?:shall|must|may|should|need\s+not|is\s+(?:required|permitted|prohibited)\s+to)\b/gi,
        /(?:应当|必须|可以|不得|无需|有权|须)/g,
    ],
    condition_exception: [
        /\b(?:if|unless|except(?:\s+that|\s+where)?|provided\s+that|subject\s+to|where)\b/gi,
        /(?:如果|若|除非|但书|例外|条件是|在.+情况下)/g,
    ],
    negation_scope: [/\b(?:not|no|never|neither|without)\b/gi, /(?:不|未|无|不得|禁止|并非)/g],
    actor_role: [
        /\b(?:applicant|authority|party|person|employer|employee|buyer|seller|government)\b/gi,
        /(?:申请人|主管机关|当事人|主体|用人单位|劳动者|买方|卖方|政府)/g,
    ],
    coordination_logic: [
        /\b(?:and|or|and\/or|either|both|nor)\b/gi,
        /(?:以及|并且|或者|或|且|及)/g,
    ],
    attachment_boundary: [
        /\b(?:which|that|who|whose|including|excluding)\b/gi,
        /(?:其中|其|包括|不包括|所.+的|（|\()/g,
    ],
    temporal_sequence: [
        /\b(?:before|after|within|until|from|during|upon|no\s+later\s+than)\b/gi,
        /(?:之前|之后|以内|\d+\s*(?:日|天|月|年)内|届满|期间|自.+起|不迟于|一经)/g,
    ],
    quantifier_number: [
        /\b(?:all|any|each|every|some|at\s+least|at\s+most|more\s+than|less\s+than|\d+(?:\.\d+)?)\b/gi,
        /(?:全部|任何|每一|至少|至多|超过|少于|\d+(?:\.\d+)?)/g,
    ],
    reference_coreference: [
        /\b(?:this|that|these|those|such|it|they|the\s+former|the\s+latter)\b/gi,
        /(?:本法|本条|该|上述|前者|后者|其|此)/g,
    ],
    grammar_register: [/\b(?:is|are|was|were|has|have|had)\b/gi, /[;:；：。.!?！？]/g],
};

function detectCues(text: string): Partial<Record<SyntaxCategory, string[]>> {
    const output: Partial<Record<SyntaxCategory, string[]>> = {};
    for (const category of SYNTAX_CATEGORIES) {
        const matches = new Set<string>();
        for (const expression of CUE_PATTERNS[category]) {
            expression.lastIndex = 0;
            for (const match of text.matchAll(expression)) {
                const cue = asString(match[0]);
                if (cue) matches.add(cue);
                if (matches.size >= 12) break;
            }
        }
        if (matches.size) output[category] = [...matches];
    }
    return output;
}

export function collectSyntaxCueHints(source: string, target: string): SyntaxCueHints {
    return {
        source: detectCues(source || ''),
        target: detectCues(target || ''),
    };
}
