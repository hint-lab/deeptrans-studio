import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getProjectDashboardAction,
    getProjectDashboardEntry,
    getProjectDashboardHandoff,
    getProjectDashboardStatus,
} from './project-dashboard-entry';

test('routes only initialized documents into the IDE', () => {
    assert.equal(
        getProjectDashboardEntry('project/one', 'PREPROCESSED').href,
        '/ide/project%2Fone'
    );
    assert.equal(getProjectDashboardEntry('project-one', 'TRANSLATING').href, '/ide/project-one');
    assert.equal(getProjectDashboardEntry('project-one', 'COMPLETED').href, '/ide/project-one');

    assert.equal(
        getProjectDashboardEntry('project-one', 'WAITING').href,
        '/dashboard/projects/project-one/init'
    );
    assert.equal(
        getProjectDashboardEntry('project-one', undefined).href,
        '/dashboard/projects/project-one/init'
    );
});

test('presents every known document state without treating a failure as ready', () => {
    assert.deepEqual(getProjectDashboardStatus('PREPROCESSED'), {
        statusKey: 'preprocessed',
        statusTone: 'ready',
    });
    assert.deepEqual(getProjectDashboardStatus('TRANSLATING'), {
        statusKey: 'translating',
        statusTone: 'active',
    });
    assert.deepEqual(getProjectDashboardStatus('ERROR'), {
        statusKey: 'error',
        statusTone: 'danger',
    });
    assert.deepEqual(getProjectDashboardStatus('unexpected'), {
        statusKey: 'unknown',
        statusTone: 'attention',
    });
});

test('maps every project state to one legible next action for the translation workflow', () => {
    assert.equal(getProjectDashboardAction('WAITING'), 'continueSetup');
    assert.equal(getProjectDashboardAction('TERMS_EXTRACTING'), 'continueSetup');
    assert.equal(getProjectDashboardAction('PREPROCESSED'), 'startTranslation');
    assert.equal(getProjectDashboardAction('TRANSLATING'), 'resumeTranslation');
    assert.equal(getProjectDashboardAction('COMPLETED'), 'openWorkspace');
    assert.equal(getProjectDashboardAction('ERROR'), 'repairSetup');
    assert.equal(getProjectDashboardAction(undefined), 'repairSetup');
});

test('surfaces only actionable risks and never tells a read-only translator to edit', () => {
    assert.deepEqual(getProjectDashboardHandoff('project-one', 'TRANSLATING', true), {
        href: '/ide/project-one',
        statusKey: 'translating',
        statusTone: 'active',
        actionKey: 'resumeTranslation',
        riskKeys: [],
        canOpen: true,
    });

    assert.deepEqual(getProjectDashboardHandoff('project-one', 'ERROR', false), {
        href: '/dashboard/projects/project-one/init',
        statusKey: 'error',
        statusTone: 'danger',
        actionKey: 'contactOwner',
        riskKeys: ['readOnly', 'error'],
        canOpen: false,
    });

    assert.deepEqual(getProjectDashboardHandoff('project-one', undefined, true), {
        href: '/dashboard/projects/project-one/init',
        statusKey: 'unknown',
        statusTone: 'attention',
        actionKey: 'repairSetup',
        riskKeys: ['unknown'],
        canOpen: true,
    });
});
