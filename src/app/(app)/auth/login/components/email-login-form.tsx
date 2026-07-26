'use client';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { emailLoginAction } from '@/actions/email-login';
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons'; // 导入图标组件
import {
    getEmailVerificationFailureCode,
    getEmailVerificationFailureMessage,
    isEmailVerificationSent,
} from '@/lib/email-verification-client';

export function EmailLoginForm({
    buttonText,
    callbackUrl,
}: {
    buttonText?: string;
    callbackUrl?: string;
}) {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [isPending, startTransition] = useTransition();
    const [isSendingCode, setIsSendingCode] = useState(false); // 新增：发送验证码加载状态
    const otpRef = useRef<HTMLInputElement>(null);
    const t = useTranslations('Auth');

    const sendCode = async () => {
        if (!email) {
            toast.error(t('pleaseEnterEmail'));
            return;
        }

        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast.error(t('invalidEmailFormat'));
            return;
        }

        setIsSendingCode(true); // 开始发送，显示加载状态
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
            const form = new FormData();
            form.set('mode', 'email');
            form.set('purpose', 'login');
            form.set('email', email.trim());

            // 添加超时处理
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

            const res = await fetch('/api/auth/send-email', {
                method: 'POST',
                body: form,
                signal: controller.signal,
            });
            const payload: unknown = await res.json().catch(() => null);

            if (res.ok && isEmailVerificationSent(payload)) {
                toast.info(
                    process.env.NODE_ENV === 'development' ? t('codeSentDev') : t('codeSent')
                );
                otpRef.current?.focus();
                setCooldown(60);
                const timer = setInterval(() => {
                    setCooldown(s => {
                        if (s <= 1) {
                            clearInterval(timer);
                            return 0;
                        }
                        return s - 1;
                    });
                }, 1000);
            } else {
                const failureCode = getEmailVerificationFailureCode(payload);
                if (res.status === 404 && failureCode === 'USER_NOT_FOUND') {
                    const params = new URLSearchParams({ email: email.trim() });
                    if (callbackUrl) params.set('callbackUrl', callbackUrl);
                    if (callbackUrl?.includes('desktop=1')) params.set('desktop', '1');
                    window.location.assign(`/auth/register?${params.toString()}`);
                    return;
                }
                toast.error(getEmailVerificationFailureMessage(payload, t('sendFailed')));
            }
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                toast.error(t('requestTimeout'));
            } else {
                toast.error(t('sendFailed'));
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            setIsSendingCode(false); // 结束发送，隐藏加载状态
        }
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const result = await emailLoginAction({ email, code }, callbackUrl || null);
            if (result?.error) {
                toast.error(t('loginFailed', { error: result.error }));
            }
            if (result?.success) toast.success(t('loginSuccess'));
        });
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="flex flex-col justify-center gap-2 space-y-4">
                {/* 邮箱 */}
                <div>
                    <div className="mb-1 text-sm">{t('email')}</div>
                    <div className="flex items-center justify-start rounded-full border border-muted p-1 hover:border hover:border-primary">
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
                            disabled={isSendingCode} // 发送时禁用邮箱输入
                            className="mx-6 w-full border-none bg-transparent p-1 outline-none hover:border-none hover:ring-0 focus-visible:border-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                </div>

                {/* 验证码 */}
                <div>
                    <div className="mb-1 text-sm">{t('verificationCode')}</div>
                    <div className="flex items-center justify-center space-x-4 rounded-full border border-muted p-1 hover:border hover:border-primary">
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
                            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            required
                            disabled={isSendingCode} // 发送时禁用验证码输入
                            className="mx-6 w-full border-none bg-transparent p-1 shadow-none outline-none hover:border-none hover:ring-0 focus-visible:border-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={sendCode}
                            disabled={cooldown > 0 || isSendingCode || !email}
                            className="mr-2 min-w-[100px] text-primary transition-all duration-300"
                        >
                            {isSendingCode ? (
                                <div className="flex items-center gap-2">
                                    <Icons.spinner className="h-4 w-4 animate-spin" />
                                    <span>{t('sending')}</span>
                                </div>
                            ) : cooldown > 0 ? (
                                <div className="flex items-center gap-2">
                                    <span>{t('retryAfter', { seconds: cooldown })}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span>{t('getCode')}</span>
                                </div>
                            )}
                        </Button>
                    </div>
                </div>

                {/* 提交按钮 */}
                <div className="space-y-4 pb-2">
                    <Button
                        type="submit"
                        variant="default"
                        className="w-full transition delay-150 duration-300"
                        disabled={isPending || isSendingCode || !email || code.length !== 6}
                    >
                        {isPending ? (
                            <div className="flex items-center gap-2">
                                <Icons.spinner className="h-4 w-4 animate-spin" />
                                <span>{t('loggingIn')}</span>
                            </div>
                        ) : (
                            buttonText || t('login')
                        )}
                    </Button>
                </div>
            </div>
        </form>
    );
}
