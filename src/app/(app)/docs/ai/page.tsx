/* eslint-disable @typescript-eslint/naming-convention */
import { Bot, Network, Settings, Workflow, Wrench } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AIPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.ai;
  
  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    "预处理代理（Preprocess Agents）": Network,
    "预翻译代理（Pre-translate Agents）": Bot,
    "质量保证代理（QA Agents）": Settings,
    "后编辑代理（Post-edit Agents）": Workflow,
  };
/* eslint-enable @typescript-eslint/naming-convention */
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="h-8 w-8 text-primary" />
          <h1 id="AI 智能代理" className="scroll-m-20 text-4xl font-bold tracking-tight">{t('ai.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground leading-7">
          {t('ai.subtitle')}
        </p>
      </div>

      {/* AI 代理概述 */}
      {page.introduction && (
        <div className="space-y-4">
          <h2 id="AI 代理概述" className="text-2xl font-bold tracking-tight">{page.introduction.title}</h2>
          <p className="text-muted-foreground leading-7">
            {page.introduction.description}
          </p>
        </div>
      )}

      {/* 代理架构 */}
      <div className="space-y-6">
        <h2 id="代理架构" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
            <Settings className="h-5 w-5" />
          </div>
          {page.architecture.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.architecture.description}
        </p>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-lg">{page.architecture.baseAgent.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CardDescription className="leading-6">
              {page.architecture.baseAgent.description}
            </CardDescription>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {page.architecture.baseAgent.features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* 代理分类 */}
      <div className="space-y-8">
        <h2 id="代理类型" className="text-2xl font-bold tracking-tight scroll-m-20">{page.architecture.agentTypes.title}</h2>
        <p className="text-muted-foreground leading-7">
          {page.architecture.agentTypes.description}
        </p>

        {page.agentCategories.map((category, categoryIndex) => {
          const Icon = categoryIcons[category.name] ?? Bot;
          const categoryColors = [
            "bg-blue-100 text-blue-600",
            "bg-green-100 text-green-600",
            "bg-purple-100 text-purple-600",
            "bg-orange-100 text-orange-600"
          ];
          const colorClass = categoryColors[categoryIndex % categoryColors.length] ?? "bg-gray-100 text-gray-600";
          
          return (
            <div key={categoryIndex} className="space-y-6">
              <div className="space-y-2">
                <h3 id={category.name} className="text-xl font-semibold scroll-m-20 flex items-center gap-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  {category.name}
                </h3>
                <p className="text-muted-foreground leading-7">{category.description}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {category.agents.map((agent, agentIndex) => (
                  <Card key={agentIndex} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <CardDescription className="leading-6">
                        {agent.description}
                      </CardDescription>
                      <div className="pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{t('ai.labels.purpose')}</p>
                        <p className="text-xs text-muted-foreground">{agent.purpose}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 代理工具 */}
      <div className="space-y-6">
        <h2 id="代理工具" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Wrench className="h-5 w-5" />
          </div>
          {page.tools.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.tools.description}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {page.tools.items.map((tool, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{tool.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-6">{tool.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 代理工作流 */}
      <div className="space-y-6">
        <h2 id="代理工作流" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600">
            <Workflow className="h-5 w-5" />
          </div>
          {page.workflow.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.workflow.description}
        </p>

        <div className="space-y-4">
          {page.workflow.steps.map((step, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                    {step.step}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{step.stage}</CardTitle>
                    <CardDescription className="mt-1">{step.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {step.agents.map((agent, agentIndex) => (
                    <Badge key={agentIndex} variant="outline" className="font-mono text-xs">
                      {agent}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 代理配置 */}
      <div className="space-y-6">
        <h2 id="代理配置" className="text-2xl font-bold tracking-tight scroll-m-20">{page.configuration.title}</h2>
        <p className="text-muted-foreground leading-7">
          {page.configuration.description}
        </p>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {page.configuration.options.map((option, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">{option}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
