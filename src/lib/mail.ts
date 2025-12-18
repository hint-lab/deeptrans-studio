import nodemailer from "nodemailer";

function createTransporter() {
  if (!process.env.EMAIL_SERVER) return null;
  // 开发环境开启日志，便于排查 500
  const options: any = { logger: process.env.NODE_ENV !== "production", debug: process.env.NODE_ENV !== "production" };
  return nodemailer.createTransport(process.env.EMAIL_SERVER as string, options);
}

export async function sendVerificationEmail(to: string, code: string) {
  // 验证参数
  if (!to || typeof to !== 'string') {
    console.error('❌ 收件人邮箱无效:', { to, type: typeof to });
    throw new Error(`收件人邮箱无效: ${to}`);
  }
  const transporter = createTransporter();
  if (!transporter) {
    console.error("EMAIL_SERVER is not configured");
    throw new Error("EMAIL_SERVER 未配置，无法发送邮件");
  }
  const from = process.env.EMAIL_FROM || "no-reply@example.com";
  const subject = "您的登录验证码";
  const text = `您的验证码是：${code} （2分钟内有效）`;
  const html = `<p>您的验证码是：<b>${code}</b></p><p>2分钟内有效，请勿泄露。</p>`;
  console.log('✅ 参数验证通过:', { to, codeLength: code.length });
  try {
    // 可提前验证连接配置是否有效
    await transporter.verify();
  } catch (e: any) {
    // 常见原因：端口/secure 错误、凭据错误、发件人未验证
    console.error("SMTP connection verification failed:", e);
    throw new Error(`SMTP 连接验证失败：${e?.message || e}`);
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    // 在开发环境输出详细信息，方便排查
    if (process.env.NODE_ENV !== "production") {
      // 仅输出关键字段，避免泄露敏感信息
      console.log("[mail] sendMail info:", {
        messageId: (info as any)?.messageId,
        accepted: (info as any)?.accepted,
        rejected: (info as any)?.rejected,
        response: (info as any)?.response,
      });
    }
    return info;
  } catch (e: any) {
    throw new Error(`发送失败：${e?.message || e}`);
  }
}


