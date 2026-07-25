import assert from 'node:assert/strict';
import test from 'node:test';
import { updateDocumentStatusIfCurrentWithRunner } from './document';

test('conditionally updates a document status using the allowed source states', async () => {
    let captured: any;
    const database = {
        document: {
            updateMany: async (args: unknown) => {
                captured = args;
                return { count: 1 };
            },
        },
    };

    const updated = await updateDocumentStatusIfCurrentWithRunner(
        database,
        'document-1',
        'PARSING',
        ['WAITING', 'PARSING', 'ERROR']
    );

    assert.equal(updated, true);
    assert.deepEqual(captured, {
        where: {
            id: 'document-1',
            status: { in: ['WAITING', 'PARSING', 'ERROR'] },
        },
        data: { status: 'PARSING' },
    });
});

test('reports a rejected status transition when no row matches', async () => {
    const database = {
        document: {
            updateMany: async () => ({ count: 0 }),
        },
    };

    assert.equal(
        await updateDocumentStatusIfCurrentWithRunner(database, 'document-1', 'PARSING', [
            'WAITING',
            'PARSING',
            'ERROR',
        ]),
        false
    );
});

test('does not move a completed document back to parsing', async () => {
    let status = 'COMPLETED';
    const database = {
        document: {
            updateMany: async (args: any) => {
                const allowed = args.where.status.in as string[];
                if (args.where.id === 'document-1' && allowed.includes(status)) {
                    status = args.data.status;
                    return { count: 1 };
                }
                return { count: 0 };
            },
        },
    };

    const updated = await updateDocumentStatusIfCurrentWithRunner(
        database,
        'document-1',
        'PARSING',
        ['WAITING', 'PARSING', 'ERROR']
    );

    assert.equal(updated, false);
    assert.equal(status, 'COMPLETED');
});
