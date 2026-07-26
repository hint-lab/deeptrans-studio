import Link from 'next/link';
import LocaleSwitcher from '@/components/locale-switcher';
import {
    ArrowRight,
    BookOpen,
    Check,
    FileText,
    ScanSearch,
    ShieldCheck,
    Workflow,
} from 'lucide-react';
import { getLocale } from 'next-intl/server';

type LandingCopy = {
    eyebrow: string;
    title: string;
    description: string;
    primaryAction: string;
    secondaryAction: string;
    sourceLabel: string;
    targetLabel: string;
    sourceText: string;
    targetText: string;
    matchLabel: string;
    matchDetail: string;
    sheetLabel: string;
    segmentLabel: string;
    reviewedLabel: string;
    traceableLabel: string;
    footerTagline: string;
    headerTagline: string;
    evidence: Array<{ title: string; description: string }>;
    footer: string;
};

function copyFor(locale: string, year: number): LandingCopy {
    if (locale === 'en') {
        return {
            eyebrow: 'THE TRANSLATOR’S WORKBENCH',
            title: 'Every decision in a translation deserves its evidence.',
            description:
                'Bring terminology, similar segments, review findings, and human sign-off into one accountable translation workflow.',
            primaryAction: 'Open the workbench',
            secondaryAction: 'Explore the workflow',
            sourceLabel: 'SOURCE · ZH',
            targetLabel: 'TARGET · EN',
            sourceText: '幼儿园变更、终止的，应当按照有关规定提前向县级人民政府教育行政部门报告。',
            targetText:
                'Where a kindergarten is altered or terminated, it shall report in advance to the education administrative department of the county-level people’s government.',
            matchLabel: 'MEMORY MATCH · 92%',
            matchDetail: '教育行政部门 → education administrative department',
            sheetLabel: 'EVIDENCE SHEET · 01',
            segmentLabel: 'Segment 31',
            reviewedLabel: 'Reviewed draft',
            traceableLabel: 'Traceable',
            footerTagline: 'Human judgement, retained.',
            headerTagline: 'Translation evidence system',
            evidence: [
                {
                    title: 'Terminology stays visible',
                    description: 'Use approved terms at the moment a segment is translated.',
                },
                {
                    title: 'References remain traceable',
                    description: 'Inspect similar segments instead of trusting a black-box answer.',
                },
                {
                    title: 'Review leads to sign-off',
                    description: 'Move from draft to QA, post-editing, and accountable delivery.',
                },
            ],
            footer: `© ${year} H!NT LAB · SHU`,
        };
    }

    return {
        eyebrow: '专业翻译工作台',
        title: '每一个译文判断，都应有依据可循。',
        description:
            '把术语、相似语段、质检发现与人工签发放进同一条可追溯的翻译工作链，让专业判断留得住、查得到。',
        primaryAction: '进入工作台',
        secondaryAction: '查看工作流',
        sourceLabel: '原文 · 中文',
        targetLabel: '译文 · English',
        sourceText: '幼儿园变更、终止的，应当按照有关规定提前向县级人民政府教育行政部门报告。',
        targetText:
            'Where a kindergarten is altered or terminated, it shall report in advance to the education administrative department of the county-level people’s government.',
        matchLabel: '记忆命中 · 92%',
        matchDetail: '教育行政部门 → education administrative department',
        sheetLabel: '证据校样 · 01',
        segmentLabel: '第 31 语段',
        reviewedLabel: '已完成审校',
        traceableLabel: '可追溯',
        footerTagline: '保留专业判断。',
        headerTagline: '翻译证据系统',
        evidence: [
            {
                title: '术语始终可见',
                description: '在翻译当前语段时直接调用已确认的术语资产。',
            },
            {
                title: '参考始终可追溯',
                description: '查看相似语段与来源，而不是接受黑箱式答案。',
            },
            {
                title: '审校走向签发',
                description: '从草译、质检到译后编辑和最终交付，状态清晰可复核。',
            },
        ],
        footer: `© ${year} H!NT LAB · SHU`,
    };
}

function EvidenceIcon({ index }: { index: number }) {
    const Icon = [FileText, ScanSearch, ShieldCheck][index] || FileText;
    return <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />;
}

export default async function Home() {
    const locale = await getLocale();
    const copy = copyFor(locale, new Date().getFullYear());

    return (
        <main className="min-h-screen overflow-hidden bg-[#f4f5f7] text-[#172033]">
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 opacity-[0.38] [background-image:linear-gradient(#d9dde6_1px,transparent_1px),linear-gradient(90deg,#d9dde6_1px,transparent_1px)] [background-size:42px_42px]"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none fixed left-[-12rem] top-[-13rem] h-[34rem] w-[34rem] rounded-full bg-[#b9c9ff]/45 blur-3xl"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none fixed bottom-[-16rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-[#b6eadb]/40 blur-3xl"
            />

            <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:px-12">
                <header className="flex items-center justify-between border-b border-[#d8dce5] py-5 sm:py-6">
                    <Link href="/" className="flex items-center" aria-label="DeepTrans Studio">
                        <img
                            src="/logo.svg"
                            alt="DeepTrans Studio"
                            className="h-auto w-[162px] sm:w-[184px]"
                        />
                    </Link>
                    <div className="flex items-center gap-3">
                        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[#667085] sm:inline">
                            {copy.headerTagline}
                        </span>
                        <div className="rounded-md border border-[#d8dce5] bg-white/70 shadow-sm backdrop-blur">
                            <LocaleSwitcher />
                        </div>
                    </div>
                </header>

                <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,0.86fr)] lg:gap-16 lg:py-20">
                    <div className="max-w-2xl">
                        <div className="mb-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#52617b]">
                            <span className="h-px w-9 bg-[#52617b]" />
                            {copy.eyebrow}
                        </div>
                        <h1 className="max-w-[14ch] text-4xl font-semibold tracking-[-0.055em] text-[#172033] sm:text-5xl lg:text-6xl lg:leading-[1.04]">
                            {copy.title}
                        </h1>
                        <p className="mt-7 max-w-xl text-base leading-8 text-[#52617b] sm:text-lg">
                            {copy.description}
                        </p>

                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href="/auth/login"
                                className="group inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#2446d8] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(36,70,216,0.2)] transition-colors hover:bg-[#1e3bb8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2446d8] focus-visible:ring-offset-2"
                            >
                                {copy.primaryAction}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                            <Link
                                href="/docs/workflows"
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#cbd2df] bg-white/75 px-5 text-sm font-semibold text-[#27354e] shadow-sm transition-colors hover:border-[#9aa8c0] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2446d8] focus-visible:ring-offset-2"
                            >
                                <Workflow className="h-4 w-4" />
                                {copy.secondaryAction}
                            </Link>
                        </div>
                    </div>

                    <div className="relative">
                        <div
                            aria-hidden="true"
                            className="absolute -inset-3 rounded-[1.15rem] border border-[#bfc9e5] bg-[#dce3fb]/45"
                        />
                        <div className="relative overflow-hidden rounded-xl border border-[#cbd2df] bg-[#fcfcfd] shadow-[0_24px_70px_rgba(34,49,78,0.14)]">
                            <div className="flex items-center justify-between border-b border-[#d8dce5] bg-[#f7f8fb] px-5 py-3">
                                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5d6b84]">
                                    <span className="h-2 w-2 rounded-full bg-[#0c9b78]" />
                                    {copy.sheetLabel}
                                </div>
                                <BookOpen className="h-4 w-4 text-[#60708b]" aria-hidden="true" />
                            </div>

                            <div className="grid divide-y divide-[#e0e4eb] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                                <article className="p-5 sm:p-6">
                                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687891]">
                                        {copy.sourceLabel}
                                    </p>
                                    <p className="mt-4 text-[15px] leading-7 text-[#202b40]">
                                        {copy.sourceText}
                                    </p>
                                    <div className="mt-7 flex items-center gap-2 text-xs text-[#70809b]">
                                        <span className="h-px flex-1 bg-[#d8dce5]" />
                                        {copy.segmentLabel}
                                    </div>
                                </article>

                                <article className="bg-[#f8faff] p-5 sm:p-6">
                                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#687891]">
                                        {copy.targetLabel}
                                    </p>
                                    <p className="mt-4 text-[15px] leading-7 text-[#202b40]">
                                        {copy.targetText}
                                    </p>
                                    <div className="mt-7 flex items-center gap-2 text-xs font-medium text-[#2446d8]">
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        {copy.reviewedLabel}
                                    </div>
                                </article>
                            </div>

                            <div className="border-t border-[#d8dce5] bg-[#fafbfc] p-5 sm:p-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b8064]">
                                            {copy.matchLabel}
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-[#34425b]">
                                            {copy.matchDetail}
                                        </p>
                                    </div>
                                    <span className="w-fit rounded-full border border-[#a8d9cd] bg-[#e8f7f2] px-2.5 py-1 text-[11px] font-semibold text-[#08745b]">
                                        {copy.traceableLabel}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid border-t border-[#d8dce5] py-7 sm:grid-cols-3">
                    {copy.evidence.map((item, index) => (
                        <article
                            key={item.title}
                            className="border-[#d8dce5] py-5 first:pt-0 last:pb-0 sm:px-7 sm:py-0 sm:first:pl-0 sm:last:pr-0 sm:[&:not(:first-child)]:border-l"
                        >
                            <div className="flex items-center gap-2 text-[#2446d8]">
                                <EvidenceIcon index={index} />
                                <span className="text-sm font-semibold text-[#27354e]">
                                    {item.title}
                                </span>
                            </div>
                            <p className="mt-2 max-w-sm text-sm leading-6 text-[#66748a]">
                                {item.description}
                            </p>
                        </article>
                    ))}
                </section>

                <footer className="flex flex-col gap-2 border-t border-[#d8dce5] py-5 text-xs text-[#77849a] sm:flex-row sm:items-center sm:justify-between">
                    <span>{copy.footer}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                        {copy.footerTagline}
                    </span>
                </footer>
            </div>
        </main>
    );
}
