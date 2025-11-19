import { NextRequest, NextResponse } from 'next/server'
import { createVerificationCode, createEmailVerificationCode } from '@/db/verificationCode'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const mode = String(form.get('mode') || 'email')
    const code = process.env.NODE_ENV === 'development' ? '123456' : String(Math.floor(100000 + Math.random()*900000))
    if (mode === 'phone') {
      const phone = String(form.get('phone') || '').trim()
      if (!phone) return NextResponse.json({ error: '缺少手机号' }, { status: 400 })
      const r = await createVerificationCode(phone, code)
      if (!r.success) return NextResponse.json({ error: r.error || '发送失败' }, { status: 500 })
      // TODO: 这里接入短信服务商发送验证码
      return NextResponse.json({ ok: true })
    } else {
      const email = String(form.get('email') || '').trim()
      if (!email) return NextResponse.json({ error: '缺少邮箱' }, { status: 400 })
      const r = await createEmailVerificationCode(email, code)
      if (!r.success) return NextResponse.json({ error: r.error || '发送失败' }, { status: 500 })
      // TODO: 接入邮件服务发送验证码
      return NextResponse.json({ ok: true })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '发送失败' }, { status: 500 })
  }
}


