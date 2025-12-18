import { NextRequest, NextResponse } from 'next/server';
import { createEmailVerificationCode } from '@/db/verificationCode';
import { sendVerificationEmail } from '@/lib/mail';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const form = await request.formData();
        const mode = String(form.get('mode') || 'email');
        const email = String(form.get('email'));
        if (!mode) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        const isDev = process.env.NODE_ENV === 'development';
        const code = isDev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
        console.log(`Generated verification code for ${email}: ${code}`);

        // 存储验证码
        const r = await createEmailVerificationCode(email, code);
        if (!r.success) {
            return NextResponse.json(
                { error: r.error || 'Failed to create verification code' },
                { status: 500 }
            );
        }

        // 返回发送结果
        console.log('send code store in redis:', r);
        const info = await sendVerificationEmail(email, code);
        console.log('Email sent:', info);
        if (!info || !info.accepted || info.accepted.length === 0) {
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
        }
        // 返回发送结果
        console.log('Email sent successfully:', info);

        return NextResponse.json({
            success: true,
            messageId: (info as any)?.messageId,
            accepted: (info as any)?.accepted,
            rejected: (info as any)?.rejected,
            response: (info as any)?.response,
        });
    } catch (e: any) {
        // 返回更详细的错误，便于你在前端或终端看到具体原因
        console.error('Error in send-email route:', e?.stack || e);
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
    }
}
