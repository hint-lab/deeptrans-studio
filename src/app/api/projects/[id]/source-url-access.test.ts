import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readRoute = (...parts: string[]) =>
    readFileSync(resolve(process.cwd(), 'src', 'app', 'api', 'projects', '[id]', ...parts), 'utf8');

test('project source readers resolve owner-scoped storage URLs instead of Document.url', () => {
    const routes = [
        readRoute('parse', 'route.ts'),
        readRoute('terms', 'route.ts'),
        readRoute('terms', 'preview', 'route.ts'),
        readRoute('segment', 'route.ts'),
    ];

    for (const route of routes) {
        assert.match(route, /getReadableDocumentSourceUrlForOwner/);
        assert.doesNotMatch(
            route,
            /extract(?:FileTypeFromUrl|DocxFromUrl|TextFromUrl)\(only\.url\)/
        );
        assert.doesNotMatch(route, /pdfParseToStructuredJson\(only\.url\)/);
        assert.doesNotMatch(route, /textToStructuredJson\(only\.url\)/);
    }
});

test('new projects persist a server-generated object URL, never the browser fileUrl', () => {
    const projectAction = readFileSync(
        resolve(process.cwd(), 'src', 'actions', 'project.ts'),
        'utf8'
    );

    assert.match(projectAction, /requireReadableUploadedObjectForOwner/);
    assert.match(projectAction, /getReadableUploadedObjectUrlForOwner/);
    assert.match(projectAction, /name:\s*uploadedObject\.fileName/);
    assert.match(projectAction, /url:\s*verifiedFileUrl/);
    assert.doesNotMatch(projectAction, /url:\s*validData\.fileInfo\.fileUrl/);
});
