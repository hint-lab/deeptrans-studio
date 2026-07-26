export type CancelableSequenceResult = {
    processed: number;
    remaining: number;
    canceled: boolean;
};

/**
 * Runs a batch one item at a time and checks cancellation only between items.
 *
 * Once an item callback has begun, callers can finish its own atomic work
 * (for sign-off: status plus audit record) before the next cancellation
 * check. This avoids leaving a partially signed-off item behind while still
 * guaranteeing that cancellation prevents any later item from being written.
 */
export async function runCancelableSequence<T>(
    items: readonly T[],
    runItem: (item: T, index: number) => Promise<void>,
    isCancellationRequested: () => boolean
): Promise<CancelableSequenceResult> {
    let processed = 0;

    for (const [index, item] of items.entries()) {
        if (isCancellationRequested()) {
            return {
                processed,
                remaining: Math.max(0, items.length - processed),
                canceled: true,
            };
        }

        await runItem(item, index);
        processed += 1;
    }

    // A cancellation can arrive while the final item is completing. There is
    // no later loop iteration to observe it, but the caller must still not
    // claim an uncanceled, all-successful batch.
    return { processed, remaining: 0, canceled: isCancellationRequested() };
}
