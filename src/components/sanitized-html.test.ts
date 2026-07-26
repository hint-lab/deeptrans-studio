import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sanitizeHelpInlineStyle } from './sanitized-html';

const root = process.cwd();

function readSource(...parts: string[]) {
    return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

test('HTML sinks are centralized behind the DOMPurify-backed component', () => {
    const sanitizer = readSource('src', 'components', 'sanitized-html.tsx');
    const parsePanel = readSource(
        'src',
        'app',
        '(app)',
        'dashboard',
        'projects',
        '[id]',
        'init',
        'components',
        'ParsePanel.tsx'
    );
    const helpPanel = readSource(
        'src',
        'app',
        '(app)',
        'ide',
        '[id]',
        'components',
        'help-panel.tsx'
    );

    assert.match(sanitizer, /DOMPurify\(window\)/);
    assert.match(sanitizer, /purifier\.sanitize/);
    assert.match(sanitizer, /FORBID_ATTR:\s*isHelp \? \[\] : \['style'\]/);
    assert.match(sanitizer, /ALLOW_DATA_ATTR:\s*false/);
    assert.match(sanitizer, /ALLOW_UNKNOWN_PROTOCOLS:\s*false/);
    assert.match(parsePanel, /<SanitizedHtml[\s\S]*profile="document"/);
    assert.match(helpPanel, /<SanitizedHtml[\s\S]*profile="help"/);
    assert.doesNotMatch(parsePanel, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(helpPanel, /dangerouslySetInnerHTML/);
});

test('help-panel inline styles preserve image layout but reject CSS execution primitives', () => {
    assert.equal(
        sanitizeHelpInlineStyle(
            'width: 100%; height: auto; background: url(https://attacker.example/x); image-rendering: auto'
        ),
        'width:100%;height:auto;image-rendering:auto'
    );
    assert.equal(sanitizeHelpInlineStyle('width: expression(alert(1)); max-width: var(--x)'), '');
});
