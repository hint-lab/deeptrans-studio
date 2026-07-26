## 本地演示账号

- **邮箱**: `test@example.com`
- **验证码**: `123456`（固定验证码，无需发送邮件）

本系统使用邮箱验证码登录，而非邮箱密码登录。演示账号仅用于隔离的本地开发环境。

## 隔离本地演示步骤

### 1. 创建本地配置

```bash
cp .env.local.example .env.local
# 使用 npm run local:secret 生成随机的本地值并填入 AUTH_SECRET；不要复制 .env 或生产配置。
```

### 2. 启动并初始化受管的本地服务

```bash
# 启动受管依赖、只迁移 deeptrans_local，并创建演示账号
npm run local:setup

# 仅在初始化成功后检查服务归属、凭据和迁移状态
npm run local:check
```

### 3. 启动应用

```bash
# Web 应用（yarn dev 走同一隔离启动器）
# 端口 3000 必须空闲；本地认证和 API 地址固定在该端口，启动器不会允许 Next 自动改用 3001。
npm run dev

# 如需后台任务，在另一终端运行
npm run worker
```

访问 `http://localhost:3000`，输入邮箱 `test@example.com` 和固定验证码 `123456` 登录；`123456` 不是密码。

若只需确认 Web 进程能响应，可访问 `http://localhost:3000/api/health`；返回的 `scope: "web"` 不代表数据库、存储或 Worker 已就绪。

## 功能限制

在本地演示模式（`.env.local` 中的 `IS_DEMO=yes`）下：

- ✅ 用户可以使用测试账户登录
- ❌ 用户注册功能已禁用
- ❌ 不会发送 SMTP 邮件
- ℹ️ 登录页面显示测试账户信息

## 生产边界

本文件只说明隔离本地演示，不用于切换或部署生产环境。生产部署应使用 README 的生产部署流程、独立审核过的生产环境文件和显式 `DEPLOY_ENV_FILE`；不要将 `.env.local`、演示账号或 `IS_DEMO=yes` 带入生产。
