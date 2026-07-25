import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DOCUMENT_INITIALIZATION_CONFLICT,
    replaceDocumentItemsAtomicWithRunner,
    replaceDocumentItemsForInitializationWithRunner,
    type DocumentItemCreateInput,
} from './documentItem';

function item(documentId: string, order: number, sourceText: string): DocumentItemCreateInput {
    return {
        documentId,
        order,
        sourceText,
        type: 'TEXT',
    };
}

test('atomically replaces all document items when creation succeeds', async () => {
    let persisted = [item('document-1', 1, 'old')];
    const calls: string[] = [];

    const database = {
        $transaction: async (operation: (tx: any) => Promise<any>) => {
            let staged = [...persisted];
            const result = await operation({
                documentItem: {
                    deleteMany: async () => {
                        calls.push('delete');
                        staged = [];
                        return { count: persisted.length };
                    },
                    createMany: async ({ data }: { data: DocumentItemCreateInput[] }) => {
                        calls.push('create');
                        staged = [...data];
                        return { count: data.length };
                    },
                },
            });
            persisted = staged;
            return result;
        },
    };

    const next = [item('document-1', 1, 'new one'), item('document-1', 2, 'new two')];
    const result = await replaceDocumentItemsAtomicWithRunner(database, 'document-1', next);

    assert.deepEqual(calls, ['delete', 'create']);
    assert.equal(result.count, 2);
    assert.deepEqual(persisted, next);
});

test('does not commit the delete when document item creation fails', async () => {
    const previous = [item('document-1', 1, 'old')];
    let persisted = [...previous];

    const database = {
        $transaction: async (operation: (tx: any) => Promise<any>) => {
            let staged = [...persisted];
            const result = await operation({
                documentItem: {
                    deleteMany: async () => {
                        staged = [];
                        return { count: persisted.length };
                    },
                    createMany: async () => {
                        throw new Error('create failed');
                    },
                },
            });
            persisted = staged;
            return result;
        },
    };

    await assert.rejects(
        replaceDocumentItemsAtomicWithRunner(database, 'document-1', [
            item('document-1', 1, 'new'),
        ]),
        /create failed/
    );
    assert.deepEqual(persisted, previous);
});

test('rolls back when createMany reports a partial replacement', async () => {
    const previous = [item('document-1', 1, 'old')];
    let persisted = [...previous];
    const database = {
        $transaction: async (operation: (tx: any) => Promise<any>) => {
            let staged = [...persisted];
            const result = await operation({
                documentItem: {
                    deleteMany: async () => {
                        staged = [];
                        return { count: persisted.length };
                    },
                    createMany: async ({ data }: { data: DocumentItemCreateInput[] }) => {
                        staged = data.slice(0, 1);
                        return { count: 1 };
                    },
                },
            });
            persisted = staged;
            return result;
        },
    };

    await assert.rejects(
        replaceDocumentItemsAtomicWithRunner(database, 'document-1', [
            item('document-1', 1, 'new one'),
            item('document-1', 2, 'new two'),
        ]),
        /replacement incomplete/
    );
    assert.deepEqual(persisted, previous);
});

test('rejects an empty replacement before opening a transaction', async () => {
    let transactionCalls = 0;
    const database = {
        $transaction: async <T>(operation: (tx: any) => Promise<T>): Promise<T> => {
            transactionCalls += 1;
            return operation({});
        },
    };
    await assert.rejects(
        replaceDocumentItemsAtomicWithRunner(database, 'document-1', []),
        /no document items/
    );
    assert.equal(transactionCalls, 0);
});

test('does not replace items after a document has advanced beyond initialization', async () => {
    let deleteCalls = 0;
    const database = {
        $transaction: async (operation: (tx: any) => Promise<any>) =>
            operation({
                document: {
                    findUnique: async () => ({ status: 'COMPLETED' }),
                    updateMany: async () => ({ count: 0 }),
                },
                documentItem: {
                    count: async () => 0,
                    deleteMany: async () => {
                        deleteCalls += 1;
                        return { count: 1 };
                    },
                    createMany: async () => ({ count: 1 }),
                },
            }),
    };

    await assert.rejects(
        replaceDocumentItemsForInitializationWithRunner(database, 'document-1', [
            item('document-1', 1, 'new'),
        ]),
        new RegExp(DOCUMENT_INITIALIZATION_CONFLICT)
    );
    assert.equal(deleteCalls, 0);
});

test('does not replace stale parsing items that already exist', async () => {
    let updateCalls = 0;
    let deleteCalls = 0;
    const database = {
        $transaction: async (operation: (tx: any) => Promise<any>) =>
            operation({
                document: {
                    findUnique: async () => ({ status: 'PARSING' }),
                    updateMany: async () => {
                        updateCalls += 1;
                        return { count: 1 };
                    },
                },
                documentItem: {
                    count: async ({ where }: any) => (where.OR ? 0 : 198),
                    deleteMany: async () => {
                        deleteCalls += 1;
                        return { count: 198 };
                    },
                    createMany: async () => ({ count: 1 }),
                },
            }),
    };

    await assert.rejects(
        replaceDocumentItemsForInitializationWithRunner(database, 'document-1', [
            item('document-1', 1, 'new'),
        ]),
        new RegExp(DOCUMENT_INITIALIZATION_CONFLICT)
    );
    assert.equal(updateCalls, 0);
    assert.equal(deleteCalls, 0);
});
