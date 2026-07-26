/**
 * A project may be visible through the current tenant while remaining writable
 * only by its creator. Keep that distinction explicit when shaping dashboard
 * data so the client never has to infer authorization from tenant visibility.
 */
export type ProjectWriteCapability = {
    canWrite: boolean;
};

export function canWriteProjectForUser(
    projectOwnerUserId: string | null | undefined,
    currentUserId: string
) {
    return Boolean(projectOwnerUserId) && projectOwnerUserId === currentUserId;
}

export function withProjectWriteCapability<T extends { userId: string | null | undefined }>(
    project: T,
    currentUserId: string
): T & ProjectWriteCapability {
    return {
        ...project,
        canWrite: canWriteProjectForUser(project.userId, currentUserId),
    };
}
