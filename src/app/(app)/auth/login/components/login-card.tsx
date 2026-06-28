'use client';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { EmailLoginForm } from './email-login-form';
import { useTranslations } from 'next-intl';
interface LoginCardProps {
    isDemo: boolean;
}

export const LoginCard = ({ isDemo }: LoginCardProps) => {
    const t = useTranslations('Auth');

    return (
        <Card className="w-full border-none">
            <CardHeader>
                <CardTitle className="text-center text-2xl">{t('login')}</CardTitle>
            </CardHeader>
            <CardContent>
                <EmailLoginForm />
                <div className="mt-4 text-center text-sm text-muted-foreground">
                    {isDemo ? (
                        <>{t('demoAccount')}: test@example.com / 123456</>
                    ) : (
                        <>
                            {t('noAccount')}{' '}
                            <a className="underline" href="/auth/register">
                                {t('goRegister')}
                            </a>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
