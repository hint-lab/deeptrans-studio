import assert from 'node:assert/strict';
import test from 'node:test';
import { recordRollbackTranslationStageEventWithDeps } from './translation-process-event';

const authCtx = { userId: 'user-1', tenantId: null, role: 'USER' };

test('records the actual rollback source and destination after a successful status update', async () => {
    let writableItemId = '';
    let captured: any;
    const result = await recordRollbackTranslationStageEventWithDeps(
        'item-1',
        'QA_REVIEW',
        { fromStage: 'POST_EDIT_REVIEW' },
        {
            requireUser: async () => authCtx,
            requireWritableDocumentItem: async (itemId, receivedAuthCtx) => {
                writableItemId = itemId;
                assert.equal(receivedAuthCtx, authCtx);
                return { id: itemId };
            },
            createTranslationStageRecord: async input => {
                captured = input;
                return { id: 'event-1' };
            },
        }
    );

    assert.deepEqual(result, {
        success: true,
        data: { id: 'item-1', stepKey: 'QA_REVIEW', actorType: 'USER' },
    });
    assert.equal(writableItemId, 'item-1');
    assert.deepEqual(captured, {
        documentItemId: 'item-1',
        stepKey: 'QA_REVIEW',
        actorType: 'USER',
        actorId: 'user-1',
        userId: 'user-1',
        status: 'SUCCESS',
        metadata: {
            action: 'ROLLBACK',
            fromStage: 'POST_EDIT_REVIEW',
            toStage: 'QA_REVIEW',
        },
    });
});

test('reports an audit-write failure without claiming that the rollback event exists', async () => {
    let writes = 0;
    const result = await recordRollbackTranslationStageEventWithDeps(
        'item-1',
        'MT',
        { fromStage: 'MT_REVIEW' },
        {
            requireUser: async () => authCtx,
            requireWritableDocumentItem: async () => ({ id: 'item-1' }),
            createTranslationStageRecord: async () => {
                writes += 1;
                throw new Error('timeline unavailable');
            },
        }
    );

    assert.equal(writes, 1);
    assert.deepEqual(result, { success: false, error: '流程记录暂不可用，请稍后重试' });
});

test('rejects malformed rollback stages before creating a misleading event', async () => {
    let writes = 0;
    const result = await recordRollbackTranslationStageEventWithDeps(
        'item-1',
        'not-a-stage',
        { fromStage: 'MT_REVIEW' },
        {
            requireUser: async () => authCtx,
            requireWritableDocumentItem: async () => ({ id: 'item-1' }),
            createTranslationStageRecord: async () => {
                writes += 1;
                return { id: 'event-should-not-exist' };
            },
        }
    );

    assert.equal(writes, 0);
    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error, /无效的翻译阶段/);
});
