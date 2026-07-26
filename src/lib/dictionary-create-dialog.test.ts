import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) => readFileSync(resolve(process.cwd(), ...segments), 'utf8');

const createDialog = read(
    'src',
    'app',
    '(app)',
    'dashboard',
    'dictionaries',
    'components',
    'create-dictionary-dialog.tsx'
);
const publicDialog = read(
    'src',
    'app',
    '(app)',
    'dashboard',
    'dictionaries',
    'components',
    'add-public-dictionary-dialog.tsx'
);
const action = read('src', 'actions', 'dictionary.ts');

test('the dictionary action rejects invalid input before authorization or database creation', () => {
    const validationIndex = action.indexOf(
        'const validated = validateDictionaryCreateInput(data);'
    );
    const authIndex = action.indexOf('const authCtx = await requireUser();', validationIndex);
    const createIndex = action.indexOf(
        'const dictionary = await createDictionaryDB({',
        validationIndex
    );

    assert.ok(validationIndex >= 0);
    assert.ok(authIndex > validationIndex);
    assert.ok(createIndex > authIndex);
    assert.match(
        action,
        /if \(!validated\.ok\) return \{ success: false, errorCode: validated\.errorCode \}/
    );
    assert.match(action, /DICTIONARY_CREATE_ERROR_CODES\.PUBLIC_ADMIN_REQUIRED/);
    assert.match(action, /DICTIONARY_CREATE_ERROR_CODES\.PROJECT_TENANT_REQUIRED/);
    assert.match(action, /\.\.\.validated\.data,/);
    assert.doesNotMatch(action, /name:\s*data\.name/);
});

test('private, project, and public creation dialogs share focusable, localized validation states', () => {
    for (const source of [createDialog, publicDialog]) {
        assert.match(source, /validateDictionaryCreateInput/);
        assert.match(source, /dictionaryCreateErrorTranslationKey/);
        assert.match(source, /dictionaryCreateErrorField/);
        assert.match(source, /const focusInvalidField/);
        assert.match(source, /requestAnimationFrame/);
        assert.match(source, /nameInputRef\.current\?\.focus\(\)/);
        assert.match(source, /domainTriggerRef\.current\?\.focus\(\)/);
        assert.match(source, /role="alert"/);
        assert.match(source, /aria-invalid=\{errorField === 'name'\}/);
        assert.match(source, /aria-invalid=\{errorField === 'domain'\}/);
        assert.match(source, /aria-required="true"/);
        assert.match(source, /htmlFor=\{nameId\}/);
        assert.match(source, /htmlFor=\{domainId\}/);
        assert.match(source, /id=\{nameId\}/);
        assert.match(source, /id=\{domainId\}/);
        assert.match(source, /const resetDialog/);
        assert.match(source, /resetDialog\(\);/);
        assert.match(source, /if \(!nextOpen && isSubmitting\) return;/);
        assert.doesNotMatch(source, /toast\.error\(/);
        assert.doesNotMatch(source, /词典创建成功|创建词典失败|创建词典时发生错误/);
    }
});

test('public dictionary success is not emitted as an error log', () => {
    assert.doesNotMatch(publicDialog, /createLogger/);
    assert.doesNotMatch(publicDialog, /logger\.error/);
});

test('both locales contain every dictionary-create failure message rendered by the dialogs', () => {
    for (const locale of ['zh', 'en']) {
        const messages = JSON.parse(read('src', 'i18n', `${locale}.json`));
        const dialog = messages.Dashboard.Dictionaries.CreateDialog;
        for (const key of [
            'publicDescription',
            'loginDescription',
            'loginRequired',
            'loginAction',
            'name',
            'namePlaceholder',
            'description',
            'descriptionPlaceholder',
            'domain',
            'domainPlaceholder',
            'cancel',
            'create',
            'creating',
            'created',
            'nameRequired',
            'nameTooLong',
            'descriptionTooLong',
            'domainRequired',
            'domainInvalid',
            'visibilityInvalid',
            'publicAdminRequired',
            'projectTenantRequired',
            'createFailed',
        ]) {
            assert.equal(typeof dialog[key], 'string', `${locale}:${key}`);
        }
    }
});
