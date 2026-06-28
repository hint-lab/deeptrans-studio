-- Demo 分支测试账户创建脚本
-- 邮箱: test@example.com
-- 密码: 123456
-- 密码哈希使用 bcrypt (rounds=10)

-- 检查用户是否已存在
DO $$
DECLARE
    user_exists BOOLEAN;
    hashed_password TEXT;
    demo_user_id TEXT;
    demo_tenant_id TEXT;
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
        )
        RETURNING id INTO demo_user_id;
        
        RAISE NOTICE '✅ 测试账户创建成功: test@example.com / 123456';
    ELSE
        SELECT id INTO demo_user_id FROM "User" WHERE email = 'test@example.com';
        RAISE NOTICE '✅ 测试账户已存在: test@example.com / 123456';
    END IF;

    SELECT "tenantId" INTO demo_tenant_id FROM "User" WHERE id = demo_user_id;
    IF demo_tenant_id IS NULL THEN
        INSERT INTO "Tenant" (id, name, description, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'Demo Workspace', 'Default tenant for demo user isolation', NOW(), NOW())
        RETURNING id INTO demo_tenant_id;

        UPDATE "User" SET "tenantId" = demo_tenant_id WHERE id = demo_user_id;
        RAISE NOTICE '✅ Demo 租户已创建并绑定';
    ELSE
        RAISE NOTICE '✅ Demo 用户已绑定租户';
    END IF;
END $$;
