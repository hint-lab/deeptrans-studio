import { DOMAINS } from '@/constants/domains';

export const DICTIONARY_VISIBILITIES = ['PUBLIC', 'PROJECT', 'PRIVATE'] as const;

export type DictionaryVisibility = (typeof DICTIONARY_VISIBILITIES)[number];

export const DICTIONARY_CREATE_LIMITS = {
    name: 120,
    description: 2_000,
} as const;

/**
 * These values cross the server-action boundary. They are deliberately stable
 * codes instead of user-facing copy, so every dictionary creation surface can
 * present the same localized, actionable error.
 */
export const DICTIONARY_CREATE_ERROR_CODES = {
    NAME_REQUIRED: 'DICTIONARY_NAME_REQUIRED',
    NAME_TOO_LONG: 'DICTIONARY_NAME_TOO_LONG',
    DESCRIPTION_TOO_LONG: 'DICTIONARY_DESCRIPTION_TOO_LONG',
    DOMAIN_REQUIRED: 'DICTIONARY_DOMAIN_REQUIRED',
    DOMAIN_INVALID: 'DICTIONARY_DOMAIN_INVALID',
    VISIBILITY_INVALID: 'DICTIONARY_VISIBILITY_INVALID',
    AUTH_REQUIRED: 'DICTIONARY_AUTH_REQUIRED',
    PUBLIC_ADMIN_REQUIRED: 'DICTIONARY_PUBLIC_ADMIN_REQUIRED',
    PROJECT_TENANT_REQUIRED: 'DICTIONARY_PROJECT_TENANT_REQUIRED',
    CREATE_FAILED: 'DICTIONARY_CREATE_FAILED',
} as const;

export type DictionaryCreateErrorCode =
    (typeof DICTIONARY_CREATE_ERROR_CODES)[keyof typeof DICTIONARY_CREATE_ERROR_CODES];

export type DictionaryCreateInput = {
    name?: unknown;
    description?: unknown;
    domain?: unknown;
    visibility?: unknown;
};

export type NormalizedDictionaryCreateInput = {
    name: string;
    description?: string;
    domain: string;
    visibility: DictionaryVisibility;
};

export type DictionaryCreateInputValidation =
    | { ok: true; data: NormalizedDictionaryCreateInput }
    | { ok: false; errorCode: DictionaryCreateErrorCode };

const domainValues = new Set(DOMAINS.map(domain => domain.value));

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function visibility(value: unknown): DictionaryVisibility | null {
    if (value === undefined) return 'PRIVATE';
    const normalized = text(value);
    return DICTIONARY_VISIBILITIES.includes(normalized as DictionaryVisibility)
        ? (normalized as DictionaryVisibility)
        : null;
}

/**
 * Forms are not the only callers of a server action. Normalize and validate
 * before any database call so blank or forged values can never create a
 * dictionary.
 */
export function validateDictionaryCreateInput(
    input: DictionaryCreateInput | null | undefined
): DictionaryCreateInputValidation {
    const safeInput = input && typeof input === 'object' ? input : {};
    const name = text(safeInput.name);
    const description = text(safeInput.description);
    const domain = text(safeInput.domain);
    const dictionaryVisibility = visibility(safeInput.visibility);

    if (!name) return { ok: false, errorCode: DICTIONARY_CREATE_ERROR_CODES.NAME_REQUIRED };
    if (name.length > DICTIONARY_CREATE_LIMITS.name) {
        return { ok: false, errorCode: DICTIONARY_CREATE_ERROR_CODES.NAME_TOO_LONG };
    }
    if (description.length > DICTIONARY_CREATE_LIMITS.description) {
        return { ok: false, errorCode: DICTIONARY_CREATE_ERROR_CODES.DESCRIPTION_TOO_LONG };
    }
    if (!domain) return { ok: false, errorCode: DICTIONARY_CREATE_ERROR_CODES.DOMAIN_REQUIRED };
    if (!domainValues.has(domain)) {
        return { ok: false, errorCode: DICTIONARY_CREATE_ERROR_CODES.DOMAIN_INVALID };
    }
    if (!dictionaryVisibility) {
        return { ok: false, errorCode: DICTIONARY_CREATE_ERROR_CODES.VISIBILITY_INVALID };
    }

    return {
        ok: true,
        data: {
            name,
            ...(description ? { description } : {}),
            domain,
            visibility: dictionaryVisibility,
        },
    };
}

export function dictionaryCreateErrorTranslationKey(errorCode: unknown) {
    switch (errorCode) {
        case DICTIONARY_CREATE_ERROR_CODES.NAME_REQUIRED:
            return 'CreateDialog.nameRequired';
        case DICTIONARY_CREATE_ERROR_CODES.NAME_TOO_LONG:
            return 'CreateDialog.nameTooLong';
        case DICTIONARY_CREATE_ERROR_CODES.DESCRIPTION_TOO_LONG:
            return 'CreateDialog.descriptionTooLong';
        case DICTIONARY_CREATE_ERROR_CODES.DOMAIN_REQUIRED:
            return 'CreateDialog.domainRequired';
        case DICTIONARY_CREATE_ERROR_CODES.DOMAIN_INVALID:
            return 'CreateDialog.domainInvalid';
        case DICTIONARY_CREATE_ERROR_CODES.VISIBILITY_INVALID:
            return 'CreateDialog.visibilityInvalid';
        case DICTIONARY_CREATE_ERROR_CODES.AUTH_REQUIRED:
            return 'CreateDialog.loginRequired';
        case DICTIONARY_CREATE_ERROR_CODES.PUBLIC_ADMIN_REQUIRED:
            return 'CreateDialog.publicAdminRequired';
        case DICTIONARY_CREATE_ERROR_CODES.PROJECT_TENANT_REQUIRED:
            return 'CreateDialog.projectTenantRequired';
        default:
            return 'CreateDialog.createFailed';
    }
}

export function dictionaryCreateErrorField(errorCode: unknown) {
    switch (errorCode) {
        case DICTIONARY_CREATE_ERROR_CODES.NAME_REQUIRED:
        case DICTIONARY_CREATE_ERROR_CODES.NAME_TOO_LONG:
            return 'name' as const;
        case DICTIONARY_CREATE_ERROR_CODES.DESCRIPTION_TOO_LONG:
            return 'description' as const;
        case DICTIONARY_CREATE_ERROR_CODES.DOMAIN_REQUIRED:
        case DICTIONARY_CREATE_ERROR_CODES.DOMAIN_INVALID:
            return 'domain' as const;
        default:
            return null;
    }
}
