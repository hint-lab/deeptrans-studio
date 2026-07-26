import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentDashboardSection } from './dashboard-navigation';

test('keeps the Projects sidebar item active for the overview and its project routes', () => {
    assert.equal(isCurrentDashboardSection('/dashboard', '/dashboard'), true);
    assert.equal(isCurrentDashboardSection('/dashboard/projects', '/dashboard'), true);
    assert.equal(isCurrentDashboardSection('/dashboard/projects/project-1', '/dashboard'), true);
    assert.equal(
        isCurrentDashboardSection('/dashboard/projects/project-1/init', '/dashboard'),
        true
    );
});

test('keeps a section active for its own nested detail route only', () => {
    assert.equal(isCurrentDashboardSection('/dashboard/memories', '/dashboard/memories'), true);
    assert.equal(
        isCurrentDashboardSection('/dashboard/memories/memory-1', '/dashboard/memories'),
        true
    );
    assert.equal(
        isCurrentDashboardSection(
            '/dashboard/dictionaries/dictionary-1',
            '/dashboard/dictionaries'
        ),
        true
    );
    assert.equal(
        isCurrentDashboardSection('/dashboard/memories', '/dashboard/dictionaries'),
        false
    );
});

test('does not match unrelated lookalike paths or an unavailable pathname', () => {
    assert.equal(isCurrentDashboardSection('/dashboard/projects-archive', '/dashboard'), false);
    assert.equal(
        isCurrentDashboardSection('/dashboard/memories-archive', '/dashboard/memories'),
        false
    );
    assert.equal(isCurrentDashboardSection(null, '/dashboard'), false);
});

test('keeps the owning item visible for direct links with trailing slashes', () => {
    assert.equal(isCurrentDashboardSection('/dashboard/', '/dashboard'), true);
    assert.equal(isCurrentDashboardSection('/dashboard/projects/project-1/', '/dashboard'), true);
    assert.equal(
        isCurrentDashboardSection('/dashboard/memories/memory-1/', '/dashboard/memories'),
        true
    );
    assert.equal(
        isCurrentDashboardSection('/dashboard/memories-archive/', '/dashboard/memories'),
        false
    );
});

test('maps legacy translation and documentation child routes to their visible sidebar owners', () => {
    assert.equal(
        isCurrentDashboardSection('/dashboard/translation', '/dashboard/instant-translate'),
        true
    );
    assert.equal(isCurrentDashboardSection('/docs/troubleshooting', '/docs'), true);
    assert.equal(isCurrentDashboardSection('/docs/troubleshooting', '/dashboard'), false);
});
