// Shared enums and string unions for front-end/back-end interaction

// Mirrors prisma enum TranslationStage
export enum TranslationStage {
    NOT_STARTED = 'NOT_STARTED',
    MT = 'MT',
    MT_REVIEW = 'MT_REVIEW',
    QA = 'QA',
    QA_REVIEW = 'QA_REVIEW',
    POST_EDIT = 'POST_EDIT',
    POST_EDIT_REVIEW = 'POST_EDIT_REVIEW',
    SIGN_OFF = 'SIGN_OFF',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR',
    CANCELED = 'CANCELED',
}

// Mirrors prisma enum DictionaryVisibility
export enum DictionaryVisibility {
    PUBLIC = 'PUBLIC',
    PROJECT = 'PROJECT',
    PRIVATE = 'PRIVATE',
}

// Mirrors prisma enum UserRole
export enum UserRole {
    ADMIN = 'ADMIN',
    USER = 'USER',
}

// Mirrors prisma enum SuggestionScope
export enum SuggestionScope {
    GLOBAL = 'GLOBAL',
    ORG = 'ORG',
    PROJECT = 'PROJECT',
    DOCUMENT = 'DOCUMENT',
}

// Mirrors prisma enum SuggestionStatus
export enum SuggestionStatus {
    DRAFT = 'DRAFT',
    APPROVED = 'APPROVED',
    ARCHIVED = 'ARCHIVED',
}

// Mirrors prisma enum TranslationProcessActorType
export enum TranslationProcessActorType {
    AGENT = 'AGENT',
    USER = 'USER',
}

// Mirrors prisma enum TranslationProcessStepStatus
export enum TranslationProcessStepStatus {
    STARTED = 'STARTED',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export enum DocumentStatus {
    WAITING = 'WAITING',
    PARSING = 'PARSING',
    SEGMENTING = 'SEGMENTING',
    TERMS_EXTRACTING = 'TERMS_EXTRACTING',
    PREPROCESSED = 'PREPROCESSED',
    TRANSLATING = 'TRANSLATING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR',
}
