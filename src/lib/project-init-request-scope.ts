/**
 * Guards client-side project-initialization responses against route or batch
 * changes. A server operation may still finish for its original project, but
 * its old response must never update the project currently on screen.
 */
export type ProjectInitRequestScope = Readonly<{
    projectId: string;
    batchId: string;
    version: number;
}>;

export function createProjectInitRequestScopeGate() {
    let projectId = '';
    let batchId = '';
    let version = 0;

    return {
        sync(nextProjectId: string, nextBatchId: string) {
            if (projectId !== nextProjectId || batchId !== nextBatchId) {
                projectId = nextProjectId;
                batchId = nextBatchId;
                version += 1;
            }
        },
        capture(): ProjectInitRequestScope {
            return { projectId, batchId, version };
        },
        isCurrent(scope: ProjectInitRequestScope) {
            return (
                scope.projectId === projectId &&
                scope.batchId === batchId &&
                scope.version === version
            );
        },
    };
}
