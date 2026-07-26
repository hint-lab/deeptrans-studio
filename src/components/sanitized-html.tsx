'use client';

import DOMPurify from 'dompurify';
import { useEffect, useState, type HTMLAttributes } from 'react';

type SanitizedHtmlProfile = 'document' | 'help';

type SanitizedHtmlProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    html: string;
    profile: SanitizedHtmlProfile;
};

// Uploaded-document output only needs the semantic tags emitted by our parsers.
// Help may also retain ordinary documentation layout, tables, links and images.
// Neither view needs forms, embedded documents, SVG/MathML, inline event handlers,
// or inline CSS.
const DOCUMENT_TAGS = [
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'li',
    'mark',
    'ol',
    'p',
    'pre',
    's',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'u',
    'ul',
];

const HELP_ONLY_TAGS = [
    'abbr',
    'article',
    'caption',
    'dd',
    'dl',
    'dt',
    'figcaption',
    'figure',
    'img',
    'kbd',
    'main',
    'section',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
];

const DOCUMENT_ATTRIBUTES = ['dir', 'lang', 'title'];

const HELP_ONLY_ATTRIBUTES = [
    'alt',
    'class',
    'colspan',
    'height',
    'href',
    'rel',
    'rowspan',
    'src',
    'style',
    'width',
];

const FORBIDDEN_TAGS = [
    'base',
    'embed',
    'form',
    'iframe',
    'input',
    'link',
    'math',
    'meta',
    'object',
    'script',
    'select',
    'style',
    'svg',
    'template',
    'textarea',
];

const SAFE_URI = /^(?:(?:https?|mailto|tel):|(?:\.{0,2}\/|\/|\?|#))/i;

const HELP_STYLE_RULES: Record<string, RegExp> = {
    display: /^(?:block|inline|inline-block|none)$/i,
    height: /^(?:auto|\d+(?:\.\d+)?(?:%|px|rem|em|vh|vw))$/i,
    'image-rendering': /^(?:auto|crisp-edges|pixelated)$/i,
    'max-height': /^(?:none|\d+(?:\.\d+)?(?:%|px|rem|em|vh|vw))$/i,
    'max-width': /^(?:none|\d+(?:\.\d+)?(?:%|px|rem|em|vh|vw))$/i,
    width: /^(?:auto|\d+(?:\.\d+)?(?:%|px|rem|em|vh|vw))$/i,
};

export function sanitizeHelpInlineStyle(value: string): string {
    return String(value || '')
        .split(';')
        .flatMap(declaration => {
            const separator = declaration.indexOf(':');
            if (separator <= 0) return [];
            const property = declaration.slice(0, separator).trim().toLowerCase();
            const propertyValue = declaration.slice(separator + 1).trim();
            if (!HELP_STYLE_RULES[property]?.test(propertyValue)) return [];
            return [`${property}:${propertyValue}`];
        })
        .join(';');
}

function sanitizeHtml(html: string, profile: SanitizedHtmlProfile): string {
    if (typeof window === 'undefined' || !DOMPurify.isSupported) return '';

    const isHelp = profile === 'help';
    const purifier = DOMPurify(window);
    // DOMPurify permits data URIs for <img> by default. These views do not need
    // them; reject them explicitly so a preview cannot embed data: payloads.
    purifier.addHook('uponSanitizeAttribute', (_node, data) => {
        if (data.attrName === 'style') {
            if (!isHelp) {
                data.keepAttr = false;
                return;
            }
            const safeStyle = sanitizeHelpInlineStyle(data.attrValue);
            data.attrValue = safeStyle;
            data.keepAttr = Boolean(safeStyle);
            return;
        }
        if (!['href', 'src'].includes(data.attrName)) return;
        const normalized = data.attrValue.replace(/[\u0000-\u0020]+/g, '');
        if (/^data:/i.test(normalized)) data.keepAttr = false;
    });

    return String(
        purifier.sanitize(html, {
            ALLOWED_TAGS: isHelp ? [...DOCUMENT_TAGS, ...HELP_ONLY_TAGS] : DOCUMENT_TAGS,
            ALLOWED_ATTR: isHelp
                ? [...DOCUMENT_ATTRIBUTES, ...HELP_ONLY_ATTRIBUTES]
                : DOCUMENT_ATTRIBUTES,
            ALLOWED_URI_REGEXP: SAFE_URI,
            ALLOW_ARIA_ATTR: false,
            ALLOW_DATA_ATTR: false,
            ALLOW_UNKNOWN_PROTOCOLS: false,
            FORBID_ATTR: isHelp ? [] : ['style'],
            FORBID_TAGS: FORBIDDEN_TAGS,
            ADD_FORBID_CONTENTS: ['embed', 'iframe', 'math', 'object', 'script', 'style', 'svg'],
            SANITIZE_DOM: true,
            SANITIZE_NAMED_PROPS: true,
        })
    );
}

/**
 * Renders untrusted HTML only after it has passed a narrow DOMPurify policy.
 *
 * Sanitizing in an effect keeps the server-rendered and hydrated first pass
 * equally empty; DOMPurify relies on browser DOM APIs and must never be asked
 * to trust a server-side fallback.
 */
export function SanitizedHtml({ html, profile, ...props }: SanitizedHtmlProps) {
    const [safeHtml, setSafeHtml] = useState('');

    useEffect(() => {
        setSafeHtml(sanitizeHtml(String(html || ''), profile));
    }, [html, profile]);

    return <div {...props} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
