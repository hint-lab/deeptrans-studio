import { createLogger } from '@/lib/logger';
import nodemailer from 'nodemailer';

const logger = createLogger(
    {
        type: 'lib:mail',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

type MailEnvironment = Partial<Record<'EMAIL_SERVER' | 'EMAIL_FROM', string | undefined>>;

type MailConfiguration = {
    server: string;
    from: string;
};

export type MailDeliveryFailureKind = 'authentication' | 'unavailable';

export type SafeMailFailure = {
    code:
        | 'EMAIL_CONFIGURATION_INVALID'
        | 'EMAIL_AUTHENTICATION_FAILED'
        | 'EMAIL_DELIVERY_UNAVAILABLE';
    error: string;
};

export class MailConfigurationError extends Error {
    constructor() {
        super('邮件服务配置无效或未完成');
        this.name = 'MailConfigurationError';
    }
}

export class MailDeliveryError extends Error {
    readonly kind: MailDeliveryFailureKind;

    constructor(kind: MailDeliveryFailureKind = 'unavailable') {
        super('邮件服务暂不可用，请稍后重试');
        this.name = 'MailDeliveryError';
        this.kind = kind;
    }
}

function getConfiguredSmtpPort(url: URL): number | undefined {
    const queryPorts = url.searchParams.getAll('port');
    if (queryPorts.length > 1 || (url.port && queryPorts.length > 0)) {
        throw new MailConfigurationError();
    }

    const rawPort = url.port || queryPorts[0];
    if (!rawPort) return undefined;
    if (!/^\d+$/.test(rawPort)) throw new MailConfigurationError();

    const port = Number(rawPort);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw new MailConfigurationError();
    }
    return port;
}

function assertSmtpTlsSemantics(url: URL) {
    const isImplicitTls = url.protocol === 'smtps:';
    const port = getConfiguredSmtpPort(url);
    const allowedPorts = isImplicitTls ? [465] : [25, 587];

    // An omitted port is valid: Nodemailer applies 587 for smtp and 465 for
    // smtps. Do not require URL.port because Node may normalize a default port
    // to an empty string.
    if (port !== undefined && !allowedPorts.includes(port)) {
        throw new MailConfigurationError();
    }

    const secureOptions = url.searchParams.getAll('secure');
    if (secureOptions.length > 1) throw new MailConfigurationError();
    if (secureOptions.length === 1) {
        const rawSecure = secureOptions[0]?.trim().toLowerCase();
        if (rawSecure !== 'true' && rawSecure !== 'false') {
            throw new MailConfigurationError();
        }
        if ((rawSecure === 'true') !== isImplicitTls) {
            throw new MailConfigurationError();
        }
    }
}

function getSafeSmtpErrorMetadata(error: unknown): {
    errorCode?: string;
    responseCode?: number;
} {
    if (!error || typeof error !== 'object') return {};
    const smtpError = error as { code?: unknown; responseCode?: unknown };
    const rawCode = typeof smtpError.code === 'string' ? smtpError.code.trim() : '';
    const errorCode = /^[A-Za-z0-9_]{1,32}$/.test(rawCode) ? rawCode.toUpperCase() : undefined;
    const numericResponseCode = Number(smtpError.responseCode);
    const responseCode =
        Number.isInteger(numericResponseCode) &&
        numericResponseCode >= 100 &&
        numericResponseCode <= 599
            ? numericResponseCode
            : undefined;
    return { errorCode, responseCode };
}

export function classifyMailDeliveryError(error: unknown): MailDeliveryError {
    const { errorCode, responseCode } = getSafeSmtpErrorMetadata(error);
    const smtpError = error as { command?: unknown; message?: unknown } | null;
    const command = typeof smtpError?.command === 'string' ? smtpError.command : '';
    const message = typeof smtpError?.message === 'string' ? smtpError.message : '';
    const authenticationFailure =
        errorCode === 'EAUTH' ||
        responseCode === 535 ||
        /^AUTH(?:\s|$)/i.test(command) ||
        /\b535\b/.test(message);

    return new MailDeliveryError(authenticationFailure ? 'authentication' : 'unavailable');
}

export function getSafeMailFailure(error: unknown): SafeMailFailure {
    if (error instanceof MailConfigurationError) {
        return {
            code: 'EMAIL_CONFIGURATION_INVALID',
            error: '邮件服务配置无效，请联系管理员检查 SMTP 服务地址、端口、TLS 模式和授权码。',
        };
    }
    if (error instanceof MailDeliveryError && error.kind === 'authentication') {
        return {
            code: 'EMAIL_AUTHENTICATION_FAILED',
            error: '邮件服务认证失败，请联系管理员确认已开启 SMTP 服务、使用授权码而非邮箱密码，并检查端口和 TLS 模式。',
        };
    }
    return {
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        error: '邮件服务暂不可用，请稍后重试。',
    };
}

/**
 * Validates only the shape of the SMTP settings. It deliberately never exposes
 * or logs the URL, mailbox, or authorization code.
 */
export function getMailConfiguration(env?: MailEnvironment): MailConfiguration {
    const server = (env?.EMAIL_SERVER ?? process.env.EMAIL_SERVER)?.trim();
    const from = (env?.EMAIL_FROM ?? process.env.EMAIL_FROM)?.trim();

    if (!server || !from || from === '<your-email-from>' || from === 'no-reply@example.com') {
        throw new MailConfigurationError();
    }

    try {
        const url = new URL(server);
        const supportedProtocol = url.protocol === 'smtp:' || url.protocol === 'smtps:';

        if (!supportedProtocol || !url.hostname || !url.username || !url.password) {
            throw new MailConfigurationError();
        }
        assertSmtpTlsSemantics(url);
    } catch (error) {
        if (error instanceof MailConfigurationError) throw error;
        throw new MailConfigurationError();
    }

    return { server, from };
}

function createTransporter() {
    const { server, from } = getMailConfiguration();
    return { transporter: nodemailer.createTransport(server), from };
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

/**
 * Nodemailer only reports a successful SMTP hand-off when the requested
 * mailbox appears in `accepted`. Do not treat a response for another
 * recipient as success.
 */
export function isVerificationRecipientAccepted(info: unknown, recipient: string): boolean {
    if (!info || typeof info !== 'object' || !recipient) return false;
    const accepted = (info as { accepted?: unknown }).accepted;
    if (!Array.isArray(accepted)) return false;

    const normalizedRecipient = recipient.trim().toLowerCase();
    return accepted.some(
        address =>
            typeof address === 'string' && address.trim().toLowerCase() === normalizedRecipient
    );
}

export async function sendVerificationEmail(to: string, code: string) {
    // 验证参数
    if (!to || typeof to !== 'string') {
        logger.error('Invalid verification-email recipient', {
            recipientType: typeof to,
            recipientLength: typeof to === 'string' ? to.length : 0,
        });
        throw new Error('收件人邮箱无效');
    }
    const { transporter, from } = createTransporter();
    const { subject, text, html } = buildVerificationEmail(code);
    logger.debug('mail params validated', { recipientLength: to.length, codeLength: code.length });
    try {
        // sendMail 自身会建立连接并认证。请求内再调用 verify() 会让一封验证码邮件
        // 触发两次 SMTP 登录，容易命中 163 等服务商的临时认证限制。
        const info = await transporter.sendMail({ from, to, subject, text, html });
        // 在开发环境输出详细信息，方便排查
        if (process.env.NODE_ENV !== 'production') {
            // 仅输出关键字段，避免泄露敏感信息
            logger.debug('[mail] sendMail info:', {
                acceptedCount: Array.isArray((info as any)?.accepted)
                    ? (info as any).accepted.length
                    : 0,
                rejectedCount: Array.isArray((info as any)?.rejected)
                    ? (info as any).rejected.length
                    : 0,
            });
        }
        return info;
    } catch (error: unknown) {
        const metadata = getSafeSmtpErrorMetadata(error);
        logger.error('SMTP delivery failed', {
            ...metadata,
        });
        throw classifyMailDeliveryError(error);
    }
}
