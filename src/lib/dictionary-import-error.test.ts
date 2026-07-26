import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DictionaryImportInputError,
    dictionaryImportErrorMessage,
    dictionaryImportPublicErrorMessage,
} from './dictionary-import-error';

test('dictionary import exposes only its allowlisted input errors', () => {
    assert.equal(
        dictionaryImportPublicErrorMessage(new DictionaryImportInputError('unsupportedFile')),
        dictionaryImportErrorMessage('unsupportedFile')
    );
    assert.equal(
        dictionaryImportPublicErrorMessage(new Error('ECONNREFUSED postgres://secret-host')),
        dictionaryImportErrorMessage('failed')
    );
});
