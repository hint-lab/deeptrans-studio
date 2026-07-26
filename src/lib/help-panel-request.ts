/**
 * Help documents load asynchronously and share one narrow side panel. Keep a
 * late response from an earlier document or search request from replacing the
 * page the translator is currently reading.
 */
export function isCurrentHelpPanelRequest(
    requestId: number,
    currentRequestId: number,
    requestedKey: string,
    currentKey: string
) {
    return Boolean(requestedKey) && requestId === currentRequestId && requestedKey === currentKey;
}
