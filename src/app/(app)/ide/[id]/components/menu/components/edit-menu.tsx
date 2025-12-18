import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator } from "@/components/ui/menubar";
import { useTargetEditor } from "@/hooks/useEditor";
import { useActiveDocumentItem } from "@/hooks/useActiveDocumentItem";
import { updateDocItemStatusAction } from "@/actions/document-item";
import { useTranslationState } from "@/hooks/useTranslation";
import { useTranslations } from 'next-intl';
import { toast } from "sonner";
import { useState } from "react";
import type { TranslationStage } from "@/store/features/translationSlice";
import { useExplorerTabs } from "@/hooks/useExplorerTabs"; // 新增导入

export function EditMenu() {
    const t = useTranslations('IDE.menu');
    const tEditor = useTranslations('IDE.editor');
    const target = useTargetEditor();
    const { activeDocumentItem } = useActiveDocumentItem();
    const { currentStage, setCurrentStage } = useTranslationState();
    const { updateDocumentItemStatus } = useExplorerTabs(); // 新增：获取更新函数
    const [isProcessing, setIsProcessing] = useState(false);
    
    // 定义有效的阶段键类型
    type TranslationStageKey = Exclude<TranslationStage, null>;
    
    // 类型守卫函数
    const isValidStage = (stage: TranslationStage | null): stage is TranslationStageKey => {
        return stage !== null && stage !== undefined;
    };

    // 完整的阶段映射
    const stageMapping = {
        // 前进映射 [当前阶段]: 下一阶段
        forward: {
            'NOT_STARTED': 'MT',
            'MT': 'MT_REVIEW',
            'MT_REVIEW': 'QA',
            'QA': 'QA_REVIEW',
            'QA_REVIEW': 'POST_EDIT',
            'POST_EDIT': 'POST_EDIT_REVIEW',
            'POST_EDIT_REVIEW': 'SIGN_OFF',
            'SIGN_OFF': 'COMPLETED',
        } as Record<TranslationStageKey, TranslationStageKey>,
        
        // 回退映射 [当前阶段]: 上一阶段
        backward: {
            'MT': 'NOT_STARTED',
            'MT_REVIEW': 'MT',
            'QA': 'MT_REVIEW',
            'QA_REVIEW': 'QA',
            'POST_EDIT': 'QA_REVIEW',
            'POST_EDIT_REVIEW': 'POST_EDIT',
            'SIGN_OFF': 'POST_EDIT_REVIEW',
            'COMPLETED': 'SIGN_OFF',
        } as Record<TranslationStageKey, TranslationStageKey>
    };

    const undo = () => target.editor?.chain().focus().undo().run();
    const redo = () => target.editor?.chain().focus().redo().run();
    const cut = () => document.execCommand('cut');
    const copy = () => document.execCommand('copy');
    const paste = () => document.execCommand('paste');

    const handleRollback = async () => {
        const id = (activeDocumentItem as any)?.id;
        if (!id) {
            toast.error("没有激活的文档项");
            return;
        }

        // 使用类型守卫检查
        if (!isValidStage(currentStage) || currentStage === 'NOT_STARTED') {
            toast.info("已经是初始状态，无法回退");
            return;
        }

        const prevStage = stageMapping.backward[currentStage];
        if (!prevStage) {
            toast.error(`无法从 ${currentStage} 状态回退`);
            return;
        }

        setIsProcessing(true);
        try {
            // 1. 更新数据库状态
            await updateDocItemStatusAction(id, prevStage);
            
            // 2. 更新侧边栏状态
            updateDocumentItemStatus(id, prevStage);
            
            // 3. 更新当前组件状态
            setCurrentStage(prevStage);
            
            toast.success(`已回退到 ${prevStage} 状态`);
        } catch (error) {
            console.error("回退失败:", error);
            toast.error("回退失败，请稍后重试");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAdvance = async () => {
        const id = (activeDocumentItem as any)?.id;
        if (!id) {
            toast.error("没有激活的文档项");
            return;
        }

        // 使用类型守卫检查
        if (!isValidStage(currentStage) || currentStage === 'COMPLETED') {
            toast.info("已经是完成状态，无法前进");
            return;
        }

        const nextStage = stageMapping.forward[currentStage];
        if (!nextStage) {
            toast.error(`无法从 ${currentStage} 状态前进`);
            return;
        }

        setIsProcessing(true);
        try {
            // 1. 更新数据库状态
            await updateDocItemStatusAction(id, nextStage);
            
            // 2. 更新侧边栏状态
            updateDocumentItemStatus(id, nextStage);
            
            // 3. 更新当前组件状态
            setCurrentStage(nextStage);
            
            // 根据新状态提供相应提示
            const stageMessages: Record<TranslationStageKey, string> = {
                'NOT_STARTED': "未开始",
                'MT': "已进入预翻译阶段",
                'MT_REVIEW': "请复核预翻译结果",
                'QA': "已进入质量评估阶段",
                'QA_REVIEW': "请复核质量评估结果",
                'POST_EDIT': "已进入译后编辑阶段",
                'POST_EDIT_REVIEW': "请复核译后编辑结果",
                'SIGN_OFF': "已进入签发阶段",
                'COMPLETED': "翻译流程已完成",
                'ERROR': "状态异常，请检查",
            };
            
            toast.success(stageMessages[nextStage] || `已前进到 ${nextStage} 状态`);
        } catch (error) {
            console.error("前进失败:", error);
            toast.error("前进失败，请稍后重试");
        } finally {
            setIsProcessing(false);
        }
    };

    // 检查按钮是否应该禁用 - 使用类型守卫
    const canRollback = isValidStage(currentStage) && currentStage !== 'NOT_STARTED' && stageMapping.backward[currentStage];
    const canAdvance = isValidStage(currentStage) && currentStage !== 'COMPLETED' && stageMapping.forward[currentStage];

    return (
        <MenubarMenu>
            <MenubarTrigger>
                <span className="flex items-center whitespace-nowrap gap-2 cursor-pointer hover:opacity-90">
                    {t('edit')}
                    {isProcessing && " (处理中...)"}
                </span>
            </MenubarTrigger>
            <MenubarContent>
                <MenubarItem onClick={undo} disabled={isProcessing}>
                    {tEditor('undo')}
                </MenubarItem>
                <MenubarItem onClick={redo} disabled={isProcessing}>
                    {tEditor('redo')}
                </MenubarItem>
                <MenubarItem onClick={cut} disabled={isProcessing}>
                    {tEditor('cut')}
                </MenubarItem>
                <MenubarItem onClick={copy} disabled={isProcessing}>
                    {tEditor('copy')}
                </MenubarItem>
                <MenubarItem onClick={paste} disabled={isProcessing}>
                    {tEditor('paste')}
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem 
                    onClick={handleRollback} 
                    disabled={!canRollback || isProcessing}
                    className={!canRollback ? "opacity-50 cursor-not-allowed" : ""}
                >
                    {tEditor('rollback')}
                    <span className="ml-2 text-xs text-muted-foreground">
                        {canRollback && isValidStage(currentStage) ? `→ ${stageMapping.backward[currentStage]}` : ""}
                    </span>
                </MenubarItem>
                <MenubarItem 
                    onClick={handleAdvance} 
                    disabled={!canAdvance || isProcessing}
                    className={!canAdvance ? "opacity-50 cursor-not-allowed" : ""}
                >
                    {tEditor('advance')}
                    <span className="ml-2 text-xs text-muted-foreground">
                        {canAdvance && isValidStage(currentStage) ? `→ ${stageMapping.forward[currentStage]}` : ""}
                    </span>
                </MenubarItem>
            </MenubarContent>
        </MenubarMenu>
    );
}