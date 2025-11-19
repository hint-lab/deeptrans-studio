# 文档国际化 (Docs i18n)

本目录包含 DeepTrans Studio 文档系统的国际化文件。

## 文件结构

```
i18n/
├── zh.json          # 中文翻译（首页和导航）
├── en.json          # 英文翻译（首页和导航）
├── pages-zh/        # 拆分后的中文页面翻译文件
│   ├── gettingStarted-zh.json
│   ├── concepts-zh.json
│   ├── workflows-zh.json
│   ├── installation-zh.json
│   ├── ui-zh.json
│   ├── serverActions-zh.json
│   ├── state-zh.json
│   ├── ai-zh.json
│   ├── database-zh.json
│   ├── troubleshooting-zh.json
│   └── faq-zh.json
├── pages-en/        # 拆分后的英文页面翻译文件
│   ├── gettingStarted-en.json
│   ├── concepts-en.json
│   ├── workflows-en.json
│   ├── installation-en.json
│   ├── ui-en.json
│   ├── serverActions-en.json
│   ├── state-en.json
│   ├── ai-en.json
│   ├── database-en.json
│   ├── troubleshooting-en.json
│   └── faq-en.json
├── index.ts         # 国际化工具函数
└── README.md        # 本文件
```

## 使用方法

### 在首页和导航中使用

```typescript
import { getDocsTranslations, getDocsT } from "./i18n";

export default async function DocsHomePage() {
  const translations = await getDocsTranslations();
  const t = getDocsT(translations);
  
  return (
    <div>
      <h1>{t('home.title')}</h1>
      <p>{t('home.subtitle')}</p>
    </div>
  );
}
```

### 在子页面中使用

```typescript
import { getPageTranslations, getPageT } from "../i18n";

export default async function GettingStartedPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.gettingStarted; // 直接访问页面对象
  
  return (
    <div>
      <h1>{t('gettingStarted.title')}</h1>
      <p>{t('gettingStarted.subtitle')}</p>
      
      {/* 访问复杂对象 */}
      {Object.entries(page.steps).map(([key, step]) => (
        <div key={key}>
          <h2>{step.title}</h2>
          <p>{step.description}</p>
        </div>
      ))}
    </div>
  );
}
```

## JSON 文件结构

### zh.json / en.json（首页和导航）

- `meta`: 页面元数据
- `navigation`: 导航菜单项
- `home`: 首页完整内容
  - `cards`: 卡片内容
  - `features`: 特性介绍
  - `quickLinks`: 快速链接
- `common`: 通用文案

### pages-zh/ 和 pages-en/ 目录（拆分后的子页面翻译）

每个页面都有独立的 JSON 文件：
- 中文：`pages-zh/gettingStarted-zh.json`、`pages-zh/concepts-zh.json` 等
- 英文：`pages-en/gettingStarted-en.json`、`pages-en/concepts-en.json` 等

每个页面文件包含：
- `title`: 页面标题
- `subtitle`: 页面副标题
- 页面特定内容（如 steps、concepts 等）

示例：
```json
{
  "gettingStarted": {
    "title": "快速开始",
    "subtitle": "...",
    "steps": {
      "step1": {
        "title": "...",
        "description": "...",
        "tips": ["...", "..."]
      }
    }
  }
}
```

## 已支持的页面

✅ 首页 (page.tsx)
✅ 快速开始 (getting-started/page.tsx)
✅ 核心概念 (concepts/page.tsx)
✅ 工作流 (workflows/page.tsx)
✅ 安装配置 (installation/page.tsx)
✅ 界面指南 (ui/page.tsx)
✅ API参考 (server-actions/page.tsx)
✅ 状态管理 (state/page.tsx)
✅ AI智能代理 (ai/page.tsx)
✅ 数据库设计 (database/page.tsx)
✅ 故障排查 (troubleshooting/page.tsx)
✅ 常见问题 (faq/page.tsx)

## 添加新的翻译

1. 在 `pages-zh/` 目录下创建新的中文页面翻译文件，例如 `newPage-zh.json`
2. 在 `pages-en/` 目录下创建对应的英文页面翻译文件，例如 `newPage-en.json`
3. 在 `index.ts` 中导入并合并新文件（中英文都需要导入）
4. 确保中英文文件的结构保持一致
5. 在页面组件中使用 `getPageTranslations()` 和 `getPageT()`

## 工具函数

### `getDocsTranslations()`
返回首页和导航的翻译对象

### `getPageTranslations()`
返回子页面的翻译对象

### `getDocsT(translations)`
返回首页翻译函数

### `getPageT(translations)`
返回子页面翻译函数

## 注意事项

- 保持中英文 JSON 文件结构完全一致
- 使用点号分隔的路径访问嵌套键
- 对于复杂对象，直接使用 `translations.pageName` 而不是 `t()` 函数
- 如果翻译键不存在，`t()` 函数会返回原始路径作为后备值
