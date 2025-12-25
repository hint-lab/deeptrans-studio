// 使用独立的 Redis 客户端（仅 Node 环境懒加载）
const getRedis = async () => (await import('@/lib/redis')).getRedis();

const PREFIX_VTOKEN = 'verify:token:';
const PREFIX_2FA = 'verify:2fa:';

export const generateVerificationToken = async (phone: string) => {
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `${PREFIX_VTOKEN}${phone}`;
    const ttl = 15 * 60; // 15 minutes
    const connection = await getRedis();
    await connection.set(key, token, 'EX', ttl);
    return { phone, token, expires: new Date(Date.now() + ttl * 1000) } as const;
};

export const generateTwoFactorToken = async (phone: string) => {
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `${PREFIX_2FA}${phone}`;
    const ttl = 10 * 60; // 10 minutes
    const connection = await getRedis();
    await connection.set(key, token, 'EX', ttl);
    return { phone, token, expires: new Date(Date.now() + ttl * 1000) } as const;
};

export const getVerificationTokenByPhone = async (phone: string) => {
    try {
        const connection = await getRedis();
        const token = await connection.get(`${PREFIX_VTOKEN}${phone}`);
        return token ? { phone, token } : null;
    } catch {
        return null;
    }
};

export const getTwoFactorTokenByPhone = async (phone: string) => {
    try {
        const connection = await getRedis();
        const token = await connection.get(`${PREFIX_2FA}${phone}`);
        return token ? { phone, token } : null;
    } catch {
        return null;
    }
};
