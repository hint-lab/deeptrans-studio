import { HelpCircle, MessageSquare } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "../components/code-block";

// 解析编号列表的函数
function parseNumberedList(text: string): { prefix?: string; items: string[] } | null {
  // 匹配模式：数字) 开头的内容，可能用逗号、中文逗号或换行分隔
  const numberedPattern = /\d+\)/;
  
  if (!numberedPattern.test(text)) {
    return null;
  }
  
  // 提取编号列表项 - 匹配 "数字) 内容" 格式
  // 内容可能包含逗号，直到下一个 "数字)" 或文本结束
  const items: string[] = [];
  // 匹配模式：数字) 后跟内容，内容直到下一个数字)或文本结束
  const itemPattern = /(\d+\))\s*((?:(?!\d+\)).)*?)(?=\s*\d+\)|$)/g;
  let match: RegExpExecArray | null;
  let firstMatchIndex = -1;
  
  while ((match = itemPattern.exec(text)) !== null) {
    if (match?.[2]) {
      if (firstMatchIndex === -1) {
        firstMatchIndex = match.index;
      }
      // 移除末尾的逗号或中文逗号
      const content = match[2].trim().replace(/[，,]\s*$/, '');
      if (content) {
        items.push(content);
      }
    }
  }
  
  if (items.length === 0) {
    return null;
  }
  
  // 提取前缀（编号列表之前的内容）
  const prefix = firstMatchIndex > 0 
    ? text.substring(0, firstMatchIndex).trim().replace(/[：:]\s*$/, '') 
    : undefined;
  
  return { prefix, items };
}

// 渲染解决方案的组件
function renderSolution(solution: string) {
  const parsed = parseNumberedList(solution);
  
  if (parsed && parsed.items.length > 0) {
    return (
      <div className="space-y-3">
        {parsed.prefix && (
          <p className="text-muted-foreground leading-7">{parsed.prefix}：</p>
        )}
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground leading-7">
          {parsed.items.map((item, index) => (
            <li key={index} className="pl-1">{item}</li>
          ))}
        </ul>
      </div>
    );
  }
  
  // 如果没有编号列表，按原样渲染（支持换行）
  return <p className="text-muted-foreground leading-7 whitespace-pre-line">{solution}</p>;
}

export default async function FAQPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.faq;
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-8 w-8 text-primary" />
          <h1 id="常见问题" className="scroll-m-20 text-4xl font-bold tracking-tight">{t('faq.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground leading-7">
          {t('faq.subtitle')}
        </p>
      </div>

      {/* 问题分类 */}
      <div className="space-y-8">
        {page.categories.map((category, categoryIndex) => {
          let questionIndex = 0;
          // 计算当前分类之前的问题总数
          for (let i = 0; i < categoryIndex; i++) {
            const prevCategory = page.categories[i];
            if (prevCategory?.questions) {
              questionIndex += prevCategory.questions.length;
            }
          }
          
          const categoryColors = [
            "bg-blue-100 text-blue-600",
            "bg-green-100 text-green-600",
            "bg-purple-100 text-purple-600",
            "bg-orange-100 text-orange-600",
            "bg-pink-100 text-pink-600",
            "bg-indigo-100 text-indigo-600"
          ];
          const colorClass = categoryColors[categoryIndex % categoryColors.length] ?? "bg-gray-100 text-gray-600";
          
          return (
            <div key={categoryIndex} className="space-y-6">
              <div className="space-y-2">
                <h2 id={category.name} className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
                    <HelpCircle className="h-5 w-5" />
                  </div>
                  {category.name}
                </h2>
                {category.description && (
                  <p className="text-muted-foreground leading-7">{category.description}</p>
                )}
              </div>
              
              <div className="space-y-4">
                {category.questions.map((item, itemIndex) => {
                  const globalIndex = questionIndex + itemIndex;
                  return (
                    <Card key={itemIndex} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                            {globalIndex + 1}
                          </div>
                          <CardTitle className="text-lg flex-1">{item.question}</CardTitle>
                        </div>
                      </CardHeader>
            <CardContent className="space-y-4">
              {/* 问题描述/原因 */}
              {"description" in item && typeof item.description === "string" && item.description && (
                <p className="text-muted-foreground leading-7">{item.description}</p>
              )}
              
              {/* 错误信息 */}
              {"error" in item && typeof item.error === "string" && item.error && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{t('faq.labels.error')}</p>
                  <CodeBlock code={item.error} language="text" />
                </div>
              )}
              
              {/* 解决方案 */}
              {"solution" in item && typeof item.solution === "string" && item.solution && (
                renderSolution(item.solution)
              )}
              
              {/* 命令/代码块 */}
              {"commands" in item && Array.isArray(item.commands) && item.commands.length > 0 && (
                <div className="space-y-3">
                  {item.commands.map((cmd: { label?: string; code: string; language?: string; description?: string }, cmdIndex: number) => (
                    <div key={cmdIndex} className="space-y-2">
                      {cmd.label && (
                        <p className="text-sm font-medium text-muted-foreground">{cmd.label}</p>
                      )}
                      <CodeBlock code={cmd.code} language={cmd.language ?? "bash"} />
                      {cmd.description && (
                        <p className="text-sm text-muted-foreground">{cmd.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* 配置说明 */}
              {"config" in item && Array.isArray(item.config) && item.config.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{t('faq.labels.config')}</p>
                  <div className="space-y-2">
                    {item.config.map((config: { name: string; description?: string }, configIndex: number) => (
                      <div key={configIndex} className="text-sm text-muted-foreground">
                        <span className="font-medium">{config.name}</span>
                        {config.description && <span>：{config.description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 其他说明 */}
              {"note" in item && typeof item.note === "string" && item.note && (
                <p className="text-sm text-muted-foreground leading-6">{item.note}</p>
              )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 仍有问题 */}
      <div className="space-y-6">
        <h2 id="仍有问题" className="text-2xl font-bold tracking-tight scroll-m-20 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          {page.stillHaveQuestions.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.stillHaveQuestions.description}
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {page.stillHaveQuestions.options.map((option, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{option.name}</CardTitle>
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
