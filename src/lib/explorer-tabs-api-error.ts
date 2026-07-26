export const EXPLORER_TABS_UNAVAILABLE_MESSAGE = 'Unable to load project files';

/**
 * Preserve actionable authorization and validation errors, but never relay an
 * unexpected backend exception through the Explorer tabs API.
 */
export function getExplorerTabsApiErrorMessage(status: number, message: string) {
    return status >= 500 ? EXPLORER_TABS_UNAVAILABLE_MESSAGE : message;
}
