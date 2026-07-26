import Link from 'next/link';
import LocaleSwitcher from '@/components/locale-switcher';
import { ArrowRight, BookOpen, Workflow } from 'lucide-react';
import { getLocale } from 'next-intl/server';

type Entry = {
    title: string;
    description: string;
    action: string;
    href: string;
    label: string;
};

type LandingCopy = {
    title: string;
    description: string;
    entries: [Entry, Entry];
    footer: string;
};

function copyFor(locale: string, year: number): LandingCopy {
    if (locale === 'en') {
        return {
            title: 'Start your translation work here.',
            description:
                'Open the workbench to continue a project, or read the docs first if you want to get familiar with the system.',
            entries: [
                {
                    title: 'Workbench',
                    description: 'Manage projects, translations, terminology, and review work.',
                    action: 'Open workbench',
                    href: '/auth/login',
                    label: 'WORK',
                },
                {
                    title: 'Documentation',
                    description: 'Find guides, workflow notes, and answers to common questions.',
                    action: 'Read documentation',
                    href: '/docs',
                    label: 'READ',
                },
            ],
            footer: `© ${year} H!NT LAB · SHU`,
        };
    }

    return {
        title: '从这里开始做翻译。',
        description: '进入工作平台继续处理项目；如果想先了解功能，就去看文档。',
        entries: [
            {
                title: '工作平台',
                description: '处理项目、译文、术语和审校工作。',
                action: '进入工作平台',
                href: '/auth/login',
                label: '工作',
            },
            {
                title: '文档入口',
                description: '查看使用说明、工作流程和常见问题。',
                action: '查看文档',
                href: '/docs',
                label: '文档',
            },
        ],
        footer: `© ${year} H!NT LAB · SHU`,
    };
}

export default async function Home() {
    const locale = await getLocale();
    const copy = copyFor(locale, new Date().getFullYear());

    return (
        <main className="min-h-screen overflow-hidden bg-[#edf0f5] text-[#182236]">
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 opacity-60 [background-image:linear-gradient(rgba(92,108,136,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(92,108,136,0.08)_1px,transparent_1px)] [background-size:32px_32px]"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none fixed -left-28 top-24 h-72 w-72 rounded-full bg-[#d8dcff]/65 blur-3xl"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none fixed -bottom-32 right-0 h-80 w-80 rounded-full bg-[#d7e8ec]/70 blur-3xl"
            />

            <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8 lg:px-10">
                <header className="flex items-center justify-between border-b border-[#cfd6e2] py-5 sm:py-6">
                    <Link href="/" className="flex items-center" aria-label="DeepTrans Studio">
                        <img
                            src="/logo.svg"
                            alt="DeepTrans Studio"
                            className="h-auto w-[158px] sm:w-[176px]"
                        />
                    </Link>
                    <div className="rounded-md border border-[#cfd6e2] bg-white/75 shadow-sm backdrop-blur">
                        <LocaleSwitcher />
                    </div>
                </header>

                <section className="flex flex-1 items-center py-14 sm:py-20 lg:py-24">
                    <div className="w-full">
                        <div className="max-w-2xl">
                            <p className="text-xs font-semibold tracking-[0.16em] text-[#5d6880]">
                                DEEPTRANS STUDIO
                            </p>
                            <h1 className="mt-4 max-w-[12ch] text-4xl font-semibold tracking-[-0.055em] text-[#182236] sm:text-5xl lg:text-6xl lg:leading-[1.05]">
                                {copy.title}
                            </h1>
                            <p className="mt-5 max-w-xl text-base leading-8 text-[#536078] sm:text-lg">
                                {copy.description}
                            </p>
                        </div>

                        <div className="mt-11 grid gap-4 md:grid-cols-2 md:gap-5">
                            {copy.entries.map((entry, index) => {
                                const Icon = index === 0 ? Workflow : BookOpen;

                                return (
                                    <Link
                                        key={entry.href}
                                        href={entry.href}
                                        className="group relative flex min-h-64 flex-col overflow-hidden rounded-xl border border-[#c9d1df] bg-[#fbfcfe] p-6 shadow-[0_14px_35px_rgba(36,50,78,0.08)] transition duration-200 hover:-translate-y-1 hover:border-[#8796b7] hover:shadow-[0_20px_45px_rgba(36,50,78,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4064d8] focus-visible:ring-offset-4"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#ccd5ed] bg-[#edf1ff] text-[#405ec2]">
                                                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
                                            </div>
                                            <span className="border-b border-[#c9d1df] pb-1 text-[11px] font-semibold tracking-[0.14em] text-[#6a768d]">
                                                {entry.label}
                                            </span>
                                        </div>

                                        <div className="mt-9">
                                            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[#202b40]">
                                                {entry.title}
                                            </h2>
                                            <p className="mt-3 max-w-sm text-sm leading-6 text-[#5b6880]">
                                                {entry.description}
                                            </p>
                                        </div>

                                        <div className="mt-auto flex items-center gap-2 pt-9 text-sm font-semibold text-[#2d4fc5]">
                                            <span>{entry.action}</span>
                                            <ArrowRight
                                                aria-hidden="true"
                                                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                                            />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <footer className="border-t border-[#cfd6e2] py-5 text-xs text-[#69758b]">
                    {copy.footer}
                </footer>
            </div>
        </main>
    );
}
