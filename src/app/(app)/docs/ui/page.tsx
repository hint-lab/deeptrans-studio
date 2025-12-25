/* eslint-disable @typescript-eslint/naming-convention */
import {
    FileText,
    Layout,
    Keyboard,
    Lightbulb,
    BookOpen,
    Database,
    Zap,
    Workflow,
} from 'lucide-react';
import { getPageTranslations, getPageT } from '../i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function UIPage() {
    const translations = await getPageTranslations();
    const t = getPageT(translations);
    const page = translations.ui;

    const sectionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
        '翻译 IDE': Layout,
        项目管理: FileText,
        术语管理: BookOpen,
        翻译记忆库: Database,
        'AI 辅助功能': Zap,
        工作流自动化: Workflow,
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    return (
        <div className="space-y-8">
            {/* 页面标题 */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <FileText className="h-8 w-8 text-primary" />
                    <h1 id="界面指南" className="scroll-m-20 text-4xl font-bold tracking-tight">
                        {t('ui.title')}
                    </h1>
                </div>
                <p className="text-lg leading-7 text-muted-foreground">{t('ui.subtitle')}</p>
            </div>

            {/* 界面概览 */}
            {page.introduction && (
                <div className="space-y-4">
                    <h2 id="界面概览" className="text-2xl font-bold tracking-tight">
                        {page.introduction.title}
                    </h2>
                    <p className="leading-7 text-muted-foreground">
                        {page.introduction.description}
                    </p>
                </div>
            )}

            {/* 功能区域 */}
            <div className="space-y-8">
                {page.sections.map((section, sectionIndex) => {
                    const Icon = sectionIcons[section.name] ?? FileText;
                    const sectionColors = [
                        'bg-blue-100 text-blue-600',
                        'bg-green-100 text-green-600',
                        'bg-purple-100 text-purple-600',
                        'bg-orange-100 text-orange-600',
                        'bg-pink-100 text-pink-600',
                        'bg-indigo-100 text-indigo-600',
                    ];
                    const colorClass =
                        sectionColors[sectionIndex % sectionColors.length] ??
                        'bg-gray-100 text-gray-600';

                    return (
                        <div key={sectionIndex} className="space-y-6">
                            <div className="space-y-2">
                                <h2
                                    id={section.name}
                                    className="flex scroll-m-20 items-center gap-2 text-2xl font-bold tracking-tight"
                                >
                                    <div
                                        className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}
                                    >
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    {section.name}
                                </h2>
                                <p className="leading-7 text-muted-foreground">
                                    {section.description}
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                {section.features.map((feature, featureIndex) => (
                                    <Card
                                        key={featureIndex}
                                        className="transition-shadow hover:shadow-md"
                                    >
                                        <CardHeader>
                                            <CardTitle className="text-base">
                                                {feature.title}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <CardDescription className="leading-6">
                                                {feature.description}
                                            </CardDescription>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 快捷键 */}
            <div className="space-y-6">
                <h2
                    id="快捷键"
                    className="flex scroll-m-20 items-center gap-2 text-2xl font-bold tracking-tight"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
                        <Keyboard className="h-5 w-5" />
                    </div>
                    {page.keyboardShortcuts.title}
                </h2>
                <p className="leading-7 text-muted-foreground">
                    {page.keyboardShortcuts.description}
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                    {page.keyboardShortcuts.shortcuts.map((shortcut, index) => (
                        <Card key={index} className="transition-shadow hover:shadow-md">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{shortcut.action}</span>
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {shortcut.key}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* 使用技巧 */}
            <div className="space-y-6">
                <h2
                    id="使用技巧"
                    className="flex scroll-m-20 items-center gap-2 text-2xl font-bold tracking-tight"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <Lightbulb className="h-5 w-5" />
                    </div>
                    {page.tips.title}
                </h2>

                <div className="space-y-3">
                    {page.tips.items.map((tip, index) => (
                        <Card key={index} className="transition-shadow hover:shadow-md">
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                                        {index + 1}
                                    </div>
                                    <p className="flex-1 text-sm leading-6 text-muted-foreground">
                                        {tip}
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
