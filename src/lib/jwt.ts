import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

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
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    return jwt.sign(payload, secret, { expiresIn: '1d' });
};

/**
 * 验证JWT Token
 * @param token JWT令牌
 * @returns 解码后的数据或null
 */
export const verifyJwtToken = (token: string): JWTPayload | null => {
    try {
        const secret = process.env.JWT_SECRET || 'your-secret-key';
        return jwt.verify(token, secret) as JWTPayload;
    } catch (error) {
        console.error("JWT验证失败:", error);
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
        iat: Math.floor(Date.now() / 1000)
    });
}; 