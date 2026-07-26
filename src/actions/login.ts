'use server';
import { signIn } from '@/auth';
import type z from 'zod';
import { LoginSchema } from '@/schemes';
import { findUserByEmailDB, createUserDB, updateUserByIdDB } from '@/db/user';
import { DEFAULT_LOGIN_REDIRECT } from '@/routes';
import { getVerificationCodeByPhone } from '@/db/verificationCode';
import { DEMO_CODE, ensureDemoUser, isDemoAccount } from '@/lib/demo-user';
// 注意：不再直接使用 redirect，这里交给 signIn 的 redirectTo 处理

/**
 * 处理用户登录的服务器端函数
 * @param values - 登录表单提交的数据
 * @param callbackUrl - 登录成功后重定向的URL（可选）
 * @returns 包含操作结果的对象
 */
export const login = async (values: z.infer<typeof LoginSchema>, callbackUrl?: string | null) => {
    // 验证提交的表单数据
    const validatedFields = LoginSchema.safeParse(values);

    if (!validatedFields.success) {
        return { error: 'Invalid fields!' };
    }

    const { phone, code } = validatedFields.data;

    // This legacy action is not the normal email-login path, but it remains a
    // callable server action. Never let a generic development environment turn
    // the fixed demo code into a bypass for an arbitrary account.
    if (isDemoAccount(phone)) {
        if (code !== DEMO_CODE) return { error: '验证码错误' };

        await ensureDemoUser();
        try {
            await signIn('credentials', {
                email: phone,
                code,
                redirectTo: callbackUrl || DEFAULT_LOGIN_REDIRECT,
            });
        } catch (error: any) {
            if (error?.message === 'NEXT_REDIRECT' || error?.digest?.includes?.('NEXT_REDIRECT')) {
                throw error;
            }
            return { error: '登录失败，请重试' };
        }

        return { success: '登录成功' };
    }

    if (process.env.IS_DEMO === 'yes') {
        return { error: '演示环境仅允许使用测试账号登录' };
    }

    // 根据邮箱号获取用户信息
    let existingUser = await findUserByEmailDB(phone);
    // 用户不存在时自动创建新账户
    if (!existingUser?.email) {
        const newUser = await createUserDB({ email: phone });
        if (!newUser?.id) {
            return { error: '创建用户失败，请稍后重试' };
        }
        existingUser = newUser;
    }

    // The non-demo legacy path still requires a persisted verification code.
    const verificationCode = await getVerificationCodeByPhone(phone);

    if (!verificationCode || verificationCode.code !== code) {
        return { error: '验证码错误' };
    }

    // 验证码正确，标记邮箱号已验证
    await updateUserByIdDB(existingUser.id, { emailVerified: new Date() });

    try {
        await signIn('credentials', {
            phone,
            code,
            redirectTo: callbackUrl || DEFAULT_LOGIN_REDIRECT,
        });
    } catch (error: any) {
        if (error?.message === 'NEXT_REDIRECT' || error?.digest?.includes?.('NEXT_REDIRECT')) {
            throw error; // 放行重定向
        }
        return { error: '登录失败，请重试' };
    }

    // 返回成功，用于前端兜底跳转；正常情况下 signIn 已完成重定向
    return { success: '登录成功' };
};
