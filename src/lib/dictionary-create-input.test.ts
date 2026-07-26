import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DICTIONARY_CREATE_ERROR_CODES,
    DICTIONARY_CREATE_LIMITS,
    dictionaryCreateErrorField,
    dictionaryCreateErrorTranslationKey,
    validateDictionaryCreateInput,
} from './dictionary-create-input';

test('normalizes a complete dictionary creation request before it reaches the action', () => {
    assert.deepEqual(
        validateDictionaryCreateInput({
            name: '  Contract terms  ',
            description: '  Preferred legal terminology  ',
            domain: ' legal ',
            visibility: 'PROJECT',
        }),
        {
            ok: true,
            data: {
                name: 'Contract terms',
                description: 'Preferred legal terminology',
                domain: 'legal',
                visibility: 'PROJECT',
            },
        }
    );
});

test('rejects blank or forged dictionary fields before any database write', () => {
    assert.deepEqual(validateDictionaryCreateInput(null), {
        ok: false,
        errorCode: DICTIONARY_CREATE_ERROR_CODES.NAME_REQUIRED,
    });
    assert.deepEqual(validateDictionaryCreateInput({ name: ' ', domain: 'legal' }), {
        ok: false,
        errorCode: DICTIONARY_CREATE_ERROR_CODES.NAME_REQUIRED,
    });
    assert.deepEqual(validateDictionaryCreateInput({ name: 'Terms', domain: ' ' }), {
        ok: false,
        errorCode: DICTIONARY_CREATE_ERROR_CODES.DOMAIN_REQUIRED,
    });
    assert.deepEqual(validateDictionaryCreateInput({ name: 'Terms', domain: 'forged-domain' }), {
        ok: false,
        errorCode: DICTIONARY_CREATE_ERROR_CODES.DOMAIN_INVALID,
    });
    assert.deepEqual(
        validateDictionaryCreateInput({ name: 'Terms', domain: 'legal', visibility: 'TEAM' }),
        {
            ok: false,
            errorCode: DICTIONARY_CREATE_ERROR_CODES.VISIBILITY_INVALID,
        }
    );
});

test('preserves safe default visibility and caps form-sized text', () => {
    assert.deepEqual(validateDictionaryCreateInput({ name: 'Terms', domain: 'legal' }), {
        ok: true,
        data: { name: 'Terms', domain: 'legal', visibility: 'PRIVATE' },
    });
    assert.deepEqual(
        validateDictionaryCreateInput({
            name: 'x'.repeat(DICTIONARY_CREATE_LIMITS.name + 1),
            domain: 'legal',
        }),
        {
            ok: false,
            errorCode: DICTIONARY_CREATE_ERROR_CODES.NAME_TOO_LONG,
        }
    );
});

test('maps stable failures to a field and localized message key', () => {
    assert.equal(dictionaryCreateErrorField(DICTIONARY_CREATE_ERROR_CODES.NAME_REQUIRED), 'name');
    assert.equal(
        dictionaryCreateErrorField(DICTIONARY_CREATE_ERROR_CODES.DOMAIN_REQUIRED),
        'domain'
    );
    assert.equal(dictionaryCreateErrorField(DICTIONARY_CREATE_ERROR_CODES.CREATE_FAILED), null);
    assert.equal(
        dictionaryCreateErrorTranslationKey(DICTIONARY_CREATE_ERROR_CODES.PUBLIC_ADMIN_REQUIRED),
        'CreateDialog.publicAdminRequired'
    );
    assert.equal(dictionaryCreateErrorTranslationKey('unexpected'), 'CreateDialog.createFailed');
});
