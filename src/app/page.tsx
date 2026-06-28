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

            {/* 背景装饰 - 高级发光光晕 */}
            <div className="pointer-events-none absolute -top-[20%] -left-[10%] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-indigo-600/20 via-purple-600/5 to-transparent blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="pointer-events-none absolute -bottom-[20%] -right-[10%] h-[60vh] w-[60vw] rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-fuchsia-600/20 via-violet-600/5 to-transparent blur-[120px] animate-pulse" style={{ animationDuration: '5s' }} />
            <div className="pointer-events-none absolute top-[20%] left-[20%] h-[50vh] w-[50vw] rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />
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
