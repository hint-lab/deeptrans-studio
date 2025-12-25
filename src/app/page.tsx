import Link from 'next/link';
import type { NextPage } from 'next';
import LocaleSwitcher from '@/components/locale-switcher';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

function HomeContent({ year }: { year: number }) {
    const t = useTranslations('Home');
    return (
        <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f1020] via-[#11122a] to-[#0b0c1a] text-white">
            {/* 语言切换器 */}
            <div className="fixed right-4 top-4 z-50">
                <LocaleSwitcher variant="dark-bg" />
            </div>

            {/* 背景装饰 - 渐变光晕 */}
            <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/40 via-purple-500/10 to-transparent blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/30 via-blue-400/10 to-transparent blur-3xl" />

            {/* 背景装饰 - 网格细线 */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
            <div className="container relative z-10 flex flex-col items-center justify-center gap-12 px-4 py-16">
                <div className="flex flex-col gap-4 md:gap-8">
                    <h2 className="text-xl font-extrabold tracking-tight sm:text-[3rem]">
                        {t('greeting')}
                    </h2>
                </div>
                <h1 className="gradient-text text-5xl font-extrabold tracking-tight sm:text-[5rem]">
                    DeepTrans <span className="text-[hsl(218, 91.80%, 66.50%)]"> Studio</span>
                </h1>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
                    <Link
                        className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
                        href="./auth/login"
                    >
                        <h3 className="text-2xl font-bold">{t('start')}</h3>
                        <div className="text-lg">{t('start_desc')}</div>
                        <div className="flex flex-row-reverse text-lg">
                            <ArrowRight size={16} />
                        </div>
                    </Link>
                    <Link
                        className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
                        href="./docs"
                    >
                        <h3 className="text-2xl font-bold">{t('docs')}</h3>
                        <div className="text-lg">{t('docs_desc')}</div>
                        <div className="flex flex-row-reverse text-lg">
                            <ArrowRight size={16} />
                        </div>
                    </Link>
                </div>
                <div className="flex flex-col items-center gap-2" />
            </div>
            <footer className="fixed bottom-0 z-10 w-full py-2 text-center text-sm text-white/70">
                {t('copyright', { year })}
                <br />
            </footer>
        </main>
    );
}

const Home: NextPage = async () => {
    const year = new Date().getFullYear();
    return <HomeContent year={year} />;
};
export default Home;
