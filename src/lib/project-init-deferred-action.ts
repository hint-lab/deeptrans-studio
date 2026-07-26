/**
 * A small version gate for UI actions that intentionally wait a moment before
 * starting a destructive or expensive server operation. React state captured
 * by a timer is stale by design, so cancellation must be checked against a
 * mutable gate at execution time instead.
 */
export function createProjectInitDeferredActionGate() {
    let activeToken = 0;

    return {
        begin() {
            activeToken += 1;
            return activeToken;
        },
        cancel() {
            activeToken += 1;
        },
        isCurrent(token: number) {
            return token === activeToken;
        },
    };
}
