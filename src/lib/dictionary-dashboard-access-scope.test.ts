import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) => readFileSync(resolve(process.cwd(), ...segments), 'utf8');

const dashboard = read('src', 'app', '(app)', 'dashboard', 'dictionaries', 'page.tsx');
const importDialog = read(
    'src',
    'app',
    '(app)',
    'dashboard',
    'dictionaries',
    'components',
    'import-dictionary-dialog.tsx'
);

function dashboardSection(startMarker: string, endMarker: string) {
    const start = dashboard.indexOf(startMarker);
    const end = dashboard.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing ${startMarker}`);
    assert.ok(end > start, `missing end marker ${endMarker}`);
    return dashboard.slice(start, end);
}

test('the global dictionary dashboard exposes private and team-shared write controls only after login', () => {
    assert.match(dashboard, /const canManageDictionaries = Boolean\(authenticatedUserId\);/);

    const privateSection = dashboardSection('{/* 私有词库 */}', '{/* 团队共享词库');
    const sharedSection = dashboardSection('{/* 团队共享词库', '</Tabs>');

    for (const section of [privateSection, sharedSection]) {
        assert.match(
            section,
            /\{canManageDictionaries \? \([\s\S]*?<ImportDictionaryDialog[\s\S]*?<CreateDictionaryDialog/
        );
        assert.match(section, /\{!canManageDictionaries \? \([\s\S]*?href="\/auth\/login"/);
    }
});

test('the global PROJECT visibility surface is labeled as team shared in both locales', () => {
    for (const [locale, expectedLabel, oldLabel] of [
        ['zh', '团队共享词库', '项目词库'],
        ['en', 'Team Shared Dictionaries', 'Project Dictionaries'],
    ] as const) {
        const messages = JSON.parse(read('src', 'i18n', `${locale}.json`));
        const dictionaries = messages.Dashboard.Dictionaries;

        assert.equal(dictionaries.projectDictionaries, expectedLabel);
        assert.doesNotMatch(dictionaries.projectDescription, new RegExp(oldLabel));
        assert.equal(typeof dictionaries.importTeamSharedDictionary, 'string');
        assert.equal(typeof dictionaries.importTeamSharedDescription, 'string');
    }

    assert.match(importDialog, /const isTeamShared = modeContext === 'project';/);
    assert.match(importDialog, /t\('importTeamSharedDictionary'\)/);
    assert.doesNotMatch(importDialog, /项目共享词库|Project-shared public dictionaries/);
});
