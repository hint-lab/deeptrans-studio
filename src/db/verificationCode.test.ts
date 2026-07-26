import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clearEmailVerificationCodeIfMatches,
    consumeEmailVerificationCode,
    createEmailVerificationCode,
    getVerificationCodeByEmail,
    normalizeEmailForVerification,
    releaseEmailVerificationSend,
    reserveEmailVerificationSend,
    type EmailVerificationStore,
} from './verificationCode';

class FakeEmailVerificationStore {
    readonly values = new Map<string, string>();
    readonly ttlSeconds = new Map<string, number>();
    failNextSet = false;
    failNextEval = false;

    async set(key: string, value: string, ...options: string[]) {
        if (this.failNextSet) {
            this.failNextSet = false;
            throw new Error('store unavailable');
        }
        if (options.includes('NX') && this.values.has(key)) return null;

        this.values.set(key, value);
        const expiresAtIndex = options.indexOf('EX');
        if (expiresAtIndex >= 0) this.ttlSeconds.set(key, Number(options[expiresAtIndex + 1]));
        return 'OK';
    }

    async ttl(key: string) {
        return this.ttlSeconds.get(key) ?? (this.values.has(key) ? 60 : -2);
    }

    async get(key: string) {
        return this.values.get(key) ?? null;
    }

    async del(key: string) {
        const deleted = this.values.delete(key);
        this.ttlSeconds.delete(key);
        return deleted ? 1 : 0;
    }

    async eval(_script: string, keyCount: number, key: string, expectedCode: string) {
        assert.equal(keyCount, 1);
        if (this.failNextEval) {
            this.failNextEval = false;
            throw new Error('store unavailable');
        }
        if (this.values.get(key) !== expectedCode) return 0;
        return this.del(key);
    }
}

const asStore = (store: FakeEmailVerificationStore) => store as unknown as EmailVerificationStore;

test('reserves a normalized server-side email cooldown and reports its remaining TTL', async () => {
    const store = new FakeEmailVerificationStore();

    assert.deepEqual(await reserveEmailVerificationSend('User@Example.test', asStore(store)), {
        allowed: true,
    });
    assert.equal(store.values.get('verify:email:send-cooldown:user@example.test'), '1');

    store.ttlSeconds.set('verify:email:send-cooldown:user@example.test', 37);
    assert.deepEqual(await reserveEmailVerificationSend('user@example.test', asStore(store)), {
        allowed: false,
        retryAfterSeconds: 37,
    });
});

test('fails closed when cooldown storage is unavailable and can release a failed reservation', async () => {
    const unavailableStore = new FakeEmailVerificationStore();
    unavailableStore.failNextSet = true;
    assert.deepEqual(
        await reserveEmailVerificationSend('user@example.test', asStore(unavailableStore)),
        { allowed: false, unavailable: true }
    );

    const store = new FakeEmailVerificationStore();
    await reserveEmailVerificationSend('user@example.test', asStore(store));
    await releaseEmailVerificationSend('user@example.test', asStore(store));
    assert.deepEqual(await reserveEmailVerificationSend('user@example.test', asStore(store)), {
        allowed: true,
    });
});

test('clears only the verification code belonging to the failed delivery attempt', async () => {
    const store = new FakeEmailVerificationStore();
    const key = 'verify:email:user@example.test';
    store.values.set(key, 'newer-code');

    await clearEmailVerificationCodeIfMatches('user@example.test', 'older-code', asStore(store));
    assert.equal(store.values.get(key), 'newer-code');

    await clearEmailVerificationCodeIfMatches('user@example.test', 'newer-code', asStore(store));
    assert.equal(store.values.has(key), false);
});

test('canonicalizes the email key across code creation and lookup', async () => {
    const store = new FakeEmailVerificationStore();

    assert.equal(normalizeEmailForVerification(' User@Example.test '), 'user@example.test');
    assert.deepEqual(
        await createEmailVerificationCode(' User@Example.test ', '123456', asStore(store)),
        { success: true }
    );
    assert.equal(store.values.get('verify:email:user@example.test'), '123456');
    const record = await getVerificationCodeByEmail('USER@example.TEST', asStore(store));
    assert.equal(record?.email, 'user@example.test');
    assert.equal(record?.code, '123456');
    assert.ok(record?.expiresAt instanceof Date);
});

test('canonicalizes different email casing to one Redis key', async () => {
    const store = new FakeEmailVerificationStore();

    await createEmailVerificationCode('User@Example.test', '123456', asStore(store));
    assert.equal(
        await consumeEmailVerificationCode('user@example.test', '123456', asStore(store)),
        true
    );
    assert.equal(
        await consumeEmailVerificationCode('USER@EXAMPLE.TEST', '123456', asStore(store)),
        false
    );
});

test('atomically allows only one concurrent matching email-code consumer', async () => {
    const store = new FakeEmailVerificationStore();
    const key = 'verify:email:user@example.test';
    store.values.set(key, '123456');

    const [first, second] = await Promise.all([
        consumeEmailVerificationCode('User@Example.test', '123456', asStore(store)),
        consumeEmailVerificationCode('user@example.test', '123456', asStore(store)),
    ]);

    assert.equal([first, second].filter(Boolean).length, 1);
    assert.equal(store.values.has(key), false);
});

test('does not consume a code when the value does not match', async () => {
    const store = new FakeEmailVerificationStore();
    const key = 'verify:email:user@example.test';
    store.values.set(key, '123456');

    assert.equal(
        await consumeEmailVerificationCode('user@example.test', '654321', asStore(store)),
        false
    );
    assert.equal(store.values.get(key), '123456');
});

test('fails closed when the atomic consume operation cannot reach Redis', async () => {
    const store = new FakeEmailVerificationStore();
    const key = 'verify:email:user@example.test';
    store.values.set(key, '123456');
    store.failNextEval = true;

    assert.equal(
        await consumeEmailVerificationCode('user@example.test', '123456', asStore(store)),
        false
    );
    assert.equal(store.values.get(key), '123456');
});
