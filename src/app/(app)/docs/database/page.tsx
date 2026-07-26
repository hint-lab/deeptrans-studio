import { Database, Layers, Code, Key, Lightbulb } from 'lucide-react';
import { getPageTranslations, getPageT } from '../i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CodeBlock } from '../components/code-block';
import { Badge } from '@/components/ui/badge';

export default async function DatabasePage() {
    const translations = await getPageTranslations();
    const t = getPageT(translations);
    const page = translations.database;

    return (
        <div className="space-y-8">
            {/* 页面标题 */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Database className="h-8 w-8 text-primary" />
                    <h1 id="数据库设计" className="scroll-m-20 text-4xl font-bold tracking-tight">
                        {t('database.title')}
                    </h1>
                </div>
                <p className="text-lg leading-7 text-muted-foreground">{t('database.subtitle')}</p>
            </div>

            {/* 数据库概述 */}
            {page.introduction && (
                <div className="space-y-4">
                    <h2 id="数据库概述" className="text-2xl font-bold tracking-tight">
                        {page.introduction.title}
                    </h2>
                    <p className="leading-7 text-muted-foreground">
                        {page.introduction.description}
                    </p>
                </div>
            )}

            {/* 技术栈 */}
            <div className="space-y-6">
                <h2
                    id="技术栈"
                    className="flex scroll-m-20 items-center gap-2 text-2xl font-bold tracking-tight"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        <Layers className="h-5 w-5" />
                    </div>
                    {page.technology.title}
                </h2>
                <p className="leading-7 text-muted-foreground">{page.technology.description}</p>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {page.technology.items.map((item, index) => (
                        <Card key={index} className="transition-shadow hover:shadow-md">
                            <CardHeader>
                                <CardTitle className="text-lg">{item.name}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="leading-6">
                                    {item.description}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* 核心数据模型 */}
            <div className="space-y-6">
                <h2 id="核心数据模型" className="scroll-m-20 text-2xl font-bold tracking-tight">
                    {page.coreModels.title}
                </h2>
                <p className="leading-7 text-muted-foreground">{page.coreModels.description}</p>

                <div className="grid gap-4 md:grid-cols-2">
                    {page.coreModels.models.map((model, index) => (
                        <Card key={index} className="transition-shadow hover:shadow-md">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                                        {index + 1}
                                    </div>
                                    <CardTitle className="text-lg">{model.name}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <CardDescription className="leading-6">
                                    {model.description}
                                </CardDescription>

                                <div className="space-y-2 border-t pt-2">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        关键字段：
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {model.keyFields.map((field, fieldIndex) => (
                                            <Badge
                                                key={fieldIndex}
                                                variant="outline"
                                                className="font-mono text-xs"
                                            >
                                                {field}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {model.relations && (
                                    <div className="space-y-2 border-t pt-2">
                                        <p className="text-xs font-medium text-muted-foreground">
                                            关联关系：
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                            {model.relations.map((relation, relationIndex) => (
                                                <Badge
                                                    key={relationIndex}
                                                    variant="secondary"
                                                    className="text-xs"
                                                >
                                                    {relation}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {model.notes && (
                                    <div className="flex items-start gap-2 border-t pt-2">
                                        <Lightbulb
                                            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                                            aria-hidden="true"
                                        />
                                        <p className="text-xs italic text-muted-foreground">
                                            {model.notes}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* 枚举类型 */}
            <div className="space-y-6">
                <h2
                    id="枚举类型"
                    className="flex scroll-m-20 items-center gap-2 text-2xl font-bold tracking-tight"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
                        <Key className="h-5 w-5" />
                    </div>
                    {page.enums.title}
                </h2>
                <p className="leading-7 text-muted-foreground">{page.enums.description}</p>

                <div className="grid gap-4 md:grid-cols-2">
                    {page.enums.items.map((enumItem, index) => (
                        <Card key={index} className="transition-shadow hover:shadow-md">
                            <CardHeader>
                                <CardTitle className="font-mono text-base">
                                    {enumItem.name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <CardDescription className="leading-6">
                                    {enumItem.description}
                                </CardDescription>
                                <div className="flex flex-wrap gap-1 border-t pt-2">
                                    {enumItem.values.map((value, valueIndex) => (
                                        <Badge
                                            key={valueIndex}
                                            variant="outline"
                                            className="font-mono text-xs"
                                        >
                                            {value}
                                        </Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* 数据库迁移 */}
            <div className="space-y-6">
                <h2
                    id="数据库迁移"
                    className="flex scroll-m-20 items-center gap-2 text-2xl font-bold tracking-tight"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                        <Code className="h-5 w-5" />
                    </div>
                    {page.migrations.title}
                </h2>
                <p className="leading-7 text-muted-foreground">{page.migrations.description}</p>

                <div className="space-y-3">
                    {page.migrations.commands.map((cmd, index) => (
                        <Card key={index} className="transition-shadow hover:shadow-md">
                            <CardContent className="pt-6">
                                <div className="space-y-2">
                                    <CodeBlock code={cmd.command} language="bash" />
                                    <p className="text-sm text-muted-foreground">
                                        {cmd.description}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
