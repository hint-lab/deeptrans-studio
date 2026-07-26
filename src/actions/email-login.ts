'use server';
import { signIn } from '@/auth';
import { DEFAULT_LOGIN_REDIRECT } from '@/routes';
import { findUserByNormalizedEmailDB } from '@/db/user';
import { normalizeEmailForVerification } from '@/db/verificationCode';
import { DEMO_CODE, ensureDemoUser, isDemoAccount } from '@/lib/demo-user';
import { normalizeInternalCallback } from '@/lib/auth-callback';

export const emailLoginAction = async (
    values: { email: string; code: string },
    callbackUrl?: string | null
) => {
    const email = normalizeEmailForVerification(values?.email || '');
    const code = values?.code?.trim();
    if (!email || !code) return { error: '邮箱或验证码缺失' };

    if (isDemoAccount(email)) {
        if (code !== DEMO_CODE) {
            return { error: '验证码错误' };
        }
        await ensureDemoUser();
    } else if (process.env.IS_DEMO === 'yes') {
        return { error: '演示环境仅允许使用测试账号登录' };
    } else {
        const existingUser = await findUserByNormalizedEmailDB(email);
        if (!existingUser) {
            return { error: '账号不存在' };
        }
    }

    try {
        await signIn('credentials', {
            email,
            code,
            redirectTo: normalizeInternalCallback(callbackUrl, DEFAULT_LOGIN_REDIRECT),
        });
    } catch (error: any) {
        if (error?.message === 'NEXT_REDIRECT' || error?.digest?.includes?.('NEXT_REDIRECT')) {
            throw error;
        }
        return { error: '登录失败，请重试' };
    }

    return { success: '登录成功' };
};
