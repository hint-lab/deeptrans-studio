// utils/jwt.ts
import jwt, { type JwtPayload } from 'jsonwebtoken';

// 定义接口以匹配你的 JWT 结构
interface DecodedToken extends JwtPayload {
  sub?: string; // `sub` 通常用作 `user.id` 的存储
  // 其他你可能在 JWT 中存储的字段
}

// 函数: 解析 JWT 并返回解码后的数据
export const parseJwt = (token: string): DecodedToken | null => {
  try {
    const decoded = jwt.decode(token) as DecodedToken;
    return decoded;
  } catch (error) {
    console.error('Failed to decode JWT', error);
    return null;
  }
};
