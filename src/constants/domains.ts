export const DOMAINS = [
    { value: 'general', labelKey: 'general' },
    { value: 'technology', labelKey: 'technology' },
    { value: 'legal', labelKey: 'legal' },
    { value: 'medical', labelKey: 'medical' },
    { value: 'finance', labelKey: 'finance' },
    { value: 'ai', labelKey: 'ai' },
    { value: 'marketing', labelKey: 'marketing' },
    { value: 'engineering', labelKey: 'engineering' },
    { value: 'education', labelKey: 'education' },
    { value: 'custom', labelKey: 'custom' },
];

export function getDomainOptions(translate: (key: string) => string) {
    return DOMAINS.map(domain => {
        let label = domain.labelKey;
        try {
            const t = translate(domain.labelKey);
            if (t) label = t;
        } catch {}
        return { value: domain.value, label };
    });
}
