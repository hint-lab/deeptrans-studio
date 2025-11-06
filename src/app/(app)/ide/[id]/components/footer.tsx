import { useEffect, useState } from "react";
import { useExplorerTabs } from "@/hooks/useExplorerTabs";
import { useTranslations } from 'next-intl';

type Tasks = "preTrans" | "polishTrans" | "verifyTrans" | "none";

const Footer = () => {
  const t = useTranslations('IDE');

  const [currentTask, setCurrentTask] = useState<Tasks>("none");

  const [progress, setProgress] = useState<number>(0);
  const [counts, setCounts] = useState<Record<string, number>>({ NOT_STARTED: 0, MT: 0, QA: 0, POST_EDIT: 0, SIGN_OFF: 0 });
  const { explorerTabs } = useExplorerTabs();

  // 基于当前文档项状态，计算整体进度与分布
  useEffect(() => {
    const tabs = explorerTabs?.documentTabs ?? [];
    const allItems = tabs.flatMap((t) => t.items ?? []);
    const total = allItems.length;
    if (!total) {
      setProgress(0);
      setCounts({ NOT_STARTED: 0, MT: 0, QA: 0, POST_EDIT: 0, SIGN_OFF: 0 });
      return;
    }
    // 映射TranslationStage到统计分类
    const stageToLegacy: Record<string, string> = {
      'NOT_STARTED': 'NOT_STARTED',
      'MT': 'MT',
      'MT_REVIEW': 'MT',
      'QA': 'QA',
      'QA_REVIEW': 'QA',
      'POST_EDIT': 'POST_EDIT',
      'POST_EDIT_REVIEW': 'POST_EDIT',
      'SIGN_OFF': 'SIGN_OFF',
      'COMPLETED': 'SIGN_OFF',
      'ERROR': 'NOT_STARTED',
      'CANCELED': 'NOT_STARTED'
    };
    const init: Record<string, number> = { NOT_STARTED: 0, MT: 0, QA: 0, POST_EDIT: 0, SIGN_OFF: 0 };
    const nextCounts = allItems.reduce((acc: Record<string, number>, it: any) => {
      const status = (it?.status as string) || 'NOT_STARTED';
      const legacyKey = stageToLegacy[status] || 'NOT_STARTED';
      acc[legacyKey] = (acc[legacyKey] || 0) + 1;
      return acc;
    }, init);
    setCounts(nextCounts);
    const approvedCount = (nextCounts['SIGN_OFF'] || 0);
    const approvedPercent = Math.round((approvedCount / total) * 100);
    setProgress(approvedPercent);
  }, [explorerTabs]);
  return (
    <footer className="w-full h-6">
      <div className="flex items-center w-full h-full gap-3 px-3">
        {/* 左：浅紫线性进度条 */}
        <div className="relative flex-1 h-full ">
          <div className="absolute inset-y-0 left-0 right-0 flex items-center">
            <div className={`w-full h-2 rounded overflow-hidden font-semibold ${progress >= 100 ? 'bg-emerald-200 dark:bg-emerald-900/30' : 'bg-indigo-200 dark:bg-indigo-900/40'}`}>
              <div className={`h-full bg-gradient-to-r font-semibold  ${progress >= 100 ? 'from-emerald-400 to-emerald-600' : 'from-indigo-400 to-indigo-600'}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
          {/* 进度值叠加显示 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] leading-none text-foreground/80">{progress}%</span>
          </div>
        </div>
        {/* 右：各子状态统计（常显） */}
        <div className="shrink-0 flex items-center gap-2 text-[10px] leading-[10px] pr-8">
          <span className="inline-flex items-center gap-1 text-foreground/70"><span className="inline-block w-2 h-2 rounded bg-gray-400" />{t('statusProgress.waiting')} {counts.NOT_STARTED}</span>
          <span className="inline-flex items-center gap-1 text-fuchsia-600"><span className="inline-block w-2 h-2 rounded bg-fuchsia-500" />{t('statusProgress.pretrans')} {counts.MT}</span>
          <span className="inline-flex items-center gap-1 text-purple-600"><span className="inline-block w-2 h-2 rounded bg-purple-600" />{t('statusProgress.qa')} {counts.QA}</span>
          <span className="inline-flex items-center gap-1 text-violet-600"><span className="inline-block w-2 h-2 rounded bg-violet-500" />{t('statusProgress.postedit')} {counts.POST_EDIT}</span>
          <span className="inline-flex items-center gap-1 text-blue-600"><span className="inline-block w-2 h-2 rounded bg-blue-500" />{t('statusProgress.signoff')} {counts.SIGN_OFF}</span>

        </div>
      </div>
    </footer>
  );
};

export default Footer;
