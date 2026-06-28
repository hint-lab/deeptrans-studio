// middleware.ts
import { createLogger } from '@/lib/logger';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function appUrl(path: string, requestUrl: string) {
    return new URL(path, process.env.NEXTAUTH_URL || requestUrl);
}

function callbackPath(requestUrl: URL) {
    const params = new URLSearchParams(requestUrl.search);
    params.delete('callbackUrl');
    const search = params.toString();
    return `${requestUrl.pathname}${search ? `?${search}` : ''}`;
}

async function readAuthToken(request: NextRequest) {
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    return (
        (await getToken({
            req: request,
            secret,
            cookieName: '__Secure-authjs.session-token',
            secureCookie: true,
        })) ||
        (await getToken({
            req: request,
            secret,
            cookieName: 'authjs.session-token',
            secureCookie: false,
        }))
    );
}

export async function middleware(request: NextRequest) {
    // --- 1. 日志记录设置 ---
    const logger = createLogger({
        type: 'middleware:auth',
        method: request.method,
        path: request.nextUrl.pathname,
        ip: request.headers.get('x-forwarded-for') ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
        referer: request.headers.get('referer') ?? undefined,
    }, {
        json: false,// 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    });
    const token = await readAuthToken(request);
    const { pathname } = request.nextUrl;

    // 公共路径（无需认证，用于精确匹配）
    const publicPaths = [
        '/',
        '/docs',
        '/api/auth/verify-email',
        '/api/auth/send-email',
        '/api/auth/register',
    ];
    // 认证相关路径（NextAuth 内部处理，但需要逻辑来处理重定向）
    const authPaths = ['/auth/login', '/auth/register', '/auth/error'];

    try {
        // 1. 精确匹配公共路径，直接通过
        if (publicPaths.includes(pathname)) {
            return NextResponse.next();
        }

        // 2. 已登录用户尝试访问登录/注册页，重定向到仪表板
        if (token && authPaths.includes(pathname)) {
            logger.warn('已登录用户访问认证页，重定向到仪表板');
            return NextResponse.redirect(appUrl('/dashboard', request.url));
        }

        // 3. 未登录用户检查
        if (!token) {
            // 如果访问的是认证相关路径，放行（让 NextAuth 页面显示）
            if (authPaths.includes(pathname)) {
                return NextResponse.next();
            }

            // 访问其他任何路径，重定向到登录页
            logger.error('访问保护路由，但会话缺失或无效');
            const loginUrl = appUrl('/auth/login', request.url);
            loginUrl.searchParams.set('callbackUrl', callbackPath(request.nextUrl));
            return NextResponse.redirect(loginUrl);
        }

        // 4. 会话过期检查（仅作为辅助，NextAuth 应该在客户端或服务器端处理）
        if (token.expires && Date.now() / 1000 > Number(token.expires)) {
            logger.error('会话已过期');
            return NextResponse.redirect(appUrl('/auth/login', request.url));
        }

        // 5. 有效会话，通过
        logger.debug('Authenticated request', { userId: token.sub });
        return NextResponse.next();
    } catch (error) {
        logger.error({ message: 'Middleware error', error });
        return NextResponse.redirect(appUrl('/auth/login', request.url));
    }
}

export const config = {
    // 运行在所有路径上，除了：
    // _next/static, _next/image (Next.js 内部)
    // 静态文件 (favicon.ico, .png, .svg, etc.)
    // /api/public (公共API)
    // /api/auth (NextAuth 认证API)
    matcher: [
        '/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.ico|.*\\.svg|.*\\.jpg|api/public|api/auth).*)',
    ],
};
