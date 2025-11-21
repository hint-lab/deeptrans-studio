## 测试账户

- **邮箱**: `test@example.com`
- **验证码**: `123456` (固定验证码,无需发送邮件)

**重要说明**: 本系统使用**邮箱验证码登录**,而非传统的邮箱+密码登录方式。登录时:
1. 输入邮箱: `test@example.com`
2. 输入验证码: `123456` (演示账户使用固定验证码)
3. 点击登录

## 部署步骤

### 1. 启动服务

```bash
docker compose up -d
```

### 2. 创建测试账户

有三种方式创建测试账户:

#### 方式 1: 使用 TypeScript 脚本

```bash
# 在容器内运行
docker compose exec app yarn db:seed:demo
```

#### 方式 2: 使用 SQL 脚本 (推荐)

```bash
# 创建数据库deeptrans（如需要）
docker compose exec db psql -U postgres -c "CREATE DATABASE deeptrans;"
# 创建表结构（如需要）
docker compose cp prisma/migrations/20251115172210_nn/migration.sql db:/migration.sql
docker compose exec db psql -U postgres -d deeptrans -f /migration.sql
# 创建demo账户
docker compose cp scripts/create-demo-user.sql db:/create-demo-user.sql
docker compose exec db psql -U postgres -d deeptrans -f /create-demo-user.sql
```

或者连接到数据库后手动执行 `scripts/create-demo-user.sql` 中的 SQL。

#### 方式 3: 手动在 Prisma Studio 中创建

```bash
# 打开 Prisma Studio
docker compose exec app yarn db:studio
```

然后手动创建用户:
- email: `test@example.com`
- name: `Demo User`
- password: `$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy`
- emailVerified: 当前时间
- role: `USER`

### 3. 访问应用

访问 `https://www.deeptrans.studio/` 并使用测试账户登录。

## 功能限制

在 Demo 模式中:

- ✅ 用户可以使用测试账户登录
- ❌ 用户注册功能已禁用
- ❌ 登录页面不显示"去注册"链接
- ℹ️ 登录页面显示测试账户信息

## 与生产模式的区别

1. **禁用注册**: 移除了注册入口,防止用户自行注册
2. **测试账户**: 提供了预配置的测试账户
3. **UI 调整**: 登录页面显示测试账户信息

## 切换回生产模式

如果需要恢复完整功能:

修改项目.env配置文件中NEXT_PUBLIC_DEMO的值为false后重新构建镜像

```bash
docker compose up -d --build app app_worker
```
