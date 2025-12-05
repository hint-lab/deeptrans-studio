// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createRequestLogger} from '@/lib/logger';
import { auth } from "@/auth"

export async function middleware(request: NextRequest) {
    const url = request.nextUrl
    const searchParams = url.searchParams
    const rscParam = searchParams.get('_rsc')
    
    // --- 1. 日志记录设置 ---
    const requestId = request.headers.get('x-request-id') || rscParam || 'nonce-' + Math.random().toString(36).substring(2, 15);
    
    const logger = createRequestLogger(requestId, {
      method: request.method,
      path: request.nextUrl.pathname,
      ip: request.headers.get('x-forwarded-for')?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      referer: request.headers.get('referer') ?? undefined,
    });
    
    // 记录 Action Body (保持不变)
    if (request.method === 'POST' && request.headers.get('next-action')) {
      const cloned = request.clone();
      try {
        const body = await cloned.text();
        const parsed = JSON.parse(body);
        logger.info('解析后的Action Body参数:', parsed);
      } catch (e) {
        // 可能是 FormData 或其他非 JSON body，仅记录错误
        logger.error({ message: 'Action Body解析失败', error: e });
      }
    }
 
    logger.info('Request started');
    
    // --- 2. 认证检查 ---
    const session = await auth()
    const { pathname } = request.nextUrl;

    // 公共路径（无需认证，用于精确匹配）
    const publicPaths = [
        "/",
        "/docs",
    ];
    // 认证相关路径（NextAuth 内部处理，但需要逻辑来处理重定向）
    const authPaths = [
        "/auth/login",
        "/auth/register", 
        "/auth/error",
    ];

    try {
        
        // 1. 精确匹配公共路径，直接通过
        if (publicPaths.includes(pathname)) {
            return NextResponse.next();
        }

        // 2. 已登录用户尝试访问登录/注册页，重定向到仪表板
        if (session && authPaths.includes(pathname)) {
            logger.warn('已登录用户访问认证页，重定向到仪表板');
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }

        // 3. 未登录用户检查
        if (!session || !session.user) {
            // 如果访问的是认证相关路径，放行（让 NextAuth 页面显示）
            if (authPaths.includes(pathname)) {
                return NextResponse.next();
            }
            
            // 访问其他任何路径，重定向到登录页
            logger.error('访问保护路由，但会话缺失或无效');
            const loginUrl = new URL("/auth/login", request.url);
            loginUrl.searchParams.set("callbackUrl", encodeURIComponent(request.url));
            return NextResponse.redirect(loginUrl);
        }

        // 4. 会话过期检查（仅作为辅助，NextAuth 应该在客户端或服务器端处理）
        if (session.expires && new Date(session.expires) < new Date()) {
            logger.error('会话已过期');
            return NextResponse.redirect(new URL("/auth/login", request.url));
        }

        // 5. 有效会话，通过
        logger.info(`会话有效，用户: ${session.user.email ?? 'N/A'}`);
        return NextResponse.next();
        
    } catch (error) {
        logger.error({ message: "Middleware error", error })
        return NextResponse.redirect(new URL("/auth/login", request.url))
    } finally {
        logger.info('Request ended');
    }

}

export const config = {
    // 运行在所有路径上，除了：
    // _next/static, _next/image (Next.js 内部)
    // 静态文件 (favicon.ico, .png, .svg, etc.)
    // /api/public (公共API)
    // /api/auth (NextAuth 认证API)
    matcher: [
        '/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.ico|.*\\.svg|.*\\.jpg|/api/public|/api/auth).*)',
    ],
};