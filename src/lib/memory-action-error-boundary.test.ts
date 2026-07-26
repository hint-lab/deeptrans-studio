import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/actions/memories.ts'), 'utf8');

test('memory dashboard server actions do not serialize arbitrary error messages', () => {
    assert.match(source, /function memoryActionErrorMessage\(error: unknown, fallback: string\)/);
    assert.match(source, /if \(error instanceof GuardError\) return error\.message/);
    assert.match(source, /logger\.error\(`\[MEMORY_ACTION\]/);
    assert.doesNotMatch(source, /e\?\.message \|\| '创建失败'/);
    assert.doesNotMatch(source, /e\?\.message \|\| '删除失败'/);
    assert.doesNotMatch(source, /e\?\.message \|\| '更新失败'/);
    assert.doesNotMatch(source, /e\?\.message \|\| '获取词条失败'/);
});
