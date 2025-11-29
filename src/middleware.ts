// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 简单的基于 session token 的认证检查，不涉及数据库查询
export function middleware(request: NextRequest) {
    // 检查是否存在 NextAuth session token
    const sessionToken =
    request.cookies.get("authjs.session-token")?.value || // ✅ 实际名称
    request.cookies.get("__Secure-authjs.session-token")?.value; // 如果你启用了 secure

    const { pathname } = request.nextUrl;

    // 需要保护的路由
    const protectedPaths = [
        "/dashboard",
        "/ide",
        "/projects", 
        "/profile",
        "/settings",
        "/api/protected" // 如果有需要保护的 API 路由
    ];
    const isProtected = protectedPaths.some(path => pathname.startsWith(path));

    // 公共路径（无需认证）
    const publicPaths = [
        "/",
        "/auth/login",
        "/auth/register", 
        "/auth/error",
        "/api/auth",
        "/api/public"
    ];
    const isPublic = publicPaths.some(path => pathname.startsWith(path));

    // 如果访问保护路径但没有 session token，重定向到登录页
    if (isProtected && !sessionToken) {
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("callbackUrl", encodeURI(request.url));
        return NextResponse.redirect(loginUrl);
    }

    // 如果已登录但访问登录页，重定向到仪表板
    if (sessionToken && pathname.startsWith("/auth/login")) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // 保护的路由
        "/dashboard",
        "/dashboard/:path*",
        "/projects/:path*",
        "/profile/:path*",
        "/settings/:path*",
        "/ide",
        "/ide/:path*",
        // 认证相关路由
        "/auth/login",
        "/auth/register",
    ],
};