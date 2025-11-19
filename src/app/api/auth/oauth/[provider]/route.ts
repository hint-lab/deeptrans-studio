export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';

export async function GET(req: NextRequest, context: any) {
  const { provider } = context?.params || {};
  if (!provider) return NextResponse.json({ error: '缺少 provider' }, { status: 400 });
  await signIn(provider as any);
  // signIn 会处理重定向；这里返回 204
  return new NextResponse(null, { status: 204 });
}


