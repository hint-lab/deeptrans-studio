import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyMailDeliveryError,
    getMailConfiguration,
    getSafeMailFailure,
    isVerificationRecipientAccepted,
    MailConfigurationError,
} from './mail';

const validMailEnvironment = {
    EMAIL_SERVER: 'smtps://mailer%40example.test:authorization-code@smtp.example.test:465',
    EMAIL_FROM: 'DeepTrans Studio <mailer@example.test>',
};

test('accepts a complete SMTP URL without exposing its values', () => {
    const configuration = getMailConfiguration(validMailEnvironment);

    assert.equal(configuration.from, validMailEnvironment.EMAIL_FROM);
    assert.equal(configuration.server, validMailEnvironment.EMAIL_SERVER);
});

test('rejects incomplete, unsupported, or placeholder mail configuration', () => {
    assert.throws(
        () => getMailConfiguration({ EMAIL_FROM: validMailEnvironment.EMAIL_FROM }),
        MailConfigurationError
    );
    assert.throws(
        () =>
            getMailConfiguration({
                EMAIL_SERVER: 'https://smtp.example.test',
                EMAIL_FROM: validMailEnvironment.EMAIL_FROM,
            }),
        MailConfigurationError
    );
    assert.throws(
        () =>
            getMailConfiguration({
                EMAIL_SERVER: validMailEnvironment.EMAIL_SERVER,
                EMAIL_FROM: '<your-email-from>',
            }),
        MailConfigurationError
    );
});

test('requires a TLS mode that matches an explicitly configured SMTP port', () => {
    const withServer = (server: string) => ({
        EMAIL_SERVER: server,
        EMAIL_FROM: validMailEnvironment.EMAIL_FROM,
    });
    const base = 'mailer%40example.test:authorization-code@smtp.example.test';

    assert.doesNotThrow(() => getMailConfiguration(withServer(`smtp://${base}`)));
    assert.doesNotThrow(() => getMailConfiguration(withServer(`smtps://${base}`)));
    assert.doesNotThrow(() => getMailConfiguration(withServer(`smtp://${base}:25`)));
    assert.doesNotThrow(() => getMailConfiguration(withServer(`smtp://${base}:587?secure=false`)));
    assert.doesNotThrow(() => getMailConfiguration(withServer(`smtps://${base}:465?secure=true`)));

    assert.throws(
        () => getMailConfiguration(withServer(`smtp://${base}:465`)),
        MailConfigurationError
    );
    assert.throws(
        () => getMailConfiguration(withServer(`smtps://${base}:587`)),
        MailConfigurationError
    );
    assert.throws(
        () => getMailConfiguration(withServer(`smtp://${base}?port=465`)),
        MailConfigurationError
    );
    assert.throws(
        () => getMailConfiguration(withServer(`smtps://${base}:465?secure=false`)),
        MailConfigurationError
    );
});

test('classifies SMTP authentication failures without returning SMTP details', () => {
    const rawSecret = 'authorization-code-should-not-leak';
    const authenticationFailure = classifyMailDeliveryError(
        Object.assign(new Error(`Invalid login: 535 ${rawSecret}`), {
            code: 'EAUTH',
            responseCode: 535,
        })
    );
    const authenticationResponse = getSafeMailFailure(authenticationFailure);

    assert.equal(authenticationFailure.kind, 'authentication');
    assert.equal(authenticationResponse.code, 'EMAIL_AUTHENTICATION_FAILED');
    assert.doesNotMatch(authenticationResponse.error, new RegExp(rawSecret));
    assert.equal(classifyMailDeliveryError({ responseCode: 535 }).kind, 'authentication');
    assert.equal(
        classifyMailDeliveryError(new Error('Invalid login: 535 Error: authentication failed'))
            .kind,
        'authentication'
    );
    assert.equal(classifyMailDeliveryError({ command: 'AUTH LOGIN' }).kind, 'authentication');
    assert.equal(classifyMailDeliveryError({ code: 'ETIMEDOUT' }).kind, 'unavailable');
});

test('returns a safe configuration response without SMTP credentials', () => {
    const rawSecret = 'never-return-this-authorization-code';
    let configurationError: unknown;
    try {
        getMailConfiguration({
            EMAIL_SERVER: `smtp://mailer%40example.test:${rawSecret}@smtp.example.test:465`,
            EMAIL_FROM: validMailEnvironment.EMAIL_FROM,
        });
    } catch (error) {
        configurationError = error;
    }

    assert.ok(configurationError instanceof MailConfigurationError);
    const response = getSafeMailFailure(configurationError);
    assert.equal(response.code, 'EMAIL_CONFIGURATION_INVALID');
    assert.doesNotMatch(response.error, new RegExp(rawSecret));
    assert.doesNotMatch(configurationError.message, new RegExp(rawSecret));
});

test('requires SMTP acceptance of the requested verification recipient', () => {
    assert.equal(
        isVerificationRecipientAccepted({ accepted: ['USER@example.test'] }, 'user@example.test'),
        true
    );
    assert.equal(
        isVerificationRecipientAccepted({ accepted: ['other@example.test'] }, 'user@example.test'),
        false
    );
    assert.equal(
        isVerificationRecipientAccepted({ rejected: ['user@example.test'] }, 'user@example.test'),
        false
    );
});
