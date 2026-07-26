#!/usr/bin/env node

/**
 * Isolated local-development entrypoint.
 * Commands that need configuration read only .env.local and refuse
 * non-loopback stateful services before starting containers, migrations, or
 * the Next.js process. The standalone `secret` command reads no env file.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireLocalModule = createRequire(import.meta.url);
const ENV_PATH = resolve(ROOT, '.env.local');
const COMPOSE_FILE = 'docker-compose.dev.yml';
const COMPOSE_PROJECT = 'deeptrans-local';
const DB_PORT = '55432';
const REDIS_PORT = '56379';
const MINIO_PORT = '59002';
const MINIO_CONSOLE_PORT = '59003';
const DB_NAME = 'deeptrans_local';
const LOCAL_EMBEDDING_DIMENSIONS = '2048';
const SERVICE_READY_TIMEOUT_MS = 45_000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
// docker-compose.dev.yml publishes every stateful local dependency on this
// exact address. Keep application URLs flexible, but do not accept a loopback
// alias that Docker did not bind; it may resolve to ::1 and fail at runtime.
const COMPOSE_BOUND_HOST = '127.0.0.1';
const LOCAL_COMPOSE_PORT_BINDINGS = {
    db: [{ host: COMPOSE_BOUND_HOST, containerPort: '5432/tcp', hostPort: DB_PORT }],
    valkey: [{ host: COMPOSE_BOUND_HOST, containerPort: '6379/tcp', hostPort: REDIS_PORT }],
    minio: [
        { host: COMPOSE_BOUND_HOST, containerPort: '9000/tcp', hostPort: MINIO_PORT },
        { host: COMPOSE_BOUND_HOST, containerPort: '9001/tcp', hostPort: MINIO_CONSOLE_PORT },
    ],
};
// Keep only process settings required to launch local tools. Application
// configuration comes exclusively from the validated .env.local profile.
const RUNTIME_ENV_KEYS = [
    'PATH',
    'Path',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TERM',
    'COLORTERM',
    'NO_COLOR',
];
const LOCAL_OPTIONAL_APP_KEYS = [
    'AUTH_SESSION_MAX_AGE',
    'DOCUMENT_TERMS_LLM_TIMEOUT_MS',
    'LOGGER_ENABLE_DEBUG',
    'LOGGER_DISABLE_DEBUG_TYPES',
    'REDIS_TTL_BATCH',
    'REDIS_TTL_PREVIEW',
    'REDIS_TTL_PROGRESS',
];
const REMOTE_SERVICE_KEYS = [
    'EMAIL_SERVER',
    'EMAIL_FROM',
    'COS_SECRET_ID',
    'COS_SECRET_KEY',
    'COS_BUCKET',
    'COS_REGION',
    'COS_APP_ID',
    'COS_DOMAIN',
    'COS_USE_SSL',
    'OCR_AUTH_URL',
    'OCR_BASE_URL',
    'OCR_CLIENT_ID',
    'OCR_CLIENT_SECRET',
];
const REMOTE_AI_KEYS = [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_API_MODEL',
    'OPENAI_EMBED_MODEL',
    'LLM_API_KEY',
    'LLM_BASE_URL',
    'LLM_MODEL',
    'EMBEDDING_API_KEY',
    'EMBEDDING_BASE_URL',
    'EMBEDDING_API_PATH',
    'EMBEDDING_MODEL',
    'MINERU_API_TOKEN',
    'MINERU_AGENT_BASE_URL',
    'MINERU_API_BASE_URL',
    'MINERU_API_MODE',
    'MINERU_MODEL_VERSION',
    'MINERU_LANGUAGE',
    'MINERU_IS_OCR',
    'MINERU_ENABLE_TABLE',
    'MINERU_ENABLE_FORMULA',
    'MINERU_TIMEOUT_MS',
    'MINERU_POLL_INTERVAL_MS',
    'MINERU_PAGE_RANGE',
];
const BLOCKED_APPLICATION_ENV_KEYS = [
    ...REMOTE_SERVICE_KEYS,
    ...REMOTE_AI_KEYS,
    ...LOCAL_OPTIONAL_APP_KEYS,
    'BULL_BOARD_PORT',
    'BULL_QUEUES',
    'DICTIONARY_API_URL',
    'EMBEDDING_DIMENSIONS',
    'HOSTNAME',
    'INTERNAL_API_BASE',
    'JWT_SECRET',
    'MEMORY_API_URL',
    'MINIO_ACCESS_KEY',
    'MINIO_BROWSER_REDIRECT_URL',
    'MINIO_BUCKET',
    'MINIO_BUCKET_NAME',
    'MINIO_ENDPOINT',
    'MINIO_PORT',
    'MINIO_ROOT_PASSWORD',
    'MINIO_ROOT_USER',
    'MINIO_SECRET_KEY',
    'MINIO_USE_SSL',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_DICTIONARY_API_URL',
    'POSTGRES_URL',
    'SKIP_ENV_VALIDATION',
    'STORAGE_APP_ID',
    'STORAGE_DOMAIN',
    'STORAGE_DOWNLOAD_URL_EXPIRES_SECONDS',
    'STORAGE_REGION',
    'STORAGE_UPLOAD_URL_EXPIRES_SECONDS',
    'VERCEL_URL',
];

class LocalConfigError extends Error {}

function fail(message) {
    throw new LocalConfigError(`[local-dev] ${message}`);
}

/**
 * Local configuration diagnostics are deliberately authored above. An
 * unexpected child-process or library error can contain connection strings,
 * so do not append its raw message at the process boundary.
 */
function formatLocalDevFailure(error) {
    if (error instanceof LocalConfigError) return error.message;
    return '[local-dev] Local startup failed unexpectedly. Re-run npm run local:check to verify the isolated profile and dependencies; do not paste credentials into the terminal output.';
}

function dependencyInstallHint() {
    return 'Run npm install, or use yarn install --frozen-lockfile when Yarn v1 is available, then retry.';
}

function loadLocalDependency(name) {
    try {
        return requireLocalModule(name);
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'MODULE_NOT_FOUND') {
            fail(`Missing local dependency ${name}. ${dependencyInstallHint()}`);
        }
        throw error;
    }
}

function npmBinary() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function localPrismaBinary() {
    const binary = resolve(
        ROOT,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
    );
    if (!existsSync(binary)) {
        fail(`Missing the local Prisma CLI. ${dependencyInstallHint()}`);
    }
    return binary;
}

function dockerBinary() {
    return process.platform === 'win32' ? 'docker.exe' : 'docker';
}

function run(command, args, env) {
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' });
        child.once('error', error => rejectRun(error));
        child.once('exit', code => {
            if (code === 0) resolveRun();
            else
                rejectRun(
                    new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`)
                );
        });
    });
}

function capture(command, args, env) {
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(command, args, {
            cwd: ROOT,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', chunk => {
            stdout += chunk.toString();
        });
        child.stderr?.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.once('error', error => rejectRun(error));
        child.once('exit', code => {
            if (code === 0) resolveRun(stdout.trim());
            else {
                const detail = stderr.trim();
                rejectRun(
                    new Error(
                        `${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}${
                            detail ? `: ${detail}` : ''
                        }`
                    )
                );
            }
        });
    });
}

function parseLocalEnv(envPath = ENV_PATH) {
    if (!existsSync(envPath)) {
        fail(
            'Missing .env.local.\n  1. Copy the template: cp .env.local.example .env.local\n  2. Generate a local-only AUTH_SECRET: npm run local:secret\n  3. Paste it into AUTH_SECRET, then run npm run local:setup.'
        );
    }
    const { parse } = loadLocalDependency('dotenv');
    return parse(readFileSync(envPath));
}

/**
 * This helper intentionally does not read or write .env.local. It lets every
 * supported shell generate an AUTH_SECRET without depending on OpenSSL.
 */
function generateLocalAuthSecret() {
    return randomBytes(32).toString('base64');
}

function hostFrom(url) {
    return url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

function decodeUrlPart(value) {
    try {
        return decodeURIComponent(value || '');
    } catch {
        return value || '';
    }
}

function assertLoopbackUrl(value, key, expectedPort, expectedProtocol) {
    if (!value) fail(`${key} is required in .env.local.`);
    let url;
    try {
        url = new URL(value);
    } catch {
        fail(`${key} must be a valid URL.`);
    }
    if (expectedProtocol && url.protocol !== expectedProtocol) {
        fail(`${key} must use ${expectedProtocol}.`);
    }
    if (!LOOPBACK_HOSTS.has(hostFrom(url))) {
        fail(`${key} must use localhost, 127.0.0.1, or ::1; remote services are refused.`);
    }
    if (url.port !== expectedPort) {
        fail(`${key} must use local port ${expectedPort}.`);
    }
    return url;
}

function assertComposeServiceUrl(value, key, expectedPort, expectedProtocol) {
    const url = assertLoopbackUrl(value, key, expectedPort, expectedProtocol);
    if (hostFrom(url) !== COMPOSE_BOUND_HOST) {
        fail(
            `${key} must use ${COMPOSE_BOUND_HOST}; docker-compose.dev.yml publishes local dependencies only on that address.`
        );
    }
    return url;
}

function assertLocalConfig(config) {
    if (config.NODE_ENV && config.NODE_ENV !== 'development') {
        fail('NODE_ENV must be development in .env.local.');
    }
    if (config.IS_DEMO !== 'yes') fail('IS_DEMO must be yes for the isolated local profile.');
    const authSecret = String(config.AUTH_SECRET || '').trim();
    if (!authSecret || authSecret.includes('replace-with')) {
        fail(
            'Set a non-placeholder AUTH_SECRET in .env.local. Generate a local-only value with npm run local:secret; do not reuse a production secret.'
        );
    }
    if (authSecret.length < 32) {
        fail('AUTH_SECRET must be at least 32 characters. Generate one with npm run local:secret.');
    }
    assertLoopbackUrl(config.NEXTAUTH_URL, 'NEXTAUTH_URL', '3000', 'http:');

    const databaseUrl = assertComposeServiceUrl(
        config.DATABASE_URL,
        'DATABASE_URL',
        DB_PORT,
        'postgresql:'
    );
    const databaseName = decodeURIComponent(databaseUrl.pathname).replace(/^\/+|\/+$/g, '');
    if (databaseName !== DB_NAME) {
        fail(`DATABASE_URL must target the isolated ${DB_NAME} database.`);
    }
    if (decodeUrlPart(databaseUrl.username) !== config.LOCAL_POSTGRES_USER) {
        fail('DATABASE_URL must use LOCAL_POSTGRES_USER.');
    }
    if (decodeUrlPart(databaseUrl.password) !== config.LOCAL_POSTGRES_PASSWORD) {
        fail('DATABASE_URL must use LOCAL_POSTGRES_PASSWORD.');
    }
    if (config.DIRECT_URL) {
        const directUrl = assertComposeServiceUrl(
            config.DIRECT_URL,
            'DIRECT_URL',
            DB_PORT,
            'postgresql:'
        );
        if (decodeURIComponent(directUrl.pathname).replace(/^\/+|\/+$/g, '') !== DB_NAME) {
            fail(`DIRECT_URL must target the isolated ${DB_NAME} database.`);
        }
        if (decodeUrlPart(directUrl.username) !== config.LOCAL_POSTGRES_USER) {
            fail('DIRECT_URL must use LOCAL_POSTGRES_USER.');
        }
        if (decodeUrlPart(directUrl.password) !== config.LOCAL_POSTGRES_PASSWORD) {
            fail('DIRECT_URL must use LOCAL_POSTGRES_PASSWORD.');
        }
    }

    assertComposeServiceUrl(config.REDIS_URL, 'REDIS_URL', REDIS_PORT, 'redis:');
    if (config.STORAGE_TYPE !== 'minio')
        fail('STORAGE_TYPE must be minio locally; COS is refused.');
    const storageHost = String(config.STORAGE_ENDPOINT || '').toLowerCase();
    if (storageHost !== COMPOSE_BOUND_HOST || String(config.STORAGE_PORT) !== MINIO_PORT) {
        fail(`Storage must use local MinIO at ${COMPOSE_BOUND_HOST}:${MINIO_PORT}.`);
    }
    if (String(config.STORAGE_USE_SSL).toLowerCase() !== 'false') {
        fail('STORAGE_USE_SSL must be false for local MinIO.');
    }
    for (const key of ['STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'STORAGE_BUCKET']) {
        if (!config[key]) fail(`${key} is required for local MinIO.`);
    }
    for (const key of [
        'LOCAL_POSTGRES_USER',
        'LOCAL_POSTGRES_PASSWORD',
        'LOCAL_POSTGRES_DB',
        'LOCAL_MINIO_USER',
        'LOCAL_MINIO_PASSWORD',
    ]) {
        if (!config[key]) fail(`${key} is required by docker-compose.dev.yml.`);
    }
    if (config.LOCAL_POSTGRES_DB !== DB_NAME) fail(`LOCAL_POSTGRES_DB must be ${DB_NAME}.`);
    if (config.STORAGE_ACCESS_KEY !== config.LOCAL_MINIO_USER) {
        fail('STORAGE_ACCESS_KEY must match LOCAL_MINIO_USER.');
    }
    if (config.STORAGE_SECRET_KEY !== config.LOCAL_MINIO_PASSWORD) {
        fail('STORAGE_SECRET_KEY must match LOCAL_MINIO_PASSWORD.');
    }
    if (config.LOCAL_ALLOW_REMOTE_AI && !['yes', 'no'].includes(config.LOCAL_ALLOW_REMOTE_AI)) {
        fail('LOCAL_ALLOW_REMOTE_AI must be yes or no.');
    }
    const embeddingDimensions = String(config.EMBEDDING_DIMENSIONS || '').trim();
    if (embeddingDimensions && embeddingDimensions !== LOCAL_EMBEDDING_DIMENSIONS) {
        fail(
            `EMBEDDING_DIMENSIONS must be ${LOCAL_EMBEDDING_DIMENSIONS} for the local translation-memory schema.`
        );
    }
}

function copyEnvKeys(target, source, keys) {
    for (const key of keys) {
        if (source[key] !== undefined) target[key] = source[key];
    }
}

function inheritedRuntimeEnv() {
    const env = {};
    copyEnvKeys(env, process.env, RUNTIME_ENV_KEYS);
    return env;
}

function localChildEnv(config) {
    const env = inheritedRuntimeEnv();

    // Next loads .env files itself. Pre-set blocked keys so a production-like
    // .env cannot reintroduce remote endpoints after this runner starts.
    for (const key of BLOCKED_APPLICATION_ENV_KEYS) env[key] = '';

    Object.assign(env, {
        NODE_ENV: 'development',
        IS_DEMO: 'yes',
        PORT: '3000',
        AUTH_TRUST_HOST: 'true',
        // Auth.js v5 resolves AUTH_* before the legacy NEXTAUTH_* aliases.
        // Set both families before Next.js or the worker can load a root .env.
        AUTH_URL: config.NEXTAUTH_URL,
        AUTH_SECRET: config.AUTH_SECRET,
        NEXTAUTH_URL: config.NEXTAUTH_URL,
        NEXTAUTH_SECRET: config.AUTH_SECRET,
        DATABASE_URL: config.DATABASE_URL,
        DIRECT_URL: config.DIRECT_URL || config.DATABASE_URL,
        REDIS_URL: config.REDIS_URL,
        STORAGE_TYPE: 'minio',
        STORAGE_ENDPOINT: config.STORAGE_ENDPOINT,
        STORAGE_PORT: config.STORAGE_PORT,
        STORAGE_USE_SSL: 'false',
        STORAGE_ACCESS_KEY: config.STORAGE_ACCESS_KEY,
        STORAGE_SECRET_KEY: config.STORAGE_SECRET_KEY,
        STORAGE_BUCKET: config.STORAGE_BUCKET,
        // Keep the vector contract stable even when Next.js or the Worker later
        // loads a root .env file. The local schema stores 2048-dimensional vectors.
        EMBEDDING_DIMENSIONS: LOCAL_EMBEDDING_DIMENSIONS,
        DICTIONARY_API_URL: config.NEXTAUTH_URL,
        INTERNAL_API_BASE: config.NEXTAUTH_URL,
        MEMORY_API_URL: config.NEXTAUTH_URL,
        NEXT_PUBLIC_API_URL: config.NEXTAUTH_URL,
        NEXT_PUBLIC_APP_URL: config.NEXTAUTH_URL,
        NEXT_PUBLIC_BASE_URL: config.NEXTAUTH_URL,
        NEXT_PUBLIC_DICTIONARY_API_URL: config.NEXTAUTH_URL,
    });

    copyEnvKeys(env, config, LOCAL_OPTIONAL_APP_KEYS);

    if (config.LOCAL_ALLOW_REMOTE_AI !== 'yes') {
        for (const key of REMOTE_AI_KEYS) env[key] = '';
        env.MINERU_DISABLE = 'true';
    } else {
        copyEnvKeys(env, config, REMOTE_AI_KEYS);
        env.MINERU_DISABLE = config.MINERU_DISABLE || 'true';
    }
    return env;
}

function localToolEnv(config) {
    const env = localChildEnv(config);
    // Docker access is needed only by local setup/check commands, never by the
    // application or worker. It remains verified by ensureDocker below.
    copyEnvKeys(env, process.env, ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']);
    return env;
}

function isLocalDockerEndpoint(value) {
    const endpoint = String(value || '').trim();
    const normalizedEndpoint = endpoint.toLowerCase();
    // A loopback TCP endpoint can still be an SSH tunnel to a remote daemon.
    // The isolated profile therefore accepts only OS-local Docker sockets.
    return normalizedEndpoint.startsWith('unix://') || normalizedEndpoint.startsWith('npipe://');
}

function waitForTcp(host, port, label) {
    const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS;
    return new Promise((resolveWait, rejectWait) => {
        const attempt = () => {
            const socket = createConnection({ host, port: Number(port) });
            const retry = () => {
                socket.destroy();
                if (Date.now() >= deadline) {
                    rejectWait(new Error(`${label} did not become reachable within 45 seconds.`));
                } else {
                    setTimeout(attempt, 750);
                }
            };
            socket.setTimeout(2_000);
            socket.once('connect', () => {
                socket.end();
                resolveWait();
            });
            socket.once('error', retry);
            socket.once('timeout', retry);
        };
        attempt();
    });
}

function isTcpPortOpen(host, port) {
    return new Promise(resolveProbe => {
        const socket = createConnection({ host, port: Number(port) });
        let settled = false;
        const settle = open => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolveProbe(open);
        };
        socket.setTimeout(1_000);
        socket.once('connect', () => settle(true));
        socket.once('error', () => settle(false));
        socket.once('timeout', () => settle(false));
    });
}

/**
 * Next's dev server can silently move to the next free port. That leaves the
 * validated local profile pointing at 3000 while the app listens elsewhere,
 * so reject the launch before it can claim a misleading successful startup.
 */
async function assertLocalAppPortAvailable(config, probe = isTcpPortOpen) {
    const appUrl = assertLoopbackUrl(config.NEXTAUTH_URL, 'NEXTAUTH_URL', '3000', 'http:');
    const configuredHost = hostFrom(appUrl);
    const hosts = configuredHost === 'localhost' ? ['127.0.0.1', '::1'] : [configuredHost];

    for (const host of hosts) {
        if (await probe(host, appUrl.port)) {
            fail(
                `Local app port ${appUrl.port} is already in use on ${host}. Stop the existing process before npm run dev; the isolated profile will not fall back to another port.`
            );
        }
    }
}

function waitForRedis(host, port) {
    const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS;
    return new Promise((resolveWait, rejectWait) => {
        const attempt = () => {
            const socket = createConnection({ host, port: Number(port) });
            let output = '';
            const retry = () => {
                socket.destroy();
                if (Date.now() >= deadline) {
                    rejectWait(new Error('Valkey did not answer PING within 45 seconds.'));
                } else {
                    setTimeout(attempt, 750);
                }
            };
            socket.setTimeout(2_000);
            socket.once('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
            socket.on('data', data => {
                output += data.toString();
                if (output.includes('+PONG')) {
                    socket.end();
                    resolveWait();
                }
            });
            socket.once('error', retry);
            socket.once('timeout', retry);
        };
        attempt();
    });
}

function localMinioReadyUrl(config) {
    const host = String(config.STORAGE_ENDPOINT).toLowerCase();
    const hostname = host.includes(':') ? `[${host}]` : host;
    return `http://${hostname}:${config.STORAGE_PORT}/minio/health/ready`;
}

async function waitForMinio(config) {
    const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS;
    const readyUrl = localMinioReadyUrl(config);

    while (Date.now() < deadline) {
        try {
            const response = await fetch(readyUrl, { signal: AbortSignal.timeout(2_000) });
            if (response.ok) return;
        } catch {
            // The container may still be starting; retry below.
        }
        await new Promise(resolveWait => setTimeout(resolveWait, 750));
    }

    throw new Error('MinIO did not become ready within 45 seconds.');
}

function createLocalMinioClient(config) {
    const { Client } = loadLocalDependency('minio');
    return new Client({
        endPoint: config.STORAGE_ENDPOINT,
        port: Number(config.STORAGE_PORT),
        useSSL: false,
        accessKey: config.STORAGE_ACCESS_KEY,
        secretKey: config.STORAGE_SECRET_KEY,
    });
}

function ensureLocalDependencies() {
    localPrismaBinary();
    loadLocalDependency('minio');
}

async function verifyMinioCredentials(config, client = createLocalMinioClient(config)) {
    try {
        await client.listBuckets();
    } catch {
        fail(
            'Local MinIO rejected STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY. Confirm they match the existing deeptrans-local MinIO volume; do not copy production credentials into .env.local.'
        );
    }
    return client;
}

async function assertLocalMinioBucket(config, client = createLocalMinioClient(config)) {
    let exists;
    try {
        exists = await client.bucketExists(config.STORAGE_BUCKET);
    } catch {
        fail(
            'Could not verify the local MinIO bucket. Confirm the isolated MinIO service is healthy and its local credentials are unchanged.'
        );
    }
    if (!exists) {
        fail(
            `Local MinIO bucket ${config.STORAGE_BUCKET} is missing. Run npm run local:setup to create the owned local storage bucket.`
        );
    }
}

async function ensureLocalMinioBucket(config, client = createLocalMinioClient(config)) {
    let exists;
    try {
        exists = await client.bucketExists(config.STORAGE_BUCKET);
    } catch {
        fail(
            'Could not inspect the local MinIO bucket. Confirm the isolated MinIO service is healthy and its local credentials are unchanged.'
        );
    }
    if (exists) return;

    try {
        await client.makeBucket(config.STORAGE_BUCKET);
    } catch {
        fail(
            `Could not create the local MinIO bucket ${config.STORAGE_BUCKET}. Confirm the isolated MinIO credentials can create buckets, then retry npm run local:setup.`
        );
    }
}

async function check(config, { requireReady = true } = {}) {
    assertLocalConfig(config);
    const nodeVersion = process.versions.node.split('.').map(Number);
    if (nodeVersion[0] < 18 || (nodeVersion[0] === 18 && nodeVersion[1] < 18)) {
        fail('Node.js 18.18 or later is required.');
    }
    ensureLocalDependencies();
    const db = new URL(config.DATABASE_URL);
    const redis = new URL(config.REDIS_URL);
    if (!requireReady) return;
    const env = localToolEnv(config);
    await ensureDocker(env);
    await assertLocalComposeOwnership(env);
    await waitForTcp(hostFrom(db), db.port, 'PostgreSQL');
    await waitForRedis(hostFrom(redis), redis.port);
    await waitForMinio(config);
    await waitForTcp(config.STORAGE_ENDPOINT, MINIO_CONSOLE_PORT, 'MinIO Console');
    const minio = await verifyMinioCredentials(config);
    await assertLocalMinioBucket(config, minio);
    await run(localPrismaBinary(), ['migrate', 'status'], env);
    console.log(
        '[local-dev] Local PostgreSQL, Valkey, MinIO API/Console plus storage bucket, and Prisma migrations are ready. Translation-memory imports and other queued workflows also require npm run worker in a separate terminal.'
    );
}

async function ensureDocker(env) {
    if (env.DOCKER_HOST && !isLocalDockerEndpoint(env.DOCKER_HOST)) {
        fail(
            'DOCKER_HOST must be unset or use a local unix/npipe Docker socket; TCP and remote daemons are refused.'
        );
    }
    try {
        await run(dockerBinary(), ['compose', 'version'], env);
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
            fail(
                'Docker CLI with the Compose plugin is required for the isolated local profile. Install Docker Desktop, then retry.'
            );
        }
        fail(
            'Docker Compose could not run. Start Docker Desktop or install/enable the Compose plugin, select a local Docker context, then retry.'
        );
    }
    let contextName;
    let endpoint;
    try {
        contextName = await capture(dockerBinary(), ['context', 'show'], env);
        endpoint = await capture(
            dockerBinary(),
            ['context', 'inspect', contextName, '--format', '{{ .Endpoints.docker.Host }}'],
            env
        );
    } catch {
        fail(
            'Could not verify the active Docker context. Start Docker Desktop and select a local unix/npipe Docker context before retrying.'
        );
    }
    if (!isLocalDockerEndpoint(endpoint)) {
        fail(
            `Docker context ${contextName || '<unknown>'} is not a local unix/npipe socket; TCP and remote daemons are refused for local development.`
        );
    }
}

function composeArgs(...args) {
    return [
        'compose',
        '-p',
        COMPOSE_PROJECT,
        '--env-file',
        '.env.local',
        '-f',
        COMPOSE_FILE,
        ...args,
    ];
}

async function assertLocalComposeOwnership(env) {
    const expectedServices = new Set(Object.keys(LOCAL_COMPOSE_PORT_BINDINGS));
    let rawIds;
    try {
        rawIds = await capture(
            dockerBinary(),
            [...composeArgs('ps', '-q', ...expectedServices)],
            env
        );
    } catch {
        fail('Could not inspect deeptrans-local Compose services. Run npm run local:up first.');
    }

    const containerIds = rawIds.split(/\s+/).filter(Boolean);
    if (containerIds.length !== expectedServices.size) {
        fail(
            'Local db, valkey, and minio must all be running under the deeptrans-local Compose project.'
        );
    }

    const observedServices = new Set();
    for (const containerId of containerIds) {
        let details;
        try {
            details = await capture(
                dockerBinary(),
                [
                    'inspect',
                    '--format',
                    '{{ index .Config.Labels "com.docker.compose.project" }}|{{ index .Config.Labels "com.docker.compose.service" }}|{{ .State.Running }}',
                    containerId,
                ],
                env
            );
        } catch {
            fail('Could not verify a local Compose container ownership label.');
        }

        const [project, service, running] = details.split('|');
        if (project !== COMPOSE_PROJECT || !expectedServices.has(service) || running !== 'true') {
            fail('Local dependency containers must belong to deeptrans-local and be running.');
        }
        await assertLocalServicePortBinding(env, containerId, service);
        observedServices.add(service);
    }

    if (observedServices.size !== expectedServices.size) {
        fail('The deeptrans-local Compose project is missing one or more required services.');
    }
}

async function assertLocalServicePortBinding(env, containerId, service) {
    const expectedBindings = LOCAL_COMPOSE_PORT_BINDINGS[service];
    if (!expectedBindings) fail(`Unexpected deeptrans-local Compose service: ${service}.`);

    let rawPorts;
    try {
        rawPorts = await capture(
            dockerBinary(),
            ['inspect', '--format', '{{ json .NetworkSettings.Ports }}', containerId],
            env
        );
    } catch {
        fail(`Could not inspect the published port for local ${service}.`);
    }

    let ports;
    try {
        ports = JSON.parse(rawPorts);
    } catch {
        fail(`Could not parse the published port for local ${service}.`);
    }

    const publishedPorts = Object.entries(ports || {})
        .filter(([, bindings]) => Array.isArray(bindings) && bindings.length > 0)
        .map(([containerPort]) => containerPort)
        .sort();
    const expectedPorts = expectedBindings.map(({ containerPort }) => containerPort).sort();
    if (publishedPorts.join('|') !== expectedPorts.join('|')) {
        fail(`Local ${service} must not publish ports outside its isolated local contract.`);
    }

    for (const expected of expectedBindings) {
        const bindings = ports?.[expected.containerPort];
        if (!Array.isArray(bindings) || bindings.length !== 1) {
            fail(
                `Local ${service} must publish exactly one ${expected.containerPort} binding on ${expected.hostPort}.`
            );
        }

        const binding = bindings[0];
        if (!binding || typeof binding !== 'object') {
            fail(`Local ${service} has an invalid ${expected.containerPort} port binding.`);
        }

        const hostIp = binding.HostIp;
        const hostPort = binding.HostPort;
        if (
            String(hostIp || '').toLowerCase() !== expected.host ||
            hostPort !== expected.hostPort
        ) {
            fail(
                `Local ${service} must publish ${expected.containerPort} only on ${expected.host}:${expected.hostPort}.`
            );
        }
    }
}

async function up(config) {
    await check(config, { requireReady: false });
    const env = localToolEnv(config);
    await ensureDocker(env);
    await run(
        dockerBinary(),
        [...composeArgs('up', '-d', '--build', 'db', 'valkey', 'minio')],
        env
    );
    await assertLocalComposeOwnership(env);
    const db = new URL(config.DATABASE_URL);
    const redis = new URL(config.REDIS_URL);
    await waitForTcp(hostFrom(db), db.port, 'PostgreSQL');
    await waitForRedis(hostFrom(redis), redis.port);
    await waitForMinio(config);
    await waitForTcp(config.STORAGE_ENDPOINT, MINIO_CONSOLE_PORT, 'MinIO Console');
    await verifyMinioCredentials(config);
    console.log(
        '[local-dev] Local dependencies are running. Run npm run local:setup once before first login.'
    );
}

async function main() {
    const command = process.argv[2] || 'check';
    if (command === 'secret') {
        console.log(generateLocalAuthSecret());
        return;
    }
    const config = parseLocalEnv();
    if (command === 'check') return check(config);
    if (command === 'up') return up(config);
    if (command === 'setup') {
        await up(config);
        const env = localToolEnv(config);
        await run(npmBinary(), ['run', 'db:migrate'], env);
        await run(npmBinary(), ['run', 'db:seed:demo'], env);
        await ensureLocalMinioBucket(config);
        console.log('[local-dev] Local schema, demo account, and storage bucket are ready.');
        return;
    }
    if (command === 'dev') {
        await check(config);
        await assertLocalAppPortAvailable(config);
        return run(npmBinary(), ['run', 'dev:raw'], localChildEnv(config));
    }
    if (command === 'worker') {
        await check(config);
        return run(npmBinary(), ['run', 'worker:raw'], localChildEnv(config));
    }
    fail('Usage: node scripts/local-dev.mjs <secret|check|up|setup|dev|worker>');
}

export const localDevInternals = Object.freeze({
    assertLocalConfig,
    generateLocalAuthSecret,
    parseLocalEnv,
    localChildEnv,
    localPrismaBinary,
    assertLocalAppPortAvailable,
    assertLocalMinioBucket,
    ensureLocalMinioBucket,
    formatLocalDevFailure,
    LOCAL_COMPOSE_PORT_BINDINGS,
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(formatLocalDevFailure(error));
        process.exitCode = 1;
    });
}
