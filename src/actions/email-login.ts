'use server';
import { signIn } from '@/auth';
import { DEFAULT_LOGIN_REDIRECT } from '@/routes';
import { findUserByEmailDB, updateUserByIdDB } from '@/db/user';
import { getVerificationCodeByEmail } from '@/db/verificationCode';
import { DEMO_CODE, DEMO_EMAIL, ensureDemoUser } from '@/lib/demo-user';

export const emailLoginAction = async (
    values: { email: string; code: string },
    callbackUrl?: string | null
) => {
    const email = values?.email?.trim();
    const code = values?.code?.trim();
    if (!email || !code) return { error: '邮箱或验证码缺失' };

    if (process.env.IS_DEMO === 'yes') {
        if (code !== DEMO_CODE || email !== DEMO_EMAIL) {
            return { error: `演示环境仅允许使用 ${DEMO_EMAIL} / ${DEMO_CODE} 登录` };
        }
        await ensureDemoUser();
    } else {
        const existingUser = await findUserByEmailDB(email);
        if (!existingUser) {
            return { error: '账号不存在' };
        }
        const record = await getVerificationCodeByEmail(email);
        if (!record || record.code !== code) return { error: '邮箱或验证码错误' };
        await updateUserByIdDB(existingUser.id, { emailVerified: new Date() });
    }

    try {
        await signIn('credentials', {
            email,
            code,
            redirectTo: callbackUrl || DEFAULT_LOGIN_REDIRECT,
        });
    } catch (error: any) {
        if (error?.message === 'NEXT_REDIRECT' || error?.digest?.includes?.('NEXT_REDIRECT')) {
            throw error;
        }
        return { error: '登录失败，请重试' + error };
    }

    return { success: '登录成功' };
};
