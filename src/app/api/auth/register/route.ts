import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { ensureUserTenant } from '@/lib/user-tenant';
import { getVerificationCodeByEmail } from '@/db/verificationCode';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
const logger = createLogger({
    type: 'auth:register',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function POST(request: Request) {
    try {
        if (process.env.IS_DEMO === 'yes') {
            return NextResponse.json({ error: '演示模式不开放注册' }, { status: 403 });
        }

        const contentType = request.headers.get('content-type') || '';
        const body = contentType.includes('application/json')
            ? await request.json()
            : Object.fromEntries((await request.formData()).entries());
        const email = String(body.email || '').trim();
        const password = body.password ? String(body.password) : '';
        const name = body.name ? String(body.name).trim() : '';
        const code = body.code ? String(body.code).trim() : '';

        if (!email) {
            return NextResponse.json({ error: '邮箱不能为空' }, { status: 400 });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
        }
        if (!code) {
            return NextResponse.json({ error: '验证码不能为空' }, { status: 400 });
        }

        const record = await getVerificationCodeByEmail(email);
        if (!record || record.code !== code) {
            return NextResponse.json({ error: '邮箱或验证码错误' }, { status: 400 });
        }

        // 检查用户是否已存在
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 });
        }

        const hashedPassword = password ? await hash(password, 12) : null;

        // 创建新用户
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: name || email.split('@')[0],
                emailVerified: new Date(),
            },
        });
        const tenantId = await ensureUserTenant(user.id);

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                tenantId,
            },
        });
    } catch (error) {
        logger.error('注册失败:', error);
        return NextResponse.json({ error: '注册失败' }, { status: 500 });
    }
}
