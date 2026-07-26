import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExplorerTabsForProject } from '@/lib/explorer-tabs';

const buildOptions = {
    fallbackProjectName: 'Project',
    getSegmentLabel: (index: number) => `Segment ${index}`,
};

test('keeps a verified empty project distinct from a loading failure', async () => {
    let itemReadCount = 0;
    const emptyProject = await buildExplorerTabsForProject(
        {
            id: 'project-empty',
            name: 'Empty project',
            documents: [],
        },
        {
            ...buildOptions,
            getDocumentItems: async () => {
                itemReadCount += 1;
                return [];
            },
        }
    );

    assert.deepEqual(emptyProject, {
        projectId: 'project-empty',
        projectName: 'Empty project',
        documentTabs: [],
    });
    assert.equal(itemReadCount, 0);

    await assert.rejects(
        buildExplorerTabsForProject(
            {
                id: 'project-unavailable',
                name: 'Unavailable project',
                documents: [{ id: 'document-1', originalName: 'source.docx' }],
            },
            {
                ...buildOptions,
                getDocumentItems: async () => {
                    throw new Error('document store unavailable');
                },
            }
        ),
        /document store unavailable/
    );
});

test('uses a plain-text navigation label for a rich-text source segment', async () => {
    const sourceText = '<p>第二条 在中华人民共和国境内实施学前教育，适用本法。</p>';
    const tabs = await buildExplorerTabsForProject(
        {
            id: 'project-html-label',
            name: 'HTML label project',
            documents: [{ id: 'document-html-label', originalName: 'law.docx' }],
        },
        {
            ...buildOptions,
            getDocumentItems: async () =>
                [
                    {
                        id: 'item-html-label',
                        sourceText,
                        status: 'NOT_STARTED',
                        type: 'PARAGRAPH',
                        order: 7,
                    },
                ] as any,
        }
    );

    const item = tabs.documentTabs[0]?.items[0];
    assert.equal(item?.name, '第二条 在中华人民共和国境内实施学前教育，适用本法。');
    assert.equal(item?.sourceText, sourceText);
});
