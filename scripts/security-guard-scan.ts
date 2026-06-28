import fs from 'fs';
import path from 'path';

const root = process.cwd();

type CheckResult = {
    ok: boolean;
    label: string;
    detail?: string;
};

function read(relPath: string) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function listFiles(dir: string, predicate: (file: string) => boolean) {
    const out: string[] = [];
    const walk = (current: string) => {
        for (const entry of fs.readdirSync(path.join(root, current), { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git')
                continue;
            const rel = path.join(current, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (predicate(rel)) out.push(rel);
        }
    };
    walk(dir);
    return out;
}

function includesAny(text: string, needles: string[]) {
    return needles.some(needle => text.includes(needle));
}

const checks: CheckResult[] = [];
const guardMarkers = [
    'requireUser',
    'requireOwned',
    'requireAccessible',
    'requireWritable',
    'requireBatchOwner',
    'resolveUploadNamespace',
    'auth(',
    'ownedWhere',
];

const criticalRoutes: Record<string, string[]> = {
    'src/app/api/chat/route.ts': ['requireUser'],
    'src/app/api/dictionary/lookup/route.ts': ['requireUser', 'ownedWhere'],
    'src/app/api/document/preview/[itemId]/route.ts': ['requireOwnedDocumentItem'],
    'src/app/api/export/markdown/route.ts': ['requireOwnedDocument'],
    'src/app/api/export/word/route.ts': ['requireOwnedDocument'],
    'src/app/api/items/[id]/workflow/route.ts': ['requireWritableDocumentItem'],
    'src/app/api/memories/hybrid-search/route.ts': ['requireUser'],
    'src/app/api/memories/import/route.ts': ['requireUser', 'requireOwnedMemory'],
    'src/app/api/memories/import-progress/route.ts': ['requireUser'],
    'src/app/api/projects/[id]/delete/route.ts': ['requireWritableProject'],
    'src/app/api/projects/[id]/dictionaries/route.ts': ['requireOwnedProject'],
    'src/app/api/projects/[id]/doc/route.ts': ['requireOwnedProject'],
    'src/app/api/projects/[id]/init/route.ts': ['requireWritableProject'],
    'src/app/api/projects/[id]/parse/route.ts': [
        'requireWritableProject',
        'requireOwnedProjectDocument',
    ],
    'src/app/api/projects/[id]/segment/route.ts': [
        'requireWritableProject',
        'requireOwnedProjectDocument',
    ],
    'src/app/api/projects/[id]/terms/route.ts': ['requireWritableProject', 'requireUser'],
    'src/app/api/projects/[id]/terms/apply/route.ts': [
        'requireWritableProject',
        'requireOwnedProjectDocument',
        'requireUser',
    ],
    'src/app/api/projects/[id]/terms/preview/route.ts': ['requireOwnedProject'],
    'src/app/api/upload-proxy/route.ts': ['requireUser', 'requireWritableProject'],
};

const criticalActions: Record<string, string[]> = {
    'src/actions/project-bindings.ts': [
        'requireWritableProject',
        'requireAccessibleDictionary',
        'requireOwnedMemory',
    ],
    'src/actions/dictionary.ts': [
        'requireAccessibleDictionary',
        'requireWritableDictionary',
        'queryDictionaryEntriesExactWithOwner',
    ],
    'src/actions/memories.ts': ['requireOwnedMemory', 'searchMemoryAction'],
    'src/actions/batch-pre-translate.ts': [
        'requireWritableDocumentItem',
        'batch.${batchId}.userId',
    ],
    'src/actions/batch-quality-assure.ts': ['requireWritableDocumentItem', 'qa.${batchId}.userId'],
    'src/actions/pre-translate.ts': ['requireUser', 'runPreTranslateForOwner'],
    'src/actions/postedit.ts': ['requireUser'],
    'src/actions/quality-assure.ts': ['requireUser', 'runQualityAssureForOwner'],
    'src/actions/project-init.ts': ['requireUser', 'extractDocumentTermsForOwner'],
    'src/actions/embedding.ts': ['requireUser', 'embedBatchForOwner'],
    'src/actions/job.ts': ['requireUser'],
    'src/actions/parse-docx.ts': ['requireUser'],
    'src/actions/translate-image.ts': ['requireUser'],
    'src/auth.ts': ['ensureUserTenant', 'token.tenantId', 'token.role'],
    'src/app/api/auth/register/route.ts': ['ensureUserTenant'],
};

for (const [route, requiredMarkers] of Object.entries(criticalRoutes)) {
    const text = read(route);
    const missing = requiredMarkers.filter(marker => !text.includes(marker));
    checks.push({
        ok: missing.length === 0,
        label: `route guard markers: ${route}`,
        detail: missing.length ? `missing ${missing.join(', ')}` : undefined,
    });
}

for (const [action, requiredMarkers] of Object.entries(criticalActions)) {
    const text = read(action);
    const missing = requiredMarkers.filter(marker => !text.includes(marker));
    checks.push({
        ok: missing.length === 0,
        label: `action guard markers: ${action}`,
        detail: missing.length ? `missing ${missing.join(', ')}` : undefined,
    });
}

const unguardedActionFiles = listFiles('src/actions', rel => /\.ts$/.test(rel)).filter(file => {
    const text = read(file);
    return /^export async function/m.test(text) && !includesAny(text, guardMarkers);
});
checks.push({
    ok: unguardedActionFiles.length === 0,
    label: 'all exported server action files have guard markers',
    detail: unguardedActionFiles.join(', '),
});

const publicAuthActionExports = new Set([
    'src/actions/email-login.ts:emailLoginAction',
    'src/actions/login.ts:login',
    'src/actions/logout.ts:logout',
]);
const exportedActionPattern = /^export\s+(?:async\s+function\s+(\w+)|const\s+(\w+)\s*=\s*async)/gm;
const unguardedActionExports: string[] = [];
for (const file of listFiles('src/actions', rel => /\.ts$/.test(rel))) {
    const text = read(file);
    const exports: Array<{ name: string; start: number }> = [];
    let match: RegExpExecArray | null;
    exportedActionPattern.lastIndex = 0;
    while ((match = exportedActionPattern.exec(text))) {
        const name = match[1] || match[2];
        if (name) exports.push({ name, start: match.index });
    }
    for (let i = 0; i < exports.length; i += 1) {
        const item = exports[i];
        if (!item) continue;
        if (publicAuthActionExports.has(`${file}:${item.name}`)) continue;
        const next = exports[i + 1];
        const body = text.slice(item.start, next ? next.start : text.length);
        if (!includesAny(body, guardMarkers)) unguardedActionExports.push(`${file}:${item.name}`);
    }
}
checks.push({
    ok: unguardedActionExports.length === 0,
    label: 'all exported server actions have guard markers',
    detail: unguardedActionExports.join(', '),
});

const unguardedApiRoutes = listFiles('src/app/api', rel => /route\.ts$/.test(rel)).filter(file => {
    if (file.startsWith('src/app/api/auth/')) return false;
    const text = read(file);
    return /^export async function/m.test(text) && !includesAny(text, guardMarkers);
});
checks.push({
    ok: unguardedApiRoutes.length === 0,
    label: 'all non-auth api routes have guard markers',
    detail: unguardedApiRoutes.join(', '),
});

const exportedApiMethodPattern = /^export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/gm;
const unguardedApiMethods: string[] = [];
for (const file of listFiles('src/app/api', rel => /route\.ts$/.test(rel))) {
    if (file.startsWith('src/app/api/auth/')) continue;
    const text = read(file);
    const exports: Array<{ name: string; start: number }> = [];
    let match: RegExpExecArray | null;
    exportedApiMethodPattern.lastIndex = 0;
    while ((match = exportedApiMethodPattern.exec(text))) {
        const name = match[1];
        if (name) exports.push({ name, start: match.index });
    }
    for (let i = 0; i < exports.length; i += 1) {
        const item = exports[i];
        if (!item) continue;
        const next = exports[i + 1];
        const body = text.slice(item.start, next ? next.start : text.length);
        if (!includesAny(body, guardMarkers)) unguardedApiMethods.push(`${file}:${item.name}`);
    }
}
checks.push({
    ok: unguardedApiMethods.length === 0,
    label: 'all non-auth api methods have guard markers',
    detail: unguardedApiMethods.join(', '),
});

const forbiddenPatterns: Array<{ label: string; pattern: RegExp; files: string[] }> = [
    {
        label: 'src/actions exported owner/internal entrypoints',
        pattern:
            /^export\s+(?:async\s+function|const)\s+\w*(?:ForOwner|Internal|WithAuth|ByOwner)\w*/m,
        files: ['src/actions'],
    },
    {
        label: 'client supplied tenant/user query scope',
        pattern:
            /(tenantId|userId)\s*=\s*searchParams\.get|searchParams\.get\(['"](tenantId|userId)['"]\)|searchParams\.set\(['"](tenantId|userId)['"]/,
        files: ['src'],
    },
    {
        label: 'client supplied tenant/user action scope',
        pattern:
            /lookupDictionaryAction\([^)]*,|runPreTranslateAction\([\s\S]{0,200}userId|searchMemoryAction\([\s\S]{0,160}(tenantId|userId)|createDictionaryAction\([\s\S]{0,180}(tenantId|userId)|bulkUpsertEntriesAction\([\s\S]{0,180}userId|tenantId:\s*params\?|tenantId:\s*\(activeDocumentItem/,
        files: ['src/app', 'src/actions'],
    },
    {
        label: 'sensitive prompt/message logging',
        pattern: /JSON\.stringify\((messages|prompt)|Action Body|JWT token|token\.accessToken/,
        files: ['src'],
    },
    {
        label: 'dangerous vector store rebuild',
        pattern: /dropCollection|releaseCollection|Rebuilding collection|DROP INDEX|DROP EXTENSION/,
        files: ['src/lib/vector'],
    },
    {
        label: 'auth route private prisma client',
        pattern: /new PrismaClient/,
        files: ['src/app/api/auth'],
    },
    {
        label: 'global memory fallback',
        pattern: /global-memory/,
        files: ['src'],
    },
    {
        label: 'client supplied upload namespace',
        pattern:
            /form\.(?:get|append|set)\(['"]projectName['"]|getUploadUrlAction\([^)]*projectName|storageService\.getUploadUrl\([^)]*projectName/,
        files: ['src'],
    },
    {
        label: 'server layers importing server actions',
        pattern:
            /from ['"]@\/actions|import\(['"]@\/actions|from ['"]\.\.\/actions|import\(['"]\.\.\/actions/,
        files: ['src/server', 'src/agents', 'src/worker'],
    },
    {
        label: 'project api unscoped redis batch keys',
        pattern:
            /(init|docTerms|seg)\.\$\{batchId\}|preview:\$\{batchId\}|readInitStructuredRaw\(redis,\s*batchId\)|initStructuredKey\(batchId\)/,
        files: ['src/app/api/projects'],
    },
    {
        label: 'experiment tenant-level access',
        pattern:
            /experiment\.tenantId\s*&&\s*experiment\.tenantId\s*===\s*owner\.tenantId|owner\.tenantId\s*&&\s*experiment\.tenantId\s*===\s*owner\.tenantId/,
        files: ['src/server/experiments'],
    },
    {
        label: 'legacy memoryEntry model usage',
        pattern: /\.memoryEntry\b/,
        files: ['src'],
    },
];

for (const rule of forbiddenPatterns) {
    const hits: string[] = [];
    for (const scope of rule.files) {
        for (const file of listFiles(scope, rel => /\.(ts|tsx)$/.test(rel))) {
            const text = read(file);
            if (rule.pattern.test(text)) hits.push(file);
        }
    }
    checks.push({
        ok: hits.length === 0,
        label: `forbidden pattern: ${rule.label}`,
        detail: hits.join(', '),
    });
}

const middleware = read('src/middleware.ts');
for (const publicApi of ['/api/dictionary/lookup', '/api/memories/hybrid-search']) {
    checks.push({
        ok: !middleware.includes(`'${publicApi}'`) && !middleware.includes(`"${publicApi}"`),
        label: `middleware does not expose ${publicApi}`,
    });
}

const queue = read('src/worker/queue.ts');
checks.push({
    ok: queue.includes('function getQueueConnection') && !queue.includes('export const connection'),
    label: 'BullMQ connection is lazy',
});

const packageJson = JSON.parse(read('package.json'));
checks.push({
    ok: packageJson.scripts?.['security:scan'] === 'tsx scripts/security-guard-scan.ts',
    label: 'security scan script is registered',
});

checks.push({
    ok:
        packageJson.scripts?.['security:isolation-smoke'] ===
        'tsx scripts/security-isolation-smoke.ts',
    label: 'security isolation smoke script is registered',
});

const isolationSmokeText = read('scripts/security-isolation-smoke.ts');
checks.push({
    ok:
        isolationSmokeText.includes('requireWritableProject') &&
        isolationSmokeText.includes('requireWritableDocument') &&
        isolationSmokeText.includes('requireWritableDocumentItem') &&
        isolationSmokeText.includes('same tenant cannot write project dictionary'),
    label: 'security isolation smoke covers readable-vs-writable boundaries',
});

checks.push({
    ok:
        packageJson.scripts?.['security:verify'] === 'tsx scripts/security-verify.ts' &&
        read('scripts/security-verify.ts').includes('DATABASE_URL') &&
        read('scripts/security-verify.ts').includes('tenant:backfill') &&
        read('scripts/security-verify.ts').includes('security:isolation-smoke'),
    label: 'security verify script is registered',
});

checks.push({
    ok:
        read('scripts/seed-demo-user.ts').includes('ensureDemoTenant') &&
        read('prisma/seed.ts').includes('ensureDemoTenant') &&
        read('scripts/create-demo-user.sql').includes('"tenantId"'),
    label: 'demo users are assigned tenants',
});

checks.push({
    ok:
        packageJson.scripts?.['tenant:backfill'] === 'tsx scripts/backfill-tenant-ownership.ts' &&
        packageJson.scripts?.['tenant:backfill:write'] ===
            'tsx scripts/backfill-tenant-ownership.ts --write' &&
        read('scripts/backfill-tenant-ownership.ts').includes("process.argv.includes('--write')"),
    label: 'tenant ownership backfill is registered and write-gated',
});

const memoryImportRoute = read('src/app/api/memories/import/route.ts');
checks.push({
    ok:
        memoryImportRoute.includes('assertUserUploadObject(fileKey, authCtx.userId)') &&
        memoryImportRoute.includes('requireOwnedMemory(memoryId, authCtx)'),
    label: 'memory import route scopes file key and memory owner',
});

const workerText = read('src/worker/index.ts');
checks.push({
    ok:
        workerText.includes('startsWith(`users/${userId}/uploads/`)') &&
        workerText.includes('where: { id: memoryId, userId }') &&
        workerText.includes('translationMemoryEntry.create'),
    label: 'memory import worker verifies owner and writes TranslationMemoryEntry',
});

const guardsText = read('src/lib/guards.ts');
checks.push({
    ok:
        guardsText.includes('export async function requireWritableProject') &&
        guardsText.includes('userId: authCtx.userId') &&
        guardsText.includes('export async function requireWritableDocument') &&
        guardsText.includes('project: { userId: authCtx.userId }') &&
        guardsText.includes('export async function requireWritableDocumentItem') &&
        guardsText.includes('findWritableDocumentItemForOwner') &&
        guardsText.includes('export async function requireWritableDictionary') &&
        guardsText.includes('project: {\n                                userId: authCtx.userId'),
    label: 'writable guards are user-owner scoped',
});

const failed = checks.filter(check => !check.ok);
for (const check of checks) {
    const prefix = check.ok ? 'PASS' : 'FAIL';
    console.log(`${prefix} ${check.label}${check.detail ? `: ${check.detail}` : ''}`);
}

if (failed.length) {
    process.exitCode = 1;
}
