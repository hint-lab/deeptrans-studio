import { createLogger } from '@/lib/logger';
import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
const logger = createLogger({
    type: 'lib:jwt',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
function getJwtSecret() {
    const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error('JWT_SECRET or AUTH_SECRET is required');
    return secret;
}

interface JWTPayload {
    id: string;
    phone?: string;
    role?: UserRole;
    [key: string]: any;
}

/**
 * 生成JWT Token
 * @param payload 需要编码的数据
 * @returns 生成的JWT Token
 */
export const generateJwtToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: '1d' });
};

/**
 * 验证JWT Token
 * @param token JWT令牌
 * @returns 解码后的数据或null
 */
export const verifyJwtToken = (token: string): JWTPayload | null => {
    try {
        return jwt.verify(token, getJwtSecret()) as JWTPayload;
    } catch (error) {
        logger.error('JWT验证失败:', error);
        return null;
    }
};

/**
 * 验证验证码并生成用户身份令牌
 * @param user 用户信息
 * @returns 生成的JWT令牌
 */
export const generateAuthToken = (user: { id: string; phone?: string; role?: UserRole }) => {
    return generateJwtToken({
        id: user.id,
        phone: user.phone,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
    });
};
