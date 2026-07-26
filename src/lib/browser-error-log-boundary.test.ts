import assert from 'node:assert/strict';
import test from 'node:test';

import { createLogger } from './logger';

function withBrowserConsoleCapture(run: (entries: string[]) => void) {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const originalConsoleError = console.error;
    const entries: string[] = [];

    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
        writable: true,
    });
    console.error = (...args: any[]) => {
        entries.push(args.map(String).join(' '));
    };

    try {
        run(entries);
    } finally {
        console.error = originalConsoleError;
        if (originalWindow) {
            Object.defineProperty(globalThis, 'window', originalWindow);
        } else {
            delete (globalThis as { window?: unknown }).window;
        }
    }
}

test('browser logger omits raw Error message and stack details', () => {
    withBrowserConsoleCapture(entries => {
        const logger = createLogger({}, { includeCaller: false, json: true, pretty: false });

        logger.error(new Error('database password rejected for tenant_internal'));
        logger.error('Translation request failed', new Error('model provider token was rejected'));

        const output = entries.join('\n');
        assert.match(output, /Client operation failed/);
        assert.match(output, /Translation request failed/);
        assert.match(output, /"name":"Error"/);
        assert.doesNotMatch(output, /database password rejected/i);
        assert.doesNotMatch(output, /model provider token/i);
        assert.doesNotMatch(output, /tenant_internal/i);
    });
});

test('server logger keeps diagnostic Error messages', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const originalConsoleError = console.error;
    const entries: string[] = [];

    delete (globalThis as { window?: unknown }).window;
    console.error = (...args: any[]) => {
        entries.push(args.map(String).join(' '));
    };

    try {
        const logger = createLogger({}, { includeCaller: false, json: true, pretty: false });
        logger.error(new Error('database password rejected for server diagnostics'));

        assert.match(entries.join('\n'), /database password rejected for server diagnostics/i);
    } finally {
        console.error = originalConsoleError;
        if (originalWindow) {
            Object.defineProperty(globalThis, 'window', originalWindow);
        }
    }
});
