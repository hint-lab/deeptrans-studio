import { createEmailVerificationCode } from '@/db/verificationCode';
import { findUserByEmailDB } from '@/db/user';
import { DEMO_CODE, DEMO_EMAIL, ensureDemoUser } from '@/lib/demo-user';
import { createLogger } from '@/lib/logger';
import { sendVerificationEmail } from '@/lib/mail';
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
const logger = createLogger({
    type: 'api:auth:send-email',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function POST(request: NextRequest) {
    try {
        const form = await request.formData();
        const email = String(form.get('email') || '').trim();
        const purpose = String(form.get('purpose') || 'login');
        if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
        }

        if (process.env.IS_DEMO === 'yes') {
            if (email !== DEMO_EMAIL) {
                return NextResponse.json(
                    { error: `演示环境仅允许使用 ${DEMO_EMAIL} / ${DEMO_CODE} 登录` },
                    { status: 403 }
                );
            }
            await ensureDemoUser();
            return NextResponse.json({
                success: true,
                code: DEMO_CODE,
                accepted: [DEMO_EMAIL],
                message: '演示账号使用固定验证码',
            });
        }

        const existingUser = await findUserByEmailDB(email);
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

        const isDev = process.env.NODE_ENV === 'development';
        const code = isDev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));

        // 存储验证码
        const r = await createEmailVerificationCode(email, code);
        if (!r.success) {
            return NextResponse.json(
                { error: r.error || 'Failed to create verification code' },
                { status: 500 }
            );
        }

        // 返回发送结果
        const info = await sendVerificationEmail(email, code);
        if (!info || !info.accepted || info.accepted.length === 0) {
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
        }
        // 返回发送结果
        logger.info('Verification email sent', { acceptedCount: (info as any)?.accepted?.length || 0 });

        return NextResponse.json({
            success: true,
            messageId: (info as any)?.messageId,
            accepted: (info as any)?.accepted,
            rejected: (info as any)?.rejected,
            response: (info as any)?.response,
        });
    } catch (e: any) {
        // 返回更详细的错误，便于你在前端或终端看到具体原因
        logger.error('Error in send-email route:', e?.stack || e);
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
    }
}
