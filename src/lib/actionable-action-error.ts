/**
 * Marks a message that was deliberately authored as a browser-safe,
 * actionable Server Action failure. Do not wrap provider, database, storage,
 * or arbitrary caught errors in this class.
 */
export class ActionableActionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ActionableActionError';
    }
}

export function actionableActionError(message: string) {
    return new ActionableActionError(message);
}
