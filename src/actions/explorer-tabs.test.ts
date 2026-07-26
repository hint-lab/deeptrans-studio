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
