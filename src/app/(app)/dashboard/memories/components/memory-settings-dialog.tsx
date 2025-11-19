"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { updateMemoryLanguagesAction } from "@/actions/memories";
import { LANGUAGES } from "@/constants/languages";
import { useTranslations } from "next-intl";

export function MemorySettingsDialog({ open, onOpenChange, memoryId, onUpdated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memoryId: string;
  onUpdated?: () => void;
}) {
  const m = useTranslations("Dashboard.Memories.SettingsDialog");
  const common = useTranslations("Common");
  const langT = useTranslations("Common.languages");
  const [sourceLang, setSourceLang] = useState<string>("");
  const [targetLang, setTargetLang] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const languages = LANGUAGES;

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await updateMemoryLanguagesAction(memoryId, { sourceLang, targetLang });
      if (!res.success) throw new Error(res.error || m('updateFailed'));
      toast.success(m('updatedLanguagePair'));
      onUpdated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(common('error'), { description: e?.message || String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{m('sourceLanguage')}</Label>
              <Select value={sourceLang} onValueChange={setSourceLang}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={m('selectSourceLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(l => (
                    <SelectItem key={l.key} value={l.key}>{langT(l.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{m('targetLanguage')}</Label>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={m('selectTargetLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(l => (
                    <SelectItem key={l.key} value={l.key}>{langT(l.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{common('cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !memoryId}>{common('save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


