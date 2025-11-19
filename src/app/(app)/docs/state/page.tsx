import { Database, Layers, Code, Lightbulb } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "../components/code-block";

export default async function StatePage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.state;
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-8 w-8 text-primary" />
          <h1 id="状态管理" className="scroll-m-20 text-4xl font-bold tracking-tight">{t('state.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground leading-7">
          {t('state.subtitle')}
        </p>
      </div>

      {/* 状态管理概述 */}
      {page.introduction && (
        <div className="space-y-4">
          <h2 id="状态管理概述" className="text-2xl font-bold tracking-tight">{page.introduction.title}</h2>
          <p className="text-muted-foreground leading-7">
            {page.introduction.description}
          </p>
        </div>
      )}

      {/* 架构设计 */}
      <div className="space-y-6">
        <h2 id="架构设计" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Layers className="h-5 w-5" />
          </div>
          {page.architecture.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.architecture.description}
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {page.architecture.layers.map((layer, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                    {index + 1}
                  </div>
                  <CardTitle className="text-lg">{layer.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="leading-6">{layer.description}</CardDescription>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {layer.features.map((feature, featureIndex) => (
                    <li key={featureIndex}>{feature}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Store 结构 */}
      <div className="space-y-6">
        <h2 id="Store 结构" className="text-2xl font-bold tracking-tight scroll-m-20">{page.storeStructure.title}</h2>
        <p className="text-muted-foreground leading-7">
          {page.storeStructure.description}
        </p>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {page.storeStructure.slices.map((slice, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{slice.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-6">
                  {slice.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 使用方式 */}
      <div className="space-y-6">
        <h2 id="使用方式" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Code className="h-5 w-5" />
          </div>
          {page.usage.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.usage.description}
        </p>

        <div className="space-y-4">
          {page.usage.examples.map((example, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{example.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock code={example.code} language="typescript" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 最佳实践 */}
      <div className="space-y-6">
        <h2 id="最佳实践" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Lightbulb className="h-5 w-5" />
          </div>
          {page.bestPractices.title}
        </h2>
        
        <div className="space-y-3">
          {page.bestPractices.items.map((item, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold shrink-0 mt-0.5">
                    {index + 1}
                  </div>
                  <p className="text-sm text-muted-foreground leading-6 flex-1">{item}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
