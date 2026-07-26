'use client';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { EmailLoginForm } from './email-login-form';
import { useTranslations } from 'next-intl';
interface LoginCardProps {
    callbackUrl: string;
    isDemo: boolean;
    isDesktop: boolean;
}

export const LoginCard = ({ callbackUrl, isDemo, isDesktop }: LoginCardProps) => {
    const t = useTranslations('Auth');
    const registerParams = new URLSearchParams({ callbackUrl });
    if (isDesktop) registerParams.set('desktop', '1');
    const registerHref = `/auth/register?${registerParams.toString()}`;

    return (
        <Card className="w-full border-none">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-center gap-2 text-center text-2xl">
                    {t('login')}
                    {isDesktop ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {t('desktopEdition')}
                        </span>
                    ) : null}
                </CardTitle>
                {isDesktop ? (
                    <p className="text-center text-sm text-muted-foreground">
                        {t('desktopLoginHint')}
                    </p>
                ) : null}
            </CardHeader>
            <CardContent>
                <EmailLoginForm callbackUrl={callbackUrl} />
                <div className="mt-4 space-y-2 text-center text-sm text-muted-foreground">
                    {isDemo ? <div>{t('demoAccount')}: test@example.com / 123456</div> : null}
                    {isDemo ? null : (
                        <div>
                            {t('noAccount')}{' '}
                            <a className="underline" href={registerHref}>
                                {t('goRegister')}
                            </a>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
