import { createLogger } from '@/lib/logger';
import { PrismaClient } from '@prisma/client';
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
const prisma = new PrismaClient();

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name } = body;

        if (!email || !password) {
            return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 });
        }

        // 检查用户是否已存在
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 });
        }

        // 密码加密
        const hashedPassword = await hash(password, 12);

        // 创建新用户
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: name || email.split('@')[0],
            },
        });

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        logger.error('注册失败:', error);
        return NextResponse.json({ error: '注册失败' }, { status: 500 });
    }
}
