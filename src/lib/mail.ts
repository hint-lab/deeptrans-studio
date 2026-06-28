import { createLogger } from '@/lib/logger';
import nodemailer from 'nodemailer';
const logger = createLogger({
    type: 'lib:mail',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
function createTransporter() {
    if (!process.env.EMAIL_SERVER) return null;
    const enableMailDebug =
        process.env.NODE_ENV !== 'production' && process.env.LOGGER_ENABLE_DEBUG === 'true';
    const options: any = {
        logger: enableMailDebug,
        debug: enableMailDebug,
    };
    return nodemailer.createTransport(process.env.EMAIL_SERVER as string, options);
}

function buildVerificationEmail(code: string) {
    const subject = 'DeepTrans Studio 登录验证码';
    const text = `您的 DeepTrans Studio 验证码是：${code}。验证码 2 分钟内有效，请勿泄露。`;
    const html = `
<div style="margin:0;padding:32px 0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid #eef2f7;">
      <div style="font-size:20px;font-weight:700;color:#0f172a;">DeepTrans Studio</div>
      <div style="margin-top:6px;font-size:14px;color:#64748b;">邮箱验证码</div>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">您好，您正在使用邮箱验证码登录或注册 DeepTrans Studio。</p>
      <div style="margin:24px 0;padding:20px 24px;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
        <div style="font-size:13px;color:#64748b;margin-bottom:8px;">验证码</div>
        <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:6px;color:#0f172a;">${code}</div>
      </div>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">验证码 2 分钟内有效。若不是您本人操作，请忽略此邮件。</p>
    </div>
    <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #eef2f7;font-size:12px;color:#94a3b8;">
      此邮件由系统自动发送，请勿直接回复。
    </div>
  </div>
</div>`;
    return { subject, text, html };
}

export async function sendVerificationEmail(to: string, code: string) {
    // 验证参数
    if (!to || typeof to !== 'string') {
        logger.error('❌ 收件人邮箱无效:', { to, type: typeof to });
        throw new Error(`收件人邮箱无效: ${to}`);
    }
    const transporter = createTransporter();
    if (!transporter) {
        logger.error('EMAIL_SERVER is not configured');
        throw new Error('EMAIL_SERVER 未配置，无法发送邮件');
    }
    const from = process.env.EMAIL_FROM || 'no-reply@example.com';
    const { subject, text, html } = buildVerificationEmail(code);
    logger.debug('mail params validated', { recipientLength: to.length, codeLength: code.length });
    try {
        // 可提前验证连接配置是否有效
        await transporter.verify();
    } catch (e: any) {
        // 常见原因：端口/secure 错误、凭据错误、发件人未验证
        logger.error('SMTP connection verification failed:', e);
        throw new Error(`SMTP 连接验证失败：${e?.message || e}`);
    }

    try {
        const info = await transporter.sendMail({ from, to, subject, text, html });
        // 在开发环境输出详细信息，方便排查
        if (process.env.NODE_ENV !== 'production') {
            // 仅输出关键字段，避免泄露敏感信息
            logger.debug('[mail] sendMail info:', {
                messageId: (info as any)?.messageId,
                acceptedCount: Array.isArray((info as any)?.accepted) ? (info as any).accepted.length : 0,
                rejectedCount: Array.isArray((info as any)?.rejected) ? (info as any).rejected.length : 0,
                response: (info as any)?.response,
            });
        }
        return info;
    } catch (e: any) {
        throw new Error(`发送失败：${e?.message || e}`);
    }
}
