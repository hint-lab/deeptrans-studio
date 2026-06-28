import { type Metadata } from 'next';
import { LoginCard } from './components/login-card';
import type { NextPage } from 'next';
import Image from 'next/image';
import LocaleSwitcher from '@/components/locale-switcher';

export const metadata: Metadata = {
    title: 'Login',
    description: 'Login to access our application',
};

const LoginPage: NextPage = () => {
    const isDemo = process.env.IS_DEMO === 'yes';
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f1020] via-[#11122a] to-[#0b0c1a]">
            {/* 语言切换器 */}
            <div className="fixed right-4 top-4 z-50">
                <LocaleSwitcher variant="dark-bg" />
            </div>

            {/* 背景装饰 - 高级发光光晕 */}
            <div className="pointer-events-none absolute -top-[20%] -left-[10%] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-indigo-600/20 via-purple-600/5 to-transparent blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="pointer-events-none absolute -bottom-[20%] -right-[10%] h-[60vh] w-[60vw] rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-fuchsia-600/20 via-violet-600/5 to-transparent blur-[120px] animate-pulse" style={{ animationDuration: '5s' }} />
            <div className="pointer-events-none absolute top-[20%] left-[20%] h-[50vh] w-[50vw] rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />

            <div className="z-10 flex w-full max-w-[480px] flex-col justify-center py-12 sm:px-8">
                <div className="mx-auto mb-8 flex w-full flex-col items-center justify-center">
                    <Image
                        src="/logo_dark.svg"
                        alt="DeepTrans Studio"
                        width={320}
                        height={56}
                        className="opacity-95"
                        priority
                    />
                </div>
                <LoginCard isDemo={isDemo} />
            </div>
        </div>
    );
};
export default LoginPage;
