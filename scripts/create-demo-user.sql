-- Demo 分支测试账户创建脚本
-- 邮箱: test@example.com
-- 密码: 123456
-- 密码哈希使用 bcrypt (rounds=10)

-- 检查用户是否已存在
DO $$
DECLARE
    user_exists BOOLEAN;
    hashed_password TEXT;
BEGIN
    -- 检查用户是否存在
    SELECT EXISTS(SELECT 1 FROM "User" WHERE email = 'test@example.com') INTO user_exists;
    
    IF NOT user_exists THEN
        -- bcrypt hash for "123456" with 10 rounds
        -- 注意: 这个哈希值是预先生成的,每次运行 bcrypt 会生成不同的哈希值(因为salt不同)
        -- 但都可以验证密码 "123456"
        hashed_password := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
        
        -- 插入测试用户
        INSERT INTO "User" (
            id,
            email,
            name,
            password,
            "emailVerified",
            role
        ) VALUES (
            gen_random_uuid()::text,  -- 生成随机 UUID
            'test@example.com',
            'Demo User',
            hashed_password,
            NOW(),
            'USER'
        );
        
        RAISE NOTICE '✅ 测试账户创建成功: test@example.com / 123456';
    ELSE
        RAISE NOTICE '✅ 测试账户已存在: test@example.com / 123456';
    END IF;
END $$;
