"use client";
import { Copy } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("Common");
  
  return (
    <div className="group relative rounded-lg border border-primary/20 bg-primary/5">
      <pre className="overflow-x-auto p-4 text-xs leading-6">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <button
        className="absolute right-2 top-2 inline-flex h-8 items-center gap-1 rounded-md border border-primary/20 bg-background/80 px-2 text-xs text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 hover:text-foreground"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        aria-label={t("copyCode")}
      >
        <Copy className="h-3.5 w-3.5" /> {copied ? t("copied") : t("copy")}
      </button>
    </div>
  );
}


