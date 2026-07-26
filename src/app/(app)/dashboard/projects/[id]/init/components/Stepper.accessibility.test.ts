import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { isInitStepVisuallyComplete } from './Stepper';

const stepper = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/dashboard/projects/[id]/init/components/Stepper.tsx'),
    'utf8'
);
const page = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/dashboard/projects/[id]/init/page.tsx'),
    'utf8'
);

test('initialization stepper switches to a compact two-column layout before the four-step desktop rail', () => {
    assert.match(stepper, /grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-0/);
    assert.match(stepper, /hidden [^"\n]*sm:block/);
    assert.match(stepper, /inline-flex w-full min-w-0 [^`]*sm:w-32/);
    assert.doesNotMatch(stepper, /inline-flex w-32/);
});

test('only completed, reviewable initialization steps are buttons and the current step is announced', () => {
    assert.match(
        stepper,
        /const isReviewable =\s*typeof onStepClick === 'function' &&\s*done &&\s*targetIdx >= 0 &&\s*targetIdx < curIdx/
    );
    assert.match(
        stepper,
        /\{isReviewable \? \(\s*<button[\s\S]*?onClick=\{\(\) => onStepClick\?\.\(s\.key\)\}[\s\S]*?\) : \(\s*<div className=\{cardClassName\}>/
    );
    assert.doesNotMatch(stepper, /aria-disabled/);
    assert.match(stepper, /aria-current=\{isCurrent \? 'step' : undefined\}/);
    assert.match(
        page,
        /onStepClick=\{\s*hasCurrentProjectView\s*\?\s*s => \{[\s\S]*?\}\s*:\s*undefined\s*\}/
    );
});

test('a 100% stage remains current until the initialization flow advances past it', () => {
    assert.equal(isInitStepVisuallyComplete('terms', 'terms', 100, 100), false);
    assert.equal(isInitStepVisuallyComplete('done', 'terms', 100, 100), false);
    assert.equal(isInitStepVisuallyComplete('terms', 'done', 100, 100), true);
    assert.equal(isInitStepVisuallyComplete('done', 'done', 100, 100), true);
});
