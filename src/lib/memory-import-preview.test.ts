import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryImportPreviewRows, detectMemoryImportColumns } from './memory-import-preview';

const DEFAULT_MAPPING = {
    sourceKey: 'source',
    targetKey: 'target',
    notesKey: 'notes',
};

test('detects supported translation-memory column aliases', () => {
    assert.deepEqual(detectMemoryImportColumns(['原文', '译文', '备注'], DEFAULT_MAPPING), {
        sourceKey: '原文',
        targetKey: '译文',
        notesKey: '备注',
    });
});

test('builds three-column preview rows with case-insensitive mappings', () => {
    const rows = createMemoryImportPreviewRows(
        [
            {
                SOURCE: '中华人民共和国专利法',
                Target: "Patent Law of the People's Republic of China",
                Notes: '法律名称\noriginal_number：法律名称',
            },
        ],
        DEFAULT_MAPPING
    );

    assert.deepEqual(rows, [
        {
            source: '中华人民共和国专利法',
            target: "Patent Law of the People's Republic of China",
            notes: '法律名称\noriginal_number：法律名称',
        },
    ]);
});

test('uses the selected custom field mapping in the preview', () => {
    const rows = createMemoryImportPreviewRows(
        [{ Chinese: '申请人应当提交材料。', English: 'The applicant shall submit materials.' }],
        { sourceKey: 'Chinese', targetKey: 'English', notesKey: 'Comment' }
    );

    assert.deepEqual(rows, [
        {
            source: '申请人应当提交材料。',
            target: 'The applicant shall submit materials.',
            notes: '',
        },
    ]);
});
