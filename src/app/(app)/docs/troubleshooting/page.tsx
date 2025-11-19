import { Shield, AlertCircle, Wrench, BookOpen, MessageSquare } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "../components/code-block";

export default async function TroubleshootingPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.troubleshooting;
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 id="故障排查" className="scroll-m-20 text-4xl font-bold tracking-tight">{t('troubleshooting.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground leading-7">
          {t('troubleshooting.subtitle')}
        </p>
      </div>

      {/* 故障排查指南 */}
      {page.introduction && (
        <div className="space-y-4">
          <h2 id="故障排查指南" className="text-2xl font-bold tracking-tight">{page.introduction.title}</h2>
          <p className="text-muted-foreground leading-7">
            {page.introduction.description}
          </p>
        </div>
      )}

      {/* 问题分类 */}
      <div className="space-y-8">
        {page.categories.map((category, categoryIndex) => {
          const categoryColors = [
            "bg-red-100 text-red-600",
            "bg-orange-100 text-orange-600",
            "bg-yellow-100 text-yellow-600",
            "bg-blue-100 text-blue-600"
          ];
          const colorClass = categoryColors[categoryIndex % categoryColors.length] ?? "bg-gray-100 text-gray-600";
          
          return (
            <div key={categoryIndex} className="space-y-6">
              <div className="space-y-2">
                <h2 id={category.name} className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  {category.name}
                </h2>
                <p className="text-muted-foreground leading-7">{category.description}</p>
              </div>

              <div className="space-y-4">
                {category.issues.map((issue, issueIndex) => (
                  <Card key={issueIndex} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                          {issueIndex + 1}
                        </div>
                        <CardTitle className="text-lg">{issue.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">{t('troubleshooting.labels.Problems')}</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {issue.Problems.map((symptom, symptomIndex) => (
                            <li key={symptomIndex}>{symptom}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">{t('troubleshooting.labels.solutions')}</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {issue.solutions.map((solution, solutionIndex) => (
                            <li key={solutionIndex}>{solution}</li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 调试技巧 */}
      <div className="space-y-6">
        <h2 id="调试技巧" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Wrench className="h-5 w-5" />
          </div>
          {page.debugging.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.debugging.description}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {page.debugging.tips.map((tip, tipIndex) => (
            <Card key={tipIndex} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{tip.title}</CardTitle>
                <CardDescription>{tip.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {tip.commands.map((command, cmdIndex) => (
                    <li key={cmdIndex}>
                      <CodeBlock code={command} language="bash" />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 获取帮助 */}
      <div className="space-y-6">
        <h2 id="获取帮助" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          {page.gettingHelp.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.gettingHelp.description}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {page.gettingHelp.options.map((option, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  {option.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-6">{option.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
