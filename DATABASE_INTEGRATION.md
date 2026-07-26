# 词典管理系统数据库集成

## 概述

词典管理系统现在已经完全集成到数据库中，支持以下功能：

- 创建、编辑、删除词典
- 管理词典条目（术语对照）
- 搜索和过滤功能
- 数据持久化存储

## 数据库模型

### Dictionary（词典）

- `id`: 唯一标识符
- `name`: 词典名称
- `description`: 词典描述
- `domain`: 领域分类
- `isPublic`: 是否公开
- `userId`: 创建者ID（私有词典）
- `createdAt`: 创建时间
- `updatedAt`: 更新时间

### DictionaryEntry（词典条目）

- `id`: 唯一标识符
- `sourceText`: 源语言文本
- `targetText`: 目标语言文本
- `notes`: 备注说明
- `dictionaryId`: 所属词典ID
- `createdAt`: 创建时间
- `updatedAt`: 更新时间

## 安装和设置

### 1. 安装依赖

```bash
npm install
```

### 2. 创建隔离本地配置

```bash
cp .env.local.example .env.local
# 使用 npm run local:secret 生成随机的本地值并填入 AUTH_SECRET；不要复制 .env 或生产配置。
```

### 3. 初始化受管本地依赖与演示数据

```bash
# local:setup 会启动本地 PostgreSQL、Valkey、MinIO，迁移 deeptrans_local，
# 并创建演示账号。
npm run local:setup

# setup 成功后再执行只读就绪检查。
npm run local:check
```

### 4. 启动开发服务器

```bash
npm run dev
# 如需后台任务，在另一终端运行 npm run worker
```

本地开发不要直接运行 `db:push`、`db:migrate`、`db:seed`、`db:reset` 或裸 Prisma 命令：它们会使用当前 shell 的数据库配置，而不经过隔离启动器。生产迁移应遵循 README 中已批准的生产部署流程。

## 主要功能

### 词典管理

- **创建词典**: 点击"增加词库"按钮，填写表单创建新词典
- **编辑词典**: 支持修改词典名称、描述、领域和公开状态
- **删除词典**: 删除词典及其所有条目

### 词库管理

- **添加词条**: 在词典详情页面添加新的术语对照
- **编辑词条**: 修改源语言、目标语言和备注
- **删除词条**: 删除不需要的词条
- **搜索词条**: 支持按源语言、目标语言或备注搜索

### 分类管理

- **公共词库**: 所有用户可见的词典
- **领域词库**: 按专业领域分类的词典
- **私有词库**: 用户个人创建的词典

## API接口

### 词典操作

- `createDictionary()`: 创建词典
- `getAllDictionaries()`: 获取所有词典
- `getDictionaries()`: 获取词典
- `updateDictionary()`: 更新词典
- `deleteDictionary()`: 删除词典

### 词条操作

- `createDictionaryEntry()`: 创建词条
- `updateDictionaryEntry()`: 更新词条
- `deleteDictionaryEntry()`: 删除词条
- `getDictionaryEntries()`: 获取词典条目
- `searchDictionaryEntries()`: 搜索词条

## 使用示例

### 创建新词典

```typescript
import { createDictionary } from '@/actions/dictionary';

const result = await createDictionary({
    name: '我的专业词典',
    description: '个人专业术语集合',
    domain: 'technology',
    isPublic: false,
});
```

### 添加词条

```typescript
import { createDictionaryEntry } from '@/actions/dictionary';

const result = await createDictionaryEntry({
    sourceText: 'machine learning',
    targetText: '机器学习',
    notes: 'AI领域术语',
    dictionaryId: 'dict-id',
});
```

## 错误处理

所有数据库操作都包含完整的错误处理：

- 成功操作返回 `{ success: true, data: result }`
- 失败操作返回 `{ success: false, error: "错误信息" }`
- 使用Toast组件显示操作结果

## 性能优化

- 使用Prisma的include和select优化查询
- 实现搜索防抖（300ms延迟）
- 支持分页加载（可扩展）
- 缓存常用数据

## 安全考虑

- 所有数据库操作都使用参数化查询
- 支持用户权限控制（私有词典）
- 输入验证和清理
- SQL注入防护

## 故障排除

### 常见问题

1. **数据库连接失败**
    - 检查环境变量配置
    - 确认数据库服务运行状态

2. **本地初始化或迁移错误**
    - 重新运行 `npm run local:setup`，它会使用受管的本地数据库
    - setup 成功后运行 `npm run local:check` 确认迁移状态

3. **数据不显示**
    - 确认已运行种子脚本
    - 检查数据库权限

### 调试模式

```bash
# 检查受管本地依赖、凭据与迁移状态
npm run local:check

# 查看本地应用日志
npm run dev
```

本地路径不提供通用重置命令；不要对未知 `DATABASE_URL` 使用 `db:reset`、`db:push` 或 Prisma Studio。

## 扩展功能

### 计划中的功能

- 批量导入/导出词条
- 词条版本控制
- 协作编辑
- 高级搜索和过滤
- 词条使用统计

### 自定义扩展

- 添加新的领域分类
- 自定义词条字段
- 集成外部词典API
- 多语言支持

## 技术支持

如有问题，请检查：

1. 控制台错误日志
2. 数据库连接状态
3. Prisma客户端版本
4. 环境变量配置
