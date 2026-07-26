import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const actionSection = readFileSync(
    join(
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
const postEditAction = readFileSync(
    join(process.cwd(), 'src', 'actions', 'postedit.ts'),
    'utf8'
);

function menuPostEditRunner() {
    const start = actionSection.indexOf('const executePostEditForItem');
    const end = actionSection.indexOf('const handleSinglePostEdit');
    assert.ok(start >= 0, 'menu post-edit runner must exist');
    assert.ok(end > start, 'menu post-edit runner must end before the single-item handler');
    return actionSection.slice(start, end);
}

test('menu post-edit publishes only the saved current-segment result to the panel', () => {
    const runner = menuPostEditRunner();
    const save = runner.indexOf('await savePostEditResultsAction');
    const publish = runner.indexOf('setPosteditOutputs({', save);

    assert.ok(save >= 0, 'menu run must persist its post-edit result');
    assert.ok(publish > save, 'panel output must be published after persistence succeeds');
    assert.match(runner, /setPosteditOutcome\(\{ itemId, status: 'loading', phase: 'query' \}\)/);
    assert.match(runner, /setPosteditOutcome\(completePostEditOutcome\(itemId, result\.query\.hits\)\)/);
    assert.match(runner, /setPosteditOutcome\(failure\)/);
});

test('menu post-edit preserves the actual failed workflow phase instead of calling every failure a query failure', () => {
    const runner = menuPostEditRunner();

    assert.match(runner, /let outcomePhase: PostEditOutcomePhase = 'query'/);
    assert.match(runner, /if \(!result\.success\) \{[\s\S]*?outcomePhase = result\.phase/);
    assert.match(runner, /outcomePhase = 'persist'/);
    assert.match(runner, /failedPostEditOutcome\([\s\S]*?outcomePhase,/);
});

test('the post-edit action returns a safe failure result with its completed phase boundary', () => {
    assert.match(postEditAction, /let phase: PostEditRunPhase = 'query'/);
    assert.match(postEditAction, /phase = 'evaluation'/);
    assert.match(postEditAction, /phase = 'rewrite'/);
    assert.match(postEditAction, /success: false,[\s\S]*?phase,[\s\S]*?memorySearchErrorOrFallback/);
});

test('workflow notices do not enter the persisted chat transcript channel', () => {
    assert.doesNotMatch(actionSection, /addMessage\(/);
});
