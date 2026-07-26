'use client';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { emailLoginAction } from '@/actions/email-login';
import { Icons } from '@/components/icons';
import {
    getEmailVerificationFailureCode,
    getEmailVerificationFailureMessage,
    isEmailRegistrationCompleted,
    isEmailVerificationSent,
} from '@/lib/email-verification-client';

interface RegisterCardProps {
    callbackUrl: string;
    initialEmail: string;
    isDesktop: boolean;
}

export const RegisterCard = ({ callbackUrl, initialEmail, isDesktop }: RegisterCardProps) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [isPending, startTransition] = useTransition();
    const [isSendingCode, setIsSendingCode] = useState(false);
    const otpRef = useRef<HTMLInputElement>(null);
    const t = useTranslations('Auth');
    const loginParams = new URLSearchParams({ callbackUrl });
    if (isDesktop) loginParams.set('desktop', '1');
    const loginHref = `/auth/login?${loginParams.toString()}`;

    const sendCode = async () => {
        if (!email) {
            toast.error(t('pleaseEnterEmail'));
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast.error(t('invalidEmailFormat'));
            return;
        }
        setIsSendingCode(true);
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            const form = new FormData();
            form.set('mode', 'email');
            form.set('purpose', 'register');
            form.set('email', email.trim());
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 10000);
            const r = await fetch('/api/auth/send-email', {
                method: 'POST',
                body: form,
                signal: controller.signal,
            });
            const payload: unknown = await r.json().catch(() => null);
            if (!r.ok || !isEmailVerificationSent(payload)) {
                const failureCode = getEmailVerificationFailureCode(payload);
                if (r.status === 409 && failureCode === 'USER_ALREADY_EXISTS') {
                    const params = new URLSearchParams({ callbackUrl });
                    if (isDesktop) params.set('desktop', '1');
                    window.location.assign(`/auth/login?${params.toString()}`);
                    return;
                }
                toast.error(getEmailVerificationFailureMessage(payload, t('sendFailed')));
                return;
            }
            toast.info(process.env.NODE_ENV === 'development' ? t('codeSentDev') : t('codeSent'));
            otpRef.current?.focus();
            setCooldown(60);
            const timer = setInterval(
                () =>
                    setCooldown(s => {
                        if (s <= 1) {
                            clearInterval(timer);
                            return 0;
                        }
                        return s - 1;
                    }),
                1000
            );
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                toast.error(t('requestTimeout'));
            } else {
                toast.error(t('sendFailed'));
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            setIsSendingCode(false);
        }
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            try {
                if (!email || !code) {
                    toast.error(t('pleaseEnterEmail'));
                    return;
                }
                const form = new FormData();
                form.set('mode', 'email');
                form.set('name', name.trim());
                form.set('email', email.trim());
                form.set('code', code.trim());
                const r = await fetch('/api/auth/register', { method: 'POST', body: form });
                const payload: unknown = await r.json().catch(() => null);
                if (!r.ok || !isEmailRegistrationCompleted(payload)) {
                    toast.error(getEmailVerificationFailureMessage(payload, t('registerFailed')));
                    return;
                }
                toast.success(t('registerSuccess'));
                const result = await emailLoginAction(
                    { email: email.trim(), code: code.trim() },
                    callbackUrl
                );
                if (result?.error) toast.error(t('loginFailed', { error: result.error }));
            } catch (error: unknown) {
                const redirectError = error as { message?: unknown; digest?: unknown };
                if (
                    redirectError?.message === 'NEXT_REDIRECT' ||
                    (typeof redirectError?.digest === 'string' &&
                        redirectError.digest.includes('NEXT_REDIRECT'))
                ) {
                    throw error;
                }
                toast.error(t('registerFailed'));
            }
        });
    };

    return (
        <Card className="w-full border-none">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-center gap-2 text-center text-2xl">
                    {t('register')}
                    {isDesktop ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {t('desktopEdition')}
                        </span>
                    ) : null}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <div className="mb-1 text-sm">{t('nickname')}</div>
                        <input
                            className="w-full rounded-full border bg-transparent px-4 py-2"
                            placeholder={t('enterNickname')}
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>
                    <div>
                        <div className="mb-1 text-sm">{t('email')}</div>
                        <div className="flex items-center justify-start rounded-full border border-muted p-1 hover:border-primary">
                            <input
                                id="email"
                                placeholder={t('enterEmail')}
                                type="email"
                                autoCapitalize="none"
                                autoComplete="email"
                                autoCorrect="off"
                                inputMode="email"
                                spellCheck={false}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                disabled={isSendingCode || isPending}
                                className="mx-6 w-full border-none bg-transparent p-1 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 text-sm">{t('verificationCode')}</div>
                        <div className="flex items-center justify-center space-x-4 rounded-full border border-muted p-1 hover:border-primary">
                            <input
                                ref={otpRef}
                                id="otp"
                                placeholder={t('enterCode')}
                                type="text"
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                maxLength={6}
                                pattern="[0-9]{6}"
                                value={code}
                                onChange={e =>
                                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                }
                                required
                                disabled={isSendingCode || isPending}
                                className="mx-6 w-full border-none bg-transparent p-1 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                onClick={sendCode}
                                disabled={cooldown > 0 || isSendingCode || isPending || !email}
                                className="mr-2 min-w-[100px] text-primary"
                            >
                                {isSendingCode ? (
                                    <div className="flex items-center gap-2">
                                        <Icons.spinner className="h-4 w-4 animate-spin" />
                                        <span>{t('sending')}</span>
                                    </div>
                                ) : cooldown > 0 ? (
                                    t('retryAfter', { seconds: cooldown })
                                ) : (
                                    t('getCode')
                                )}
                            </Button>
                        </div>
                    </div>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isPending || isSendingCode || !email || code.length !== 6}
                    >
                        {isPending ? t('loggingIn') : t('registerAndLogin')}
                    </Button>
                    <div className="text-center text-sm text-muted-foreground">
                        {t('hasAccount')}{' '}
                        <a className="underline" href={loginHref}>
                            {t('goLogin')}
                        </a>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};
