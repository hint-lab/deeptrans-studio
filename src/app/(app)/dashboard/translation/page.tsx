import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import TextTranslationTable from "./components/text-translation-table";
import { useTranslations } from "next-intl";

const translationTable = () => {
  const t = useTranslations("Dashboard");

  return (
    <ScrollArea className="h-screen w-full">
      <div className="flex flex-col w-full">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground p-1">
          {t("textTranslation")}
        </h2>
        <p className="text-sm font-medium text-foreground p-1">
          {t("textTranslationDesc")}
        </p>
        <TextTranslationTable />
      </div>
    </ScrollArea>
  );
};

export default translationTable;
