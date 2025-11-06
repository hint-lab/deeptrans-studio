import { NextRequest, NextResponse } from "next/server";
import { createEmailVerificationCode } from "@/db/verificationCode";
import { sendVerificationEmail } from "@/lib/mail";

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    const isDev = process.env.NODE_ENV === 'development';
    const code = isDev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    await createEmailVerificationCode(email, code);
    if (isDev) {
      // 开发环境：不发送邮件，直接返回固定验证码
      return NextResponse.json({ success: true, dev: true, code });
    }
    const info = await sendVerificationEmail(email, code);
    return NextResponse.json({ 
      success: true, 
      messageId: (info as any)?.messageId, 
      accepted: (info as any)?.accepted, 
      rejected: (info as any)?.rejected, 
      response: (info as any)?.response });
  } catch (e: any) {
    // 返回更详细的错误，便于你在前端或终端看到具体原因
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}


