export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const email = formData.get('email') as string;
  if (!email) return NextResponse.json({ error: '缺少邮箱' }, { status: 400 });
  // 交给 NextAuth 的 email provider 发送邮件
  await signIn('email', { email, redirectTo: '/' } as any);
  return NextResponse.redirect(new URL('/auth/login?sent=1', req.url));
}


