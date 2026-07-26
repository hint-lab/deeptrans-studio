import { resolveProjectInitResumeTarget } from './document-init-status';

export type ProjectDashboardStatusKey =
    | 'waiting'
    | 'parsing'
    | 'segmenting'
    | 'termsExtracting'
    | 'preprocessed'
    | 'translating'
    | 'completed'
    | 'error'
    | 'unknown';

export type ProjectDashboardStatusTone = 'neutral' | 'active' | 'ready' | 'danger' | 'attention';

export type ProjectDashboardActionKey =
    | 'continueSetup'
    | 'repairSetup'
    | 'startTranslation'
    | 'resumeTranslation'
    | 'openWorkspace'
    | 'contactOwner';

export type ProjectDashboardRiskKey = 'readOnly' | 'error' | 'unknown';

export type ProjectDashboardEntry = {
    href: string;
    statusKey: ProjectDashboardStatusKey;
    statusTone: ProjectDashboardStatusTone;
    actionKey: ProjectDashboardActionKey;
};

export type ProjectDashboardHandoff = ProjectDashboardEntry & {
    /**
     * A non-editor may inspect the dashboard record, but must not be prompted
     * to open a workflow route whose server actions require project ownership.
     */
    riskKeys: ProjectDashboardRiskKey[];
    /** Only writers have a dashboard route that can safely advance the workflow. */
    canOpen: boolean;
};

/**
 * Maps the latest document state to the only safe dashboard entry point.
 * Unknown or missing state returns to initialization instead of sending a
 * user into an IDE route that is guaranteed to redirect them back out.
 */
export function getProjectDashboardEntry(
    projectId: string,
    documentStatus: unknown
): ProjectDashboardEntry {
    const encodedProjectId = encodeURIComponent(projectId);
    const status = getProjectDashboardStatus(documentStatus);
    const resumeTarget = resolveProjectInitResumeTarget(documentStatus);

    return {
        href:
            resumeTarget === 'ide'
                ? `/ide/${encodedProjectId}`
                : `/dashboard/projects/${encodedProjectId}/init`,
        ...status,
        actionKey: getProjectDashboardAction(documentStatus),
    };
}

/**
 * Returns the dashboard copy model for a translator's handoff: current state,
 * the one safe next action, and only the risks that need their attention.
 */
export function getProjectDashboardHandoff(
    projectId: string,
    documentStatus: unknown,
    canWrite: boolean
): ProjectDashboardHandoff {
    const entry = getProjectDashboardEntry(projectId, documentStatus);
    const riskKeys: ProjectDashboardRiskKey[] = [];

    if (!canWrite) riskKeys.push('readOnly');
    if (entry.statusKey === 'error') riskKeys.push('error');
    if (entry.statusKey === 'unknown') riskKeys.push('unknown');

    return {
        ...entry,
        actionKey: canWrite ? entry.actionKey : 'contactOwner',
        riskKeys,
        canOpen: canWrite,
    };
}

/**
 * The project list is a handoff surface, not just a status ledger. Map each
 * persisted workflow state to the one action a translator can safely take.
 */
export function getProjectDashboardAction(documentStatus: unknown): ProjectDashboardActionKey {
    switch (String(documentStatus || '')) {
        case 'WAITING':
        case 'PARSING':
        case 'SEGMENTING':
        case 'TERMS_EXTRACTING':
            return 'continueSetup';
        case 'PREPROCESSED':
            return 'startTranslation';
        case 'TRANSLATING':
            return 'resumeTranslation';
        case 'COMPLETED':
            return 'openWorkspace';
        case 'ERROR':
        default:
            return 'repairSetup';
    }
}

export function getProjectDashboardStatus(
    documentStatus: unknown
): Pick<ProjectDashboardEntry, 'statusKey' | 'statusTone'> {
    switch (String(documentStatus || '')) {
        case 'WAITING':
            return { statusKey: 'waiting', statusTone: 'neutral' };
        case 'PARSING':
            return { statusKey: 'parsing', statusTone: 'active' };
        case 'SEGMENTING':
            return { statusKey: 'segmenting', statusTone: 'active' };
        case 'TERMS_EXTRACTING':
            return { statusKey: 'termsExtracting', statusTone: 'active' };
        case 'PREPROCESSED':
            return { statusKey: 'preprocessed', statusTone: 'ready' };
        case 'TRANSLATING':
            return { statusKey: 'translating', statusTone: 'active' };
        case 'COMPLETED':
            return { statusKey: 'completed', statusTone: 'ready' };
        case 'ERROR':
            return { statusKey: 'error', statusTone: 'danger' };
        default:
            return { statusKey: 'unknown', statusTone: 'attention' };
    }
}
