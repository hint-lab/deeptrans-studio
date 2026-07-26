import assert from 'node:assert/strict';
import test from 'node:test';

import { textToSafePreviewHtml } from './text-parser';

test('plain-text document previews escape markup and preserve paragraph boundaries', () => {
    const html = textToSafePreviewHtml(
        '<img src=x onerror=alert(1)>\nnext\n\n<script>alert(1)</script>'
    );

    assert.equal(
        html,
        '<p>&lt;img src=x onerror=alert(1)&gt;<br/>next</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    );
    assert.doesNotMatch(html, /<img|<script/i);
});
