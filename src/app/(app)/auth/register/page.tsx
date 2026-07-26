import { type Metadata } from 'next';
import { RegisterCard } from './components/register-card';
import LocaleSwitcher from '@/components/locale-switcher';
import { redirect } from 'next/navigation';
import {
    firstSearchParam,
    isDesktopCallback,
    normalizeInternalCallback,
    type SearchParamValue,
} from '@/lib/auth-callback';

export const metadata: Metadata = {
    title: 'Register',
    description: 'Create your account',
};

interface RegisterPageProps {
    searchParams: Promise<Record<string, SearchParamValue>>;
}

const RegisterPage = async ({ searchParams }: RegisterPageProps) => {
    const params = await searchParams;
    const callbackUrl = normalizeInternalCallback(params.callbackUrl);
    const isDesktop = firstSearchParam(params.desktop) === '1' || isDesktopCallback(callbackUrl);

    if (process.env.IS_DEMO === 'yes') {
        redirect(
            isDesktop
                ? `/auth/login?desktop=1&callbackUrl=${encodeURIComponent(callbackUrl)}`
                : '/auth/login'
        );
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f1020] via-[#11122a] to-[#0b0c1a]">
            {/* 语言切换器 */}
            <div className="fixed right-4 top-4 z-50">
                <LocaleSwitcher variant="dark-bg" />
            </div>

            {/* 背景装饰 - 高级发光光晕 */}
            <div
                className="pointer-events-none absolute -left-[10%] -top-[20%] h-[70vh] w-[70vw] animate-pulse rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-indigo-600/20 via-purple-600/5 to-transparent blur-[120px]"
                style={{ animationDuration: '4s' }}
            />
            <div
                className="pointer-events-none absolute -bottom-[20%] -right-[10%] h-[60vh] w-[60vw] animate-pulse rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-fuchsia-600/20 via-violet-600/5 to-transparent blur-[120px]"
                style={{ animationDuration: '5s' }}
            />
            <div
                className="pointer-events-none absolute left-[20%] top-[20%] h-[50vh] w-[50vw] animate-pulse rounded-full bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent blur-[100px]"
                style={{ animationDuration: '6s' }}
            />

            <div className="z-10 flex w-full max-w-[480px] flex-col justify-center py-12 sm:px-8">
                <div className="mx-auto mb-8 flex w-full flex-col items-center justify-center">
                    <img
                        src="/logo_dark.svg"
                        alt="DeepTrans Studio"
                        className="h-auto w-[320px] max-w-full opacity-95"
                    />
                </div>
                <RegisterCard
                    callbackUrl={callbackUrl}
                    initialEmail={firstSearchParam(params.email) || ''}
                    isDesktop={isDesktop}
                />
            </div>
        </div>
    );
};
export default RegisterPage;
