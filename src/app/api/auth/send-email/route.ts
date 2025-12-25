import { createEmailVerificationCode } from '@/db/verificationCode';
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
        const mode = String(form.get('mode') || 'email');
        const email = String(form.get('email'));
        if (!mode) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        const isDev = process.env.NODE_ENV === 'development';
        const code = isDev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
        logger.debug(`Generated verification code for ${email}: ${code}`);

        // 存储验证码
        const r = await createEmailVerificationCode(email, code);
        if (!r.success) {
            return NextResponse.json(
                { error: r.error || 'Failed to create verification code' },
                { status: 500 }
            );
        }

        // 返回发送结果
        logger.debug('send code store in redis:', r);
        const info = await sendVerificationEmail(email, code);
        logger.debug('Email sent:', info);
        if (!info || !info.accepted || info.accepted.length === 0) {
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
        }
        // 返回发送结果
        logger.debug('Email sent successfully:', info);

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
