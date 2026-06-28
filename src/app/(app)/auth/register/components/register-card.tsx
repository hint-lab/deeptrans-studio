'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { emailLoginAction } from '@/actions/email-login';
import { Icons } from '@/components/icons';
import { useSearchParams } from 'next/navigation';

export const RegisterCard = () => {
    const searchParams = useSearchParams();
    const [name, setName] = useState('');
    const [email, setEmail] = useState(() => searchParams.get('email') || '');
    const [code, setCode] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [isPending, startTransition] = useTransition();
    const [isSendingCode, setIsSendingCode] = useState(false);
    const t = useTranslations('Auth');

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
        try {
            const form = new FormData();
            form.set('mode', 'email');
            form.set('purpose', 'register');
            form.set('email', email.trim());
            const r = await fetch('/api/auth/send-email', { method: 'POST', body: form });
            if (!r.ok) {
                const errorData = await r.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message || t('sendFailed'));
            }
            toast.info(process.env.NODE_ENV === 'development' ? t('codeSentDev') : t('codeSent'));
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
        } catch (e: any) {
            toast.error((e as Error)?.message || t('sendFailed'));
        } finally {
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
                const j = await r.json().catch(() => ({}));
                if (!r.ok || j?.error) throw new Error((j as any)?.error || t('registerFailed'));
                toast.success(t('registerSuccess'));
                const result = await emailLoginAction({ email: email.trim(), code: code.trim() }, '/dashboard');
                if (result?.error) toast.error(t('loginFailed', { error: result.error }));
            } catch (e: any) {
                toast.error((e as Error)?.message || t('registerFailed'));
            }
        });
    };

    return (
        <Card className="w-full border-none">
            <CardHeader>
                <CardTitle className="text-center text-2xl">{t('register')}</CardTitle>
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
                                id="otp"
                                placeholder={t('enterCode')}
                                type="text"
                                value={code}
                                onChange={e => setCode(e.target.value)}
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
                    <Button type="submit" className="w-full" disabled={isPending || isSendingCode}>
                        {isPending ? t('loggingIn') : t('registerAndLogin')}
                    </Button>
                    <div className="text-center text-sm text-muted-foreground">
                        {t('hasAccount')}{' '}
                        <a className="underline" href="/auth/login">
                            {t('goLogin')}
                        </a>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};
