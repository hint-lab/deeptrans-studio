"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslations } from 'next-intl';

export function TermBadge(props: {
  term: string;
  score?: number;
  enabled: boolean;
  isHit: boolean;
  origin?: string;
  onToggle: () => void;
  onCopy?: () => void;
}
) {
  const { term, score, enabled, isHit, origin, onToggle, onCopy } = props;
  const t = useTranslations('IDE.termBadge');

  const clsParts: string[] = ["cursor-pointer", "select-none"];
  let variant: "secondary" | "outline" = "secondary";

  if (!isHit) {
    if (enabled) {
      // Enabled + no dict hit → clear accent for dark/light
      variant = "secondary";
      clsParts.push(
        "border", "border-dashed", "border-indigo-400",
        "bg-indigo-100", "text-indigo-900",
        "dark:bg-indigo-900/40", "dark:text-indigo-100", "dark:border-indigo-500"
      );
    } else {
      variant = "outline";
      clsParts.push("border", "border-dashed", "bg-white", "text-foreground/60", "dark:bg-transparent", "dark:text-foreground/60");
    }
  } else if (origin === "apply:mt") {
    clsParts.push(
      "bg-amber-100", "text-amber-900",
      "dark:bg-amber-900/40", "dark:text-amber-100"
    );
  } else if (origin === "apply:copied") {
    clsParts.push(
      "bg-emerald-100", "text-emerald-900",
      "dark:bg-emerald-900/40", "dark:text-emerald-100"
    );
  }

  if (!enabled) {
    variant = "outline";
    clsParts.push("border", "border-dashed", "bg-white", "text-foreground/60", "dark:bg-transparent", "dark:text-foreground/60");
  }

  const cls = cn(...clsParts);

  return (
    <Badge
      variant={variant}
      className={cls}
      onClick={onToggle}
      onDoubleClick={onCopy}
      title={enabled ? t('clickToDisableDoubleClickToCopy') : t('clickToEnableDoubleClickToCopy')}
    >
      <span>{term}</span>
      {typeof score === 'number' && (
        <span className="ml-1 text-[10px] opacity-70">{Math.round(score * 100) / 100}</span>
      )}
    </Badge>
  );
}

export function AddTermBadge(props: {
  adding: boolean;
  value: string;
  setAdding: (v: boolean) => void;
  setValue: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const { adding, value, setAdding, setValue, onSubmit } = props;
  const t = useTranslations('IDE.termBadge');
  if (adding) {
    return (
      <div className="inline-flex items-center gap-1 border border-dashed rounded px-1 py-0.5 bg-white dark:bg-transparent">
        <input
          autoFocus
          className="text-xs outline-none bg-transparent w-32"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('enterNewTerm')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSubmit(value.trim());
              setValue('');
              setAdding(false);
            } else if (e.key === 'Escape') {
              setValue('');
              setAdding(false);
            }
          }}
          onBlur={() => { setValue(''); setAdding(false); }}
        />
      </div>
    );
  }
  return (
    <Badge
      variant="outline"
      className="cursor-pointer border border-dashed text-foreground/60 dark:text-foreground/60"
      onClick={() => setAdding(true)}
      title={t('addNewTerm')}
    >
      <span className="mr-1">＋</span>{t('add')}
    </Badge>
  );
}


