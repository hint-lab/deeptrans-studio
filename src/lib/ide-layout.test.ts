import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { getIDEExplorerPanelSize, getIDELayoutSizes } from './ide-layout';

test('uses default IDE panel sizes only for the current sidebar and right-panel state', () => {
    assert.deepEqual(getIDELayoutSizes(true, 'none'), [15, 85]);
    assert.deepEqual(getIDELayoutSizes(false, 'none'), [0, 100]);
    assert.deepEqual(getIDELayoutSizes(true, 'chat'), [15, 60, 25]);
    assert.deepEqual(getIDELayoutSizes(false, 'preview'), [0, 75, 25]);
    assert.equal(getIDEExplorerPanelSize(true), 15);
    assert.equal(getIDEExplorerPanelSize(false), 0);
});

test('keeps dragged IDE panel widths stable across ordinary renders and exposes all right panels in View', () => {
    const layoutSource = fs.readFileSync(
        path.join(process.cwd(), 'src', 'app', '(app)', 'ide', '[id]', 'layout.tsx'),
        'utf8'
    );
    const viewMenuSource = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'ide',
            '[id]',
            'components',
            'menu',
            'components',
            'view-menu.tsx'
        ),
        'utf8'
    );

    assert.match(
        layoutSource,
        /useMemo\(\s*\(\) => getIDELayoutSizes\(isSidebarOpen, mode\),\s*\[isSidebarOpen, mode\]\s*\)/
    );
    assert.match(
        layoutSource,
        /useEffect\(\s*\(\) => \{\s*sidebarPanelRef\.current\?\.resize\(getIDEExplorerPanelSize\(isSidebarOpen\)\);\s*\},\s*\[isSidebarOpen\]\s*\)/
    );
    assert.doesNotMatch(layoutSource, /key=\{mode\}/);
    assert.match(layoutSource, /id="ide-explorer-panel"\s+order=\{1\}/);
    assert.match(layoutSource, /id="ide-editor-panel"\s+order=\{2\}/);
    assert.match(layoutSource, /id="ide-right-panel"\s+order=\{3\}/);
    assert.match(viewMenuSource, /aria-label=\{t\('filePreviewPanel'\)\}/);
    assert.match(viewMenuSource, /aria-label=\{t\('helpPanel'\)\}/);
    assert.match(viewMenuSource, /setMode\(checked \? 'preview' : 'none'\)/);
    assert.match(viewMenuSource, /setMode\(checked \? 'help' : 'none'\)/);
});
