import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

type Messages = Record<string, unknown>;

const WORKSPACE_ROOT = process.cwd();
const SOURCE_ROOT = path.join(WORKSPACE_ROOT, 'src');
const ZH_MESSAGES = readMessages('zh');
const EN_MESSAGES = readMessages('en');

const EXPLICIT_DYNAMIC_NAMESPACES: Record<string, readonly string[]> = {
    'src/components/file-upload.tsx:t': [
        'FileUpload',
        'Dashboard.DocumentTranslate',
        'Dashboard.ImageTranslate',
    ],
};

function readMessages(locale: 'zh' | 'en'): Messages {
    const filePath = path.join(SOURCE_ROOT, 'i18n', `${locale}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Messages;
}

function flattenLeaves(
    value: unknown,
    prefix = '',
    leaves = new Map<string, unknown>()
): Map<string, unknown> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) {
            flattenLeaves(child, prefix ? `${prefix}.${key}` : key, leaves);
        }
    } else {
        leaves.set(prefix, value);
    }
    return leaves;
}

function extractIcuPlaceholders(message: string): string[] {
    return [
        ...new Set(
            [...message.matchAll(/\{\s*([A-Za-z_][\w.-]*)\s*(?:,|\})/g)].map(match => match[1]!)
        ),
    ].sort();
}

function getMessage(messages: Messages, keyPath: string): unknown {
    let current: unknown = messages;
    for (const key of keyPath.split('.')) {
        if (
            current === null ||
            typeof current !== 'object' ||
            !Object.prototype.hasOwnProperty.call(current, key)
        ) {
            return undefined;
        }
        current = (current as Messages)[key];
    }
    return current;
}

function listTypeScriptFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listTypeScriptFiles(filePath);
        if (!/\.tsx?$/.test(entry.name) || /(?:\.d|\.test)\.tsx?$/.test(entry.name)) return [];
        return [filePath];
    });
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
    let current = expression;
    while (
        ts.isAwaitExpression(current) ||
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isSatisfiesExpression(current)
    ) {
        current = current.expression;
    }
    return current;
}

function stringLiteralValue(node: ts.Node | undefined): string | undefined {
    return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        ? node.text
        : undefined;
}

function collectStaticTranslationCalls(): Array<{
    file: string;
    line: number;
    key: string;
}> {
    const sourceFiles = listTypeScriptFiles(SOURCE_ROOT);
    const program = ts.createProgram(sourceFiles, {
        allowJs: false,
        jsx: ts.JsxEmit.Preserve,
        noResolve: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ESNext,
    });
    const checker = program.getTypeChecker();
    const bindings = new Map<ts.Symbol, readonly string[]>();

    for (const sourceFile of program.getSourceFiles()) {
        if (!sourceFiles.includes(sourceFile.fileName)) continue;
        const relativeFile = path.relative(WORKSPACE_ROOT, sourceFile.fileName);

        const visit = (node: ts.Node) => {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
                const initializer = unwrapExpression(node.initializer);
                if (
                    ts.isCallExpression(initializer) &&
                    ts.isIdentifier(initializer.expression) &&
                    ['useTranslations', 'getTranslations'].includes(initializer.expression.text)
                ) {
                    const symbol = checker.getSymbolAtLocation(node.name);
                    const namespace = initializer.arguments.length
                        ? stringLiteralValue(initializer.arguments[0])
                        : '';
                    const explicitDynamicNamespaces =
                        EXPLICIT_DYNAMIC_NAMESPACES[`${relativeFile}:${node.name.text}`];

                    if (symbol && namespace !== undefined) bindings.set(symbol, [namespace]);
                    else if (symbol && explicitDynamicNamespaces) {
                        bindings.set(symbol, explicitDynamicNamespaces);
                    }
                }
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
    }

    const calls: Array<{ file: string; line: number; key: string }> = [];
    for (const sourceFile of program.getSourceFiles()) {
        if (!sourceFiles.includes(sourceFile.fileName)) continue;
        const relativeFile = path.relative(WORKSPACE_ROOT, sourceFile.fileName);

        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
                const symbol = checker.getSymbolAtLocation(node.expression);
                const namespaces = symbol && bindings.get(symbol);
                const key = stringLiteralValue(node.arguments[0]);

                if (namespaces && key !== undefined) {
                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                    for (const namespace of namespaces) {
                        calls.push({
                            file: relativeFile,
                            line,
                            key: namespace ? `${namespace}.${key}` : key,
                        });
                    }
                }
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
    }

    return calls;
}

test('Chinese and English message trees have identical recursive leaf keys', () => {
    const zhKeys = [...flattenLeaves(ZH_MESSAGES).keys()].sort();
    const enKeys = [...flattenLeaves(EN_MESSAGES).keys()].sort();

    assert.deepEqual(zhKeys, enKeys);
});

test('Chinese and English messages use identical ICU placeholder sets', () => {
    const zhLeaves = flattenLeaves(ZH_MESSAGES);
    const enLeaves = flattenLeaves(EN_MESSAGES);
    const mismatches: Array<{ key: string; zh: string[]; en: string[] }> = [];

    for (const [key, zhValue] of zhLeaves) {
        const enValue = enLeaves.get(key);
        if (typeof zhValue !== 'string' || typeof enValue !== 'string') continue;

        const zhPlaceholders = extractIcuPlaceholders(zhValue);
        const enPlaceholders = extractIcuPlaceholders(enValue);
        if (zhPlaceholders.join('\0') !== enPlaceholders.join('\0')) {
            mismatches.push({ key, zh: zhPlaceholders, en: enPlaceholders });
        }
    }

    assert.deepEqual(mismatches, []);
});

test('static translation calls resolve to string messages in both locales', () => {
    const missing: Array<{ file: string; line: number; locale: string; key: string }> = [];

    for (const call of collectStaticTranslationCalls()) {
        for (const [locale, messages] of [
            ['zh', ZH_MESSAGES],
            ['en', EN_MESSAGES],
        ] as const) {
            if (typeof getMessage(messages, call.key) !== 'string') {
                missing.push({ ...call, locale });
            }
        }
    }

    assert.deepEqual(missing, []);
});
