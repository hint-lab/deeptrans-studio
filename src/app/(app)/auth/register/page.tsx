import { type Metadata } from 'next';
import type { NextPage } from 'next';
import Image from 'next/image';
import { RegisterCard } from './components/register-card';
import LocaleSwitcher from '@/components/locale-switcher';

export const metadata: Metadata = {
    title: 'Register',
    description: 'Create your account',
};

const RegisterPage: NextPage = () => {
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f1020] via-[#11122a] to-[#0b0c1a]">
            {/* 语言切换器 */}
            <div className="fixed right-4 top-4 z-50">
                <LocaleSwitcher variant="dark-bg" />
            </div>

            <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/40 via-purple-500/10 to-transparent blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/30 via-blue-400/10 to-transparent blur-3xl" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

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
                <RegisterCard />
            </div>
        </div>
    );
};
export default RegisterPage;
