import {
    clearEmailVerificationCodeIfMatches,
    createEmailVerificationCode,
    normalizeEmailForVerification,
    releaseEmailVerificationSend,
    reserveEmailVerificationSend,
} from '@/db/verificationCode';
import { findUserByNormalizedEmailDB } from '@/db/user';
import { ensureDemoUser, isDemoAccount } from '@/lib/demo-user';
import { createLogger } from '@/lib/logger';
import {
    getSafeMailFailure,
    isVerificationRecipientAccepted,
    sendVerificationEmail,
} from '@/lib/mail';
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
const logger = createLogger(
    {
        type: 'api:auth:send-email',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export async function POST(request: NextRequest) {
    try {
        const form = await request.formData();
        const email = normalizeEmailForVerification(String(form.get('email') || ''));
        const purpose = String(form.get('purpose') || 'login');
        if (!email) {
            return NextResponse.json(
                { code: 'EMAIL_REQUIRED', error: '请输入邮箱' },
                { status: 400 }
            );
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { code: 'EMAIL_INVALID', error: '邮箱格式不正确' },
                { status: 400 }
            );
        }

        if (isDemoAccount(email)) {
            await ensureDemoUser();
            logger.info('Demo account verification bypassed');
            return NextResponse.json({
                success: true,
                message: '测试账号使用固定验证码，无需发送邮件',
            });
        }

        if (process.env.IS_DEMO === 'yes') {
            return NextResponse.json(
                {
                    code: 'DEMO_ACCOUNT_ONLY',
                    error: '演示环境仅允许使用测试账号登录',
                },
                { status: 403 }
            );
        }

        const existingUser = await findUserByNormalizedEmailDB(email);
        if (purpose === 'login' && !existingUser) {
            return NextResponse.json(
                {
                    code: 'USER_NOT_FOUND',
                    error: '账号不存在，请先注册',
                    registerUrl: `/auth/register?email=${encodeURIComponent(email)}`,
                },
                { status: 404 }
            );
        }
        if (purpose === 'register' && existingUser) {
            return NextResponse.json(
                {
                    code: 'USER_ALREADY_EXISTS',
                    error: '该邮箱已被注册，请直接登录',
                    loginUrl: '/auth/login',
                },
                { status: 409 }
            );
        }

        const reservation = await reserveEmailVerificationSend(email);
        if (!reservation.allowed) {
            if ('unavailable' in reservation) {
                logger.error('Verification-email cooldown storage unavailable');
                return NextResponse.json(
                    {
                        code: 'EMAIL_CODE_STORAGE_UNAVAILABLE',
                        error: '验证码服务暂不可用，请稍后重试',
                    },
                    { status: 503 }
                );
            }

            return NextResponse.json(
                {
                    code: 'EMAIL_COOLDOWN',
                    error: `验证码已发送，请 ${reservation.retryAfterSeconds} 秒后再试`,
                    retryAfterSeconds: reservation.retryAfterSeconds,
                },
                {
                    status: 429,
                    headers: { 'Retry-After': String(reservation.retryAfterSeconds) },
                }
            );
        }

        let delivered = false;
        let issuedCode: string | undefined;
        let clearIssuedCode = false;
        try {
            const isDev = process.env.NODE_ENV === 'development';
            const code = isDev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));

            // Store the code before sending. If delivery fails, the reservation is
            // released below so the user can retry without waiting for the browser timer.
            const r = await createEmailVerificationCode(email, code);
            if (!r.success) {
                logger.error('Verification-code storage unavailable');
                return NextResponse.json(
                    {
                        code: 'EMAIL_CODE_STORAGE_UNAVAILABLE',
                        error: '验证码服务暂不可用，请稍后重试',
                    },
                    { status: 503 }
                );
            }
            issuedCode = code;

            const info = await sendVerificationEmail(email, code);
            if (!isVerificationRecipientAccepted(info, email)) {
                clearIssuedCode = true;
                logger.error('SMTP did not accept the requested verification recipient');
                return NextResponse.json(
                    { code: 'EMAIL_DELIVERY_UNAVAILABLE', error: '邮件服务暂不可用，请稍后重试。' },
                    { status: 503 }
                );
            }

            logger.info('Verification email sent', {
                acceptedCount: (info as any)?.accepted?.length || 0,
            });

            delivered = true;
            return NextResponse.json({ success: true });
        } catch (error: unknown) {
            const failure = getSafeMailFailure(error);
            // Configuration and authentication failures happen before the SMTP
            // hand-off, so the just-created code cannot have been delivered.
            // Other transport failures may be ambiguous; retain that short-lived
            // code while releasing the resend reservation for a recovery attempt.
            clearIssuedCode = failure.code !== 'EMAIL_DELIVERY_UNAVAILABLE';
            logger.error('Verification email delivery unavailable', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
                failureCode: failure.code,
            });
            return NextResponse.json(failure, { status: 503 });
        } finally {
            // A successful request keeps its server-side resend window. Any failure
            // releases it so a corrected SMTP configuration can be retried immediately.
            if (!delivered) {
                if (clearIssuedCode && issuedCode) {
                    await clearEmailVerificationCodeIfMatches(email, issuedCode);
                }
                await releaseEmailVerificationSend(email);
            }
        }
    } catch (e: any) {
        logger.error('Invalid verification-email request', {
            errorName: e instanceof Error ? e.name : 'UnknownError',
        });
        return NextResponse.json(
            { code: 'EMAIL_REQUEST_FAILED', error: '请求处理失败，请稍后重试' },
            { status: 500 }
        );
    }
}
