import React from 'react';
import { CheckIcon, PaperPlaneIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import { Wand } from 'lucide-react';
import { cn } from 'src/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatbarContent, useChatbarStream } from '@/hooks/useRightPanel';
import { useDialog } from '@/hooks/useDialog';
import MarkdownPreview from '@uiw/react-markdown-preview';
// Server Actions imports
import { baselineTranslateAction } from '@/actions/pre-translate';
import { extractMonolingualTermsAction, lookupDictionaryAction } from '@/actions/pre-translate';
import { evaluateSyntaxAction } from '@/actions/quality-assure';
import { evaluateDiscourseAction } from '@/actions/postedit';
import { queryDictionaryEntriesByScopeAction } from '@/actions/dictionary';
import { searchMemoryAction } from '@/actions/memories';

// 这些将被翻译替换
const agentConfigs = [
    { key: 'basicTranslation', avatar: '/avatars/01.png' },
    { key: 'termCheck', avatar: '/avatars/02.png' },
    { key: 'syntaxCheck', avatar: '/avatars/03.png' },
    { key: 'discourseCheck', avatar: '/avatars/04.png' },
    { key: 'dictionaryQuery', avatar: '/avatars/05.png' },
    { key: 'memoryQuery', avatar: '/avatars/06.png' },
] as const;

type AgentConfig = (typeof agentConfigs)[number];

interface Agent {
    key: string;
    name: string;
    description: string;
    avatar: string;
}

// 检测是否包含markdown格式
const hasMarkdownFormat = (content: string): boolean => {
    const markdownPatterns = [
        /#{1,6}\s/, // 标题 # ## ###
        /\*\*.*\*\*/, // 粗体 **text**
        /\*.*\*/, // 斜体 *text*
        /`.*`/, // 行内代码 `code`
        /```[\s\S]*```/, // 代码块 ```code```
        /^\s*[-*+]\s/m, // 列表 - * +
        /^\s*\d+\.\s/m, // 数字列表 1. 2.
        /\[.*\]\(.*\)/, // 链接 [text](url)
        /!\[.*\]\(.*\)/, // 图片 ![alt](url)
        /^\s*>/m, // 引用 >
        /^\s*\|.*\|/m, // 表格 |col1|col2|
    ];

    return markdownPatterns.some(pattern => pattern.test(content));
};

export function CardsChat() {
    const t = useTranslations('IDE.chat');
    const locale = useLocale();
    const { isDialogOpen, toggleDialog } = useDialog();
    const [selectedAgents, setSelectedAgents] = React.useState<Agent[]>([]);
    const { chatbarContent, updateContent, addMessage } = useChatbarContent();
    const [input, setInput] = React.useState('');
    const { handleStreamResponse } = useChatbarStream();

    // 智能体处理函数
    const handleAgentResponse = async (agentKey: string, userInput: string) => {
        try {
            let result: any;

            switch (agentKey) {
                case 'basicTranslation':
                    result = await baselineTranslateAction(userInput, 'zh', 'en', {
                        prompt: '请将以下文本翻译为英文',
                    });
                    break;

                case 'termCheck':
                    const terms = await extractMonolingualTermsAction(userInput, { locale });
                    const dict = await lookupDictionaryAction(terms, {});
                    result = `## 🔍 术语检查结果\n\n✅ **检查完成**\n- 发现术语：**${terms.length}** 个\n- 词典匹配：**${dict.length}** 个条目\n\n${terms.length > 0 ? `**提取的术语：**\n${terms.map((term: any, index: number) => `${index + 1}. ${term.term}`).join('\n')}` : '未发现术语'}`;
                    break;

                case 'syntaxCheck':
                    result = await evaluateSyntaxAction(userInput, '', {
                        targetLanguage: 'en',
                        locale,
                    });
                    break;

                case 'discourseCheck':
                    result = await evaluateDiscourseAction(userInput, '', {});
                    break;

                case 'dictionaryQuery':
                    const dictResult = await queryDictionaryEntriesByScopeAction(userInput, {
                        limit: 5,
                    });
                    if (dictResult.success && dictResult.data && dictResult.data.length > 0) {
                        result = `## 📚 词典查询结果\n\n${dictResult.data
                            .map(
                                (item: any, index: number) =>
                                    `${index + 1}. **${item.term}** → ${item.translation}`
                            )
                            .join('\n')}`;
                    } else {
                        result = '❌ 词典查询失败或未找到相关条目';
                    }
                    break;

                case 'memoryQuery':
                    const memoryResult = await searchMemoryAction(userInput, { limit: 5 });
                    if (memoryResult.success && memoryResult.data && memoryResult.data.length > 0) {
                        result = `## 🧠 记忆库查询结果\n\n${memoryResult.data
                            .map(
                                (item: any, index: number) =>
                                    `${index + 1}. **${item.source}** → ${item.target}`
                            )
                            .join('\n')}`;
                    } else {
                        result = '❌ 记忆库查询失败或未找到相关条目';
                    }
                    break;

                default:
                    result = '未知的智能体类型';
            }

            addMessage({
                role: 'assistant',
                content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            });
        } catch (error) {
            console.error('智能体处理失败:', error);
            addMessage({
                role: 'assistant',
                content: `处理失败: ${error instanceof Error ? error.message : '未知错误'}`,
            });
        }
    };

    // 创建带翻译的agents数组
    const agents: Agent[] = React.useMemo(
        () =>
            agentConfigs.map(config => ({
                key: config.key,
                name: t(`agents.${config.key}`),
                description: t(`agents.${config.key}Desc`),
                avatar: config.avatar,
            })),
        [t]
    );
    const examples = React.useMemo(
        () => [t('examples.polish'), t('examples.translate'), t('examples.summarize')],
        [t]
    );

    return (
        <div className="flex size-full flex-col bg-background">
            {/* 头部 - 与IDE风格一致 */}
            <div className="flex h-8 items-center justify-between border-b bg-muted/40 px-2 py-2 text-[11px] text-foreground/70">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-medium">{t('title')}</span>
                    <Wand size="12" className="text-foreground/50" />
                </div>
                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] hover:bg-accent"
                                onClick={() => toggleDialog()}
                            >
                                <PlusIcon className="mr-1 h-3 w-3" />
                                {t('newConversation')}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={10}>{t('newConversation')}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* 聊天内容区域 */}
            <div className="flex-1 space-y-3 overflow-y-auto p-2">
                {chatbarContent.length === 0 && (
                    <div className="rounded-md border bg-muted/30 p-3 text-xs">
                        <div className="mb-1 font-medium text-foreground">
                            {t('welcomeMessage.title')}
                        </div>
                        <div className="mb-3 text-[11px] text-muted-foreground">
                            {t('welcomeMessage.description')}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {examples.map(ex => (
                                <Button
                                    key={ex}
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setInput(ex)}
                                    className="min-h-6 max-w-full whitespace-normal break-words px-2 py-1 text-left text-[10px] leading-tight transition-colors hover:bg-accent"
                                >
                                    <span className="block w-full text-left">{ex}</span>
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {chatbarContent.map((message, index) => {
                    const isUser = message.role === 'user';
                    return (
                        <div
                            key={index}
                            className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                        >
                            <div
                                className={cn(
                                    'flex max-w-[90%] items-start gap-2',
                                    isUser ? 'flex-row-reverse' : 'flex-row'
                                )}
                            >
                                <Avatar className="mt-0.5 h-6 w-6">
                                    <AvatarImage src={isUser ? undefined : '/avatars/02.png'} />
                                    <AvatarFallback
                                        className={cn(
                                            'h-6 w-6 text-[9px]',
                                            isUser
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-foreground/70'
                                        )}
                                    >
                                        {isUser ? t('userAvatar') : t('aiAvatar')}
                                    </AvatarFallback>
                                </Avatar>
                                <div
                                    className={cn(
                                        'max-w-full select-text whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5 text-xs',
                                        isUser
                                            ? 'bg-primary text-primary-foreground'
                                            : 'border border-border/50 bg-muted/50 text-foreground'
                                    )}
                                >
                                    {!isUser && hasMarkdownFormat(message.content) ? (
                                        <div className="markdown-content text-xs leading-none [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-xs [&_.wmde-markdown]:!leading-none [&_.wmde-markdown]:!text-foreground [&_.wmde-markdown_*]:!my-0 [&_.wmde-markdown_*]:!bg-transparent [&_.wmde-markdown_*]:!text-xs [&_.wmde-markdown_*]:!leading-none [&_.wmde-markdown_*]:!text-foreground [&_.wmde-markdown_a]:!bg-transparent [&_.wmde-markdown_a]:!text-primary [&_.wmde-markdown_a]:!underline [&_.wmde-markdown_blockquote]:!my-0 [&_.wmde-markdown_blockquote]:!mb-0 [&_.wmde-markdown_blockquote]:!mt-0 [&_.wmde-markdown_blockquote]:!border-l-2 [&_.wmde-markdown_blockquote]:!border-border/30 [&_.wmde-markdown_blockquote]:!bg-muted/10 [&_.wmde-markdown_blockquote]:!py-0.5 [&_.wmde-markdown_blockquote]:!pl-2 [&_.wmde-markdown_blockquote]:!text-xs [&_.wmde-markdown_blockquote]:!italic [&_.wmde-markdown_blockquote]:!text-foreground [&_.wmde-markdown_code]:!rounded [&_.wmde-markdown_code]:!border [&_.wmde-markdown_code]:!border-border/20 [&_.wmde-markdown_code]:!bg-muted/30 [&_.wmde-markdown_code]:!px-1 [&_.wmde-markdown_code]:!py-0.5 [&_.wmde-markdown_code]:!font-mono [&_.wmde-markdown_code]:!text-xs [&_.wmde-markdown_code]:!text-foreground [&_.wmde-markdown_em]:!bg-transparent [&_.wmde-markdown_em]:!italic [&_.wmde-markdown_em]:!text-foreground [&_.wmde-markdown_h1]:!mb-0 [&_.wmde-markdown_h1]:!mt-0 [&_.wmde-markdown_h1]:!bg-transparent [&_.wmde-markdown_h1]:!text-xs [&_.wmde-markdown_h1]:!font-bold [&_.wmde-markdown_h1]:!text-foreground [&_.wmde-markdown_h2]:!mb-0 [&_.wmde-markdown_h2]:!mt-0 [&_.wmde-markdown_h2]:!bg-transparent [&_.wmde-markdown_h2]:!text-xs [&_.wmde-markdown_h2]:!font-semibold [&_.wmde-markdown_h2]:!text-foreground [&_.wmde-markdown_h3]:!mb-0 [&_.wmde-markdown_h3]:!mt-0 [&_.wmde-markdown_h3]:!bg-transparent [&_.wmde-markdown_h3]:!text-xs [&_.wmde-markdown_h3]:!font-medium [&_.wmde-markdown_h3]:!text-foreground [&_.wmde-markdown_h4]:!mb-0 [&_.wmde-markdown_h4]:!mt-0 [&_.wmde-markdown_h4]:!bg-transparent [&_.wmde-markdown_h4]:!text-xs [&_.wmde-markdown_h4]:!font-medium [&_.wmde-markdown_h4]:!text-foreground [&_.wmde-markdown_h5]:!mb-0 [&_.wmde-markdown_h5]:!mt-0 [&_.wmde-markdown_h5]:!bg-transparent [&_.wmde-markdown_h5]:!text-xs [&_.wmde-markdown_h5]:!font-medium [&_.wmde-markdown_h5]:!text-foreground [&_.wmde-markdown_h6]:!mb-0 [&_.wmde-markdown_h6]:!mt-0 [&_.wmde-markdown_h6]:!bg-transparent [&_.wmde-markdown_h6]:!text-xs [&_.wmde-markdown_h6]:!font-medium [&_.wmde-markdown_h6]:!text-foreground [&_.wmde-markdown_hr]:!my-1 [&_.wmde-markdown_hr]:!border-border/30 [&_.wmde-markdown_hr]:!bg-transparent [&_.wmde-markdown_li]:!mb-0 [&_.wmde-markdown_li]:!bg-transparent [&_.wmde-markdown_li]:!text-xs [&_.wmde-markdown_li]:!leading-none [&_.wmde-markdown_li]:!text-foreground [&_.wmde-markdown_ol]:!mb-0 [&_.wmde-markdown_ol]:!mt-0 [&_.wmde-markdown_ol]:!bg-transparent [&_.wmde-markdown_ol]:!pl-3 [&_.wmde-markdown_ol]:!text-xs [&_.wmde-markdown_ol]:!text-foreground [&_.wmde-markdown_p]:!my-0 [&_.wmde-markdown_p]:!mb-0 [&_.wmde-markdown_p]:!mt-0 [&_.wmde-markdown_p]:!bg-transparent [&_.wmde-markdown_p]:!text-xs [&_.wmde-markdown_p]:!leading-none [&_.wmde-markdown_p]:!text-foreground [&_.wmde-markdown_pre]:!my-0 [&_.wmde-markdown_pre]:!mb-0 [&_.wmde-markdown_pre]:!mt-0 [&_.wmde-markdown_pre]:!overflow-x-auto [&_.wmde-markdown_pre]:!rounded [&_.wmde-markdown_pre]:!border [&_.wmde-markdown_pre]:!border-border/30 [&_.wmde-markdown_pre]:!bg-muted/30 [&_.wmde-markdown_pre]:!p-1 [&_.wmde-markdown_pre]:!text-xs [&_.wmde-markdown_pre]:!text-foreground [&_.wmde-markdown_strong]:!bg-transparent [&_.wmde-markdown_strong]:!font-semibold [&_.wmde-markdown_strong]:!text-foreground [&_.wmde-markdown_table]:!w-full [&_.wmde-markdown_table]:!border-collapse [&_.wmde-markdown_table]:!bg-transparent [&_.wmde-markdown_table]:!text-xs [&_.wmde-markdown_td]:!border [&_.wmde-markdown_td]:!border-border/30 [&_.wmde-markdown_td]:!bg-transparent [&_.wmde-markdown_td]:!px-1 [&_.wmde-markdown_td]:!py-0.5 [&_.wmde-markdown_td]:!text-xs [&_.wmde-markdown_td]:!text-foreground [&_.wmde-markdown_th]:!border [&_.wmde-markdown_th]:!border-border/30 [&_.wmde-markdown_th]:!bg-muted/20 [&_.wmde-markdown_th]:!px-1 [&_.wmde-markdown_th]:!py-0.5 [&_.wmde-markdown_th]:!text-xs [&_.wmde-markdown_th]:!font-medium [&_.wmde-markdown_th]:!text-foreground [&_.wmde-markdown_ul]:!mb-0 [&_.wmde-markdown_ul]:!mt-0 [&_.wmde-markdown_ul]:!bg-transparent [&_.wmde-markdown_ul]:!pl-3 [&_.wmde-markdown_ul]:!text-xs [&_.wmde-markdown_ul]:!text-foreground">
                                            <MarkdownPreview source={message.content} />
                                        </div>
                                    ) : message.content.trim() === t('processing') ? (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <div className="flex space-x-1">
                                                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]"></div>
                                                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]"></div>
                                                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"></div>
                                            </div>
                                            <span className="text-xs">正在思考...</span>
                                        </div>
                                    ) : (
                                        <span>{message.content}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 输入区域 - 与IDE风格一致 */}
            <div className="border-t bg-muted/20 p-2">
                {/* 选中的智能体指示器 */}
                {selectedAgents.length > 0 && (
                    <div className="mb-2 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">使用智能体:</span>
                        {selectedAgents.map(agent => (
                            <div
                                key={agent.key}
                                className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                            >
                                <Avatar className="h-4 w-4">
                                    <AvatarImage src={agent.avatar} />
                                    <AvatarFallback className="text-[8px]">
                                        {agent.name[0]}
                                    </AvatarFallback>
                                </Avatar>
                                <span>{agent.name}</span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-4 w-4 p-0 hover:bg-primary/20"
                                    onClick={() =>
                                        setSelectedAgents(
                                            selectedAgents.filter(a => a.key !== agent.key)
                                        )
                                    }
                                >
                                    <TrashIcon className="h-2 w-2" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
                <form
                    onSubmit={async event => {
                        event.preventDefault();
                        if (input.trim().length === 0) return;
                        addMessage({ role: 'user', content: input });
                        const userInput = input;
                        setInput('');

                        // 如果有选中的智能体，使用智能体处理
                        if (selectedAgents.length > 0 && selectedAgents[0]) {
                            // 使用选中的智能体（单选）
                            await handleAgentResponse(selectedAgents[0].key, userInput);
                        } else {
                            // 否则使用普通的AI聊天
                            try {
                                await handleStreamResponse(
                                    {
                                        url: '/api/chat',
                                        data: { prompt: userInput, locale: locale },
                                    },
                                    { initialMessage: t('processing') }
                                );
                            } catch {}
                        }
                    }}
                    className="flex w-full items-center gap-2"
                >
                    <Input
                        id="message"
                        placeholder={t('placeholder')}
                        className="h-7 flex-1 border-border/50 text-xs focus:border-primary/50"
                        autoComplete="off"
                        autoFocus
                        value={input}
                        onChange={event => setInput(event.target.value)}
                        onKeyDown={e => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault();
                                const form = (e.currentTarget as HTMLInputElement).form;
                                if (form) {
                                    form.requestSubmit();
                                }
                            }
                        }}
                    />
                    <Button
                        type="submit"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={input.trim().length === 0}
                    >
                        <PaperPlaneIcon className="h-3 w-3" />
                    </Button>
                </form>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={toggleDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-sm">{t('newMessage')}</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            {t('chatWithAI')}
                        </DialogDescription>
                    </DialogHeader>
                    <Command className="rounded-md border">
                        <CommandInput placeholder="搜索智能体..." className="text-xs" />
                        <CommandList>
                            <CommandEmpty className="py-2 text-xs text-muted-foreground">
                                未找到智能体
                            </CommandEmpty>
                            <CommandGroup className="p-1">
                                {agents.map(agent => (
                                    <CommandItem
                                        key={agent.key}
                                        className="flex items-center px-2 py-1.5 text-xs"
                                        onSelect={() => {
                                            if (selectedAgents.includes(agent)) {
                                                // 如果已选择，则取消选择
                                                setSelectedAgents([]);
                                            } else {
                                                // 如果未选择，则只选择这一个智能体（单选）
                                                setSelectedAgents([agent]);
                                            }
                                        }}
                                    >
                                        <Avatar className="mr-2 h-6 w-6">
                                            <AvatarImage src={agent.avatar} alt="Image" />
                                            <AvatarFallback className="text-[9px]">
                                                {agent.name[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium leading-none">
                                                {agent.name}
                                            </p>
                                            <p className="truncate text-[10px] text-muted-foreground">
                                                {agent.description}
                                            </p>
                                        </div>
                                        {selectedAgents.includes(agent) ? (
                                            <CheckIcon className="ml-auto h-3 w-3 text-primary" />
                                        ) : null}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                    <DialogFooter className="flex items-center justify-between pt-3">
                        {selectedAgents.length > 0 ? (
                            <div className="flex -space-x-1">
                                {selectedAgents.map(agent => (
                                    <Avatar
                                        key={agent.key}
                                        className="h-6 w-6 border border-background"
                                    >
                                        <AvatarImage src={agent.avatar} />
                                        <AvatarFallback className="text-[9px]">
                                            {agent.name[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                {t('selectAgentPrompt')}
                            </p>
                        )}
                        <Button
                            disabled={selectedAgents.length < 1}
                            onClick={toggleDialog}
                            size="sm"
                            className="text-xs"
                        >
                            {t('continue')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
