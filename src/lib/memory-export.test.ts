import assert from 'node:assert/strict';
import test from 'node:test';
import {
    MEMORY_EXPORT_MAX_BYTES,
    MEMORY_EXPORT_MAX_ENTRIES,
    MemoryExportLimitError,
    buildMemoryExportContentDisposition,
    escapeCsvCell,
    escapeXml,
    normalizeTmxLanguage,
    serializeTranslationMemoryExport,
} from './memory-export';

const entry = {
    memoryName: 'Legal, memory',
    sourceText: '甲方 & <乙方>',
    targetText: 'Party A "and" Party B',
    notes: 'line one\nline two',
    sourceLang: 'zh-CN',
    targetLang: 'en-US',
};

test('CSV export has a UTF-8 BOM and safely quotes commas, quotes and newlines', () => {
    const csv = serializeTranslationMemoryExport([entry], 'csv');

    assert.match(
        csv,
        /^\uFEFF"memory_name","source","target","notes","source_lang","target_lang"\r\n/
    );
    assert.match(csv, /"Legal, memory"/);
    assert.match(csv, /"Party A ""and"" Party B"/);
    assert.match(csv, /"line one\nline two"/);
});

test('CSV cells neutralize spreadsheet formulas without breaking standard quoting', () => {
    assert.equal(
        escapeCsvCell('=HYPERLINK("https://example.test")'),
        '"\t=HYPERLINK(""https://example.test"")"'
    );
    assert.equal(escapeCsvCell('normal'), '"normal"');
});

test('TMX export escapes text, preserves notes and normalizes invalid language tags', () => {
    const tmx = serializeTranslationMemoryExport(
        [{ ...entry, sourceLang: 'zh-CN', targetLang: 'not a language' }],
        'tmx'
    );

    assert.match(tmx, /<seg>甲方 &amp; &lt;乙方&gt;<\/seg>/);
    assert.match(tmx, /<seg>Party A &quot;and&quot; Party B<\/seg>/);
    assert.match(tmx, /<note>line one\nline two<\/note>/);
    assert.match(tmx, /xml:lang="zh-CN"/);
    assert.match(tmx, /xml:lang="und"/);
    assert.match(tmx, /<\/tmx>\n$/);
});

test('XML and filename helpers remove invalid XML controls and never preserve header controls', () => {
    assert.equal(escapeXml(`<&>"'\u0001`), '&lt;&amp;&gt;&quot;&apos;');
    assert.equal(normalizeTmxLanguage('zh-Hans-CN'), 'zh-Hans-CN');
    assert.equal(normalizeTmxLanguage('zh\nCN'), 'und');
    const disposition = buildMemoryExportContentDisposition('tmx', 'all', new Date('2026-07-26'));
    assert.equal(
        disposition,
        'attachment; filename="deeptrans-memories-2026-07-26.tmx"; filename*=UTF-8\'\'deeptrans-memories-2026-07-26.tmx'
    );
});

test('serializer rejects entry and byte limits instead of producing an unbounded response', () => {
    assert.throws(
        () =>
            serializeTranslationMemoryExport(
                Array.from({ length: MEMORY_EXPORT_MAX_ENTRIES + 1 }, () => entry),
                'tmx'
            ),
        MemoryExportLimitError
    );
    assert.throws(
        () =>
            serializeTranslationMemoryExport(
                [{ ...entry, sourceText: 'x'.repeat(MEMORY_EXPORT_MAX_BYTES) }],
                'csv'
            ),
        MemoryExportLimitError
    );
});
