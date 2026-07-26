import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('batch sign-off blocks a dirty active review editor and delegates completed items to CAS', () => {
    const source = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'ide',
            '[id]',
            'components',
            'menu',
            'action-section.tsx'
        ),
        'utf8'
    );

    assert.match(source, /hasUnsavedPostEditDraft\(/);
    assert.match(source, /signOffPostEditReviewAction\(/);
    assert.match(source, /buildBatchSignoffInput\(content\)/);
    assert.doesNotMatch(source, /updateDocItemStatusAction\(it\.id,\s*['"]SIGN_OFF['"]\)/);
});
