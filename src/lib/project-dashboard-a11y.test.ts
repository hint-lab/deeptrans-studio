import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readDashboardSource = (...segments: string[]) =>
    readFileSync(resolve(process.cwd(), 'src', 'app', '(app)', 'dashboard', ...segments), 'utf8');

test('project cards expose the stage, one explicit next action, and any actionable risk', () => {
    const source = readDashboardSource('components', 'project-list.tsx');

    assert.match(source, /getProjectDashboardHandoff/);
    assert.match(source, /role="list"/);
    assert.match(source, /role="listitem"/);
    assert.match(source, /\{t\('currentStage'\)\}/);
    assert.match(source, /aria-describedby=/);
    assert.match(source, /\{t\('risk\.label'\)\}/);
    assert.doesNotMatch(source, /className="absolute inset-0 z-0/);
});

test('new-project controls retain their labels and discard stale upload state on close or replacement', () => {
    const source = readDashboardSource('components', 'create-project-dialog.tsx');

    assert.match(source, /htmlFor="project-domain"/);
    assert.match(source, /htmlFor="project-source-language"/);
    assert.match(source, /htmlFor="project-target-language"/);
    assert.match(source, /resetKey=\{fileUploadResetKey\}/);
    assert.match(source, /onUploadReset=\{\(\) => setUploadedFile\(null\)\}/);
    assert.match(source, /max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto/);
});

test('project overview keeps the primary project action reachable on narrow screens', () => {
    const source = readDashboardSource('projects', 'page.tsx');

    assert.match(source, /flex flex-col gap-3 sm:flex-row/);
    assert.match(source, /w-full sm:w-36/);
    assert.match(source, /\{t\('description'\)\}/);
    assert.doesNotMatch(source, /w-26/);
});
