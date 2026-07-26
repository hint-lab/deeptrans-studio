import assert from 'node:assert/strict';
import test from 'node:test';
import { isDesktopCallback, normalizeInternalCallback } from './auth-callback';

test('normalizes same-origin callback paths', () => {
    assert.equal(
        normalizeInternalCallback('/dashboard/projects?desktop=1'),
        '/dashboard/projects?desktop=1'
    );
    assert.equal(normalizeInternalCallback(['/dashboard', '/ide/ignored']), '/dashboard');
});

test('rejects callbacks that can leave the application origin', () => {
    assert.equal(normalizeInternalCallback('https://example.com'), '/dashboard');
    assert.equal(normalizeInternalCallback('//example.com/path'), '/dashboard');
    assert.equal(normalizeInternalCallback('/\\example.com/path'), '/dashboard');
    assert.equal(normalizeInternalCallback('/api/auth/session'), '/dashboard');
    assert.equal(normalizeInternalCallback('/auth/login'), '/dashboard');
});

test('detects the persisted desktop callback marker', () => {
    assert.equal(isDesktopCallback('/dashboard?desktop=1'), true);
    assert.equal(isDesktopCallback('/dashboard'), false);
});
