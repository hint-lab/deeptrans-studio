import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localDevInternals } from './local-dev.mjs';

const {
    assertLocalConfig,
    generateLocalAuthSecret,
    parseLocalEnv,
    assertLocalAppPortAvailable,
    localChildEnv,
    localPrismaBinary,
    assertLocalMinioBucket,
    ensureLocalMinioBucket,
    formatLocalDevFailure,
    LOCAL_COMPOSE_PORT_BINDINGS,
} = localDevInternals;

function localConfig(overrides = {}) {
    return {
        NODE_ENV: 'development',
        IS_DEMO: 'yes',
        AUTH_SECRET: 'local-test-auth-secret-0123456789abcdef',
        NEXTAUTH_URL: 'http://localhost:3000',
        LOCAL_POSTGRES_USER: 'deeptrans_local',
        LOCAL_POSTGRES_PASSWORD: 'deeptrans_local_password',
        LOCAL_POSTGRES_DB: 'deeptrans_local',
        DATABASE_URL:
            'postgresql://deeptrans_local:deeptrans_local_password@127.0.0.1:55432/deeptrans_local?schema=public',
        DIRECT_URL:
            'postgresql://deeptrans_local:deeptrans_local_password@127.0.0.1:55432/deeptrans_local?schema=public',
        REDIS_URL: 'redis://127.0.0.1:56379',
        LOCAL_MINIO_USER: 'deeptrans_local',
        LOCAL_MINIO_PASSWORD: 'deeptrans_local_password',
        STORAGE_TYPE: 'minio',
        STORAGE_ENDPOINT: '127.0.0.1',
        STORAGE_PORT: '59002',
        STORAGE_USE_SSL: 'false',
        STORAGE_ACCESS_KEY: 'deeptrans_local',
        STORAGE_SECRET_KEY: 'deeptrans_local_password',
        STORAGE_BUCKET: 'deeptrans-local',
        EMBEDDING_DIMENSIONS: '2048',
        LOCAL_ALLOW_REMOTE_AI: 'no',
        ...overrides,
    };
}

function restoreEnv(key, previous) {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
}

test('local profile requires an http loopback NEXTAUTH_URL on port 3000', () => {
    assert.doesNotThrow(() => assertLocalConfig(localConfig()));
    assert.throws(
        () => assertLocalConfig(localConfig({ NEXTAUTH_URL: 'https://localhost:3000' })),
        /NEXTAUTH_URL must use http:/
    );
    assert.throws(
        () => assertLocalConfig(localConfig({ NEXTAUTH_URL: 'http://example.com:3000' })),
        /NEXTAUTH_URL must use localhost, 127\.0\.0\.1, or ::1/
    );
    assert.throws(
        () => assertLocalConfig(localConfig({ NEXTAUTH_URL: 'http://localhost:3001' })),
        /NEXTAUTH_URL must use local port 3000/
    );
});

test('missing .env.local reports safe, actionable recovery before app dependencies are used', () => {
    const runner = readFileSync(new URL('./local-dev.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(runner, /from 'dotenv'/);
    assert.doesNotMatch(runner, /from 'minio'/);
    assert.throws(
        () => parseLocalEnv(new URL('../.local-dev-env-does-not-exist', import.meta.url)),
        /Missing \.env\.local\.\n  1\. Copy the template: cp \.env\.local\.example \.env\.local\n  2\. Generate a local-only AUTH_SECRET: npm run local:secret\n  3\. Paste it into AUTH_SECRET, then run npm run local:setup\./
    );
});

test('unexpected local startup errors do not echo arbitrary connection details', () => {
    const raw = 'postgresql://local-user:local-secret@127.0.0.1:55432/deeptrans_local';
    const message = formatLocalDevFailure(new Error(raw));

    assert.doesNotMatch(message, /local-secret/);
    assert.match(message, /npm run local:check/);
});

test('local profile rejects a placeholder or too-short auth secret without echoing it', () => {
    assert.throws(
        () => assertLocalConfig(localConfig({ AUTH_SECRET: 'replace-with-a-local-random-secret' })),
        /Set a non-placeholder AUTH_SECRET.*npm run local:secret/
    );
    assert.throws(
        () => assertLocalConfig(localConfig({ AUTH_SECRET: 'too-short' })),
        /AUTH_SECRET must be at least 32 characters/
    );
});

test('local secret generation is random, suitably strong, and does not require .env.local', () => {
    const first = generateLocalAuthSecret();
    const second = generateLocalAuthSecret();

    assert.match(first, /^[A-Za-z0-9+/]{43}=$/);
    assert.match(second, /^[A-Za-z0-9+/]{43}=$/);
    assert.notEqual(first, second);

    const runner = readFileSync(new URL('./local-dev.mjs', import.meta.url), 'utf8');
    assert.match(
        runner,
        /if \(command === 'secret'\) \{\s*console\.log\(generateLocalAuthSecret\(\)\);\s*return;\s*\}\s*const config = parseLocalEnv\(\);/
    );

    const packageJson = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    assert.equal(packageJson.scripts['local:secret'], 'node scripts/local-dev.mjs secret');
});

test('stateful local services use the exact address published by Compose', () => {
    assert.throws(
        () =>
            assertLocalConfig(
                localConfig({
                    DATABASE_URL:
                        'postgresql://deeptrans_local:deeptrans_local_password@localhost:55432/deeptrans_local?schema=public',
                    DIRECT_URL:
                        'postgresql://deeptrans_local:deeptrans_local_password@localhost:55432/deeptrans_local?schema=public',
                })
            ),
        /DATABASE_URL must use 127\.0\.0\.1/
    );
    assert.throws(
        () => assertLocalConfig(localConfig({ REDIS_URL: 'redis://[::1]:56379' })),
        /REDIS_URL must use 127\.0\.0\.1/
    );
    assert.throws(
        () => assertLocalConfig(localConfig({ STORAGE_ENDPOINT: 'localhost' })),
        /Storage must use local MinIO at 127\.0\.0\.1:59002/
    );
});

test('local translation-memory embeddings remain fixed at 2048 dimensions', () => {
    assert.doesNotThrow(() => assertLocalConfig(localConfig()));
    assert.throws(
        () => assertLocalConfig(localConfig({ EMBEDDING_DIMENSIONS: '1536' })),
        /EMBEDDING_DIMENSIONS must be 2048/
    );
});

test('local dev refuses an occupied auth/app port instead of letting Next fall back', async () => {
    const checkedHosts = [];
    await assert.rejects(
        assertLocalAppPortAvailable(localConfig(), async (host, port) => {
            checkedHosts.push([host, port]);
            return host === '::1';
        }),
        /Local app port 3000 is already in use on ::1/
    );
    assert.deepEqual(checkedHosts, [
        ['127.0.0.1', '3000'],
        ['::1', '3000'],
    ]);
});

test('local dev accepts port 3000 only when no loopback listener is present', async () => {
    await assert.doesNotReject(assertLocalAppPortAvailable(localConfig(), async () => false));
});

test('local readiness requires the storage bucket created by setup', async () => {
    await assert.rejects(
        assertLocalMinioBucket(localConfig(), {
            async bucketExists() {
                return false;
            },
        }),
        /Local MinIO bucket deeptrans-local is missing\. Run npm run local:setup/
    );
});

test('local setup creates a missing storage bucket once and remains idempotent', async () => {
    let exists = false;
    let created = 0;
    const client = {
        async bucketExists(bucket) {
            assert.equal(bucket, 'deeptrans-local');
            return exists;
        },
        async makeBucket(bucket) {
            assert.equal(bucket, 'deeptrans-local');
            created += 1;
            exists = true;
        },
    };

    await ensureLocalMinioBucket(localConfig(), client);
    await ensureLocalMinioBucket(localConfig(), client);

    assert.equal(created, 1);
});

test('local readiness resolves the installed Prisma CLI', () => {
    assert.match(localPrismaBinary(), /node_modules[\\/]\.bin[\\/]prisma(?:\.cmd)?$/);
});

test('application child environment is sealed to the validated local profile', () => {
    const previousEmail = process.env.EMAIL_SERVER;
    const previousUnknown = process.env.UNRELATED_PRODUCTION_VALUE;
    const previousDockerHost = process.env.DOCKER_HOST;
    const previousAuthUrl = process.env.AUTH_URL;
    const previousAuthSecret = process.env.AUTH_SECRET;
    const previousAuthTrustHost = process.env.AUTH_TRUST_HOST;
    const previousEmbeddingDimensions = process.env.EMBEDDING_DIMENSIONS;
    process.env.EMAIL_SERVER = 'smtps://production.example.test';
    process.env.UNRELATED_PRODUCTION_VALUE = 'must-not-reach-the-app';
    process.env.DOCKER_HOST = 'tcp://remote-docker.example.test:2376';
    process.env.AUTH_URL = 'https://production.example.test';
    process.env.AUTH_SECRET = 'production-auth-secret';
    process.env.AUTH_TRUST_HOST = 'false';
    process.env.EMBEDDING_DIMENSIONS = '1536';

    try {
        const env = localChildEnv(localConfig());
        assert.equal(env.EMAIL_SERVER, '');
        assert.equal(env.OPENAI_API_KEY, '');
        assert.equal(env.UNRELATED_PRODUCTION_VALUE, undefined);
        assert.equal(env.DOCKER_HOST, undefined);
        assert.equal(env.NEXTAUTH_URL, 'http://localhost:3000');
        assert.equal(env.NEXTAUTH_SECRET, 'local-test-auth-secret-0123456789abcdef');
        assert.equal(env.AUTH_URL, 'http://localhost:3000');
        assert.equal(env.AUTH_SECRET, 'local-test-auth-secret-0123456789abcdef');
        assert.equal(env.AUTH_TRUST_HOST, 'true');
        assert.equal(env.PORT, '3000');
        assert.equal(env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000');
        assert.equal(env.MINERU_DISABLE, 'true');
        assert.equal(env.EMBEDDING_DIMENSIONS, '2048');
    } finally {
        restoreEnv('EMAIL_SERVER', previousEmail);
        restoreEnv('UNRELATED_PRODUCTION_VALUE', previousUnknown);
        restoreEnv('DOCKER_HOST', previousDockerHost);
        restoreEnv('AUTH_URL', previousAuthUrl);
        restoreEnv('AUTH_SECRET', previousAuthSecret);
        restoreEnv('AUTH_TRUST_HOST', previousAuthTrustHost);
        restoreEnv('EMBEDDING_DIMENSIONS', previousEmbeddingDimensions);
    }
});

test('MinIO contract includes isolated API and Console bindings', () => {
    assert.deepEqual(LOCAL_COMPOSE_PORT_BINDINGS.minio, [
        { host: '127.0.0.1', containerPort: '9000/tcp', hostPort: '59002' },
        { host: '127.0.0.1', containerPort: '9001/tcp', hostPort: '59003' },
    ]);
});

test('Compose bindings stay aligned with the local runner contract', () => {
    const compose = readFileSync(new URL('../docker-compose.dev.yml', import.meta.url), 'utf8');
    assert.match(compose, /'127\.0\.0\.1:55432:5432'/);
    assert.match(compose, /'127\.0\.0\.1:56379:6379'/);
    assert.match(compose, /'127\.0\.0\.1:59002:9000'/);
    assert.match(compose, /'127\.0\.0\.1:59003:9001'/);
});

test('local object storage uses a versioned MinIO image instead of a moving latest tag', () => {
    const compose = readFileSync(new URL('../docker-compose.dev.yml', import.meta.url), 'utf8');
    assert.match(compose, /image:\s+quay\.io\/minio\/minio:RELEASE\.2025-09-06T17-38-46Z/);
    assert.doesNotMatch(compose, /minio(?:\/minio)?:latest/);
});

test('legacy Compose points developers to the guarded isolated local startup path', () => {
    const legacyCompose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

    assert.match(legacyCompose, /npm run local:setup/);
    assert.match(legacyCompose, /docker-compose\.dev\.yml/);
    assert.match(readme, /docker-compose\.dev\.yml\s+# Isolated local PostgreSQL/);
    assert.match(readme, /docker-compose-prod\.yml\s+# Production deployment services/);
});

test('db:generate only generates the Prisma client', () => {
    const packageJson = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    assert.equal(packageJson.scripts['db:generate'], 'prisma generate');
});

test('raw development server pins the validated port without a POSIX-only env assignment', () => {
    const packageJson = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    assert.match(packageJson.scripts['dev:raw'], /next dev .*--port 3000/);
    assert.doesNotMatch(packageJson.scripts['dev:raw'], /^\s*[A-Z_][A-Z0-9_]*=/);
});

test('combined local development entrypoint is cross-platform and keeps both guarded processes linked', () => {
    const packageJson = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    const script = packageJson.scripts['dev:all'];

    assert.match(script, /^concurrently\b/);
    assert.match(script, /--kill-others-on-fail/);
    assert.match(script, /npm run dev/);
    assert.match(script, /npm run worker/);
    assert.doesNotMatch(script, /\bsh\s+-c\b/);
});
