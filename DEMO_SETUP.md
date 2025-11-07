# Demo 分支部署说明

这是 DeepTrans Studio 的 Demo 演示分支,提供了一个预配置的测试账户,并禁用了用户注册功能。

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

#### 方式 1: 使用 TypeScript 脚本 (推荐)

```bash
# 在容器内运行
docker compose exec studio yarn db:seed:demo
```

#### 方式 2: 使用 SQL 脚本

```bash
# 直接在数据库中执行
docker compose exec db psql -U postgres -d deeptrans -f /path/to/scripts/create-demo-user.sql
```

或者连接到数据库后手动执行 `scripts/create-demo-user.sql` 中的 SQL。

#### 方式 3: 手动在 Prisma Studio 中创建

```bash
# 打开 Prisma Studio
docker compose exec studio yarn db:studio
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

在 Demo 分支中:

- ✅ 用户可以使用测试账户登录
- ❌ 用户注册功能已禁用
- ❌ 登录页面不显示"去注册"链接
- ℹ️ 登录页面显示测试账户信息

## 与主分支的区别

1. **禁用注册**: 移除了注册入口,防止用户自行注册
2. **测试账户**: 提供了预配置的测试账户
3. **UI 调整**: 登录页面显示测试账户信息

## 切换回主分支

如果需要恢复完整功能:

```bash
git checkout main
docker compose up -d --build
```

