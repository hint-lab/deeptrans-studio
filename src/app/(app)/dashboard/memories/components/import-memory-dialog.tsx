"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Eye, Settings, CheckCircle2 } from "lucide-react";
import { LANGUAGES } from "@/constants/languages";
import { toast } from "sonner";
import { importMemoryFromForm, listMemoriesAction } from "@/actions/memories";
import { useTranslations } from "next-intl";
export function ImportMemoryDialog({ onCompleted }: { onCompleted?: () => void }) {
  const t = useTranslations("Dashboard.Memories.ImportDialog");
  const common = useTranslations("Common");
  const langsT = useTranslations("Common.languages");
  const languages = LANGUAGES;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [memoryId, setMemoryId] = useState("");
  const [memories, setMemories] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [sourceKey, setSourceKey] = useState('source');
  const [targetKey, setTargetKey] = useState('target');
  const [notesKey, setNotesKey] = useState('notes');
  const [submitting, setSubmitting] = useState(false);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [submittingUI, setSubmittingUI] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [stage, setStage] = useState<'embedding' | 'milvus' | 'complete'>('embedding');

  // 打开对话框时加载记忆库列表
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingMemories(true);
        const res = await listMemoriesAction() as any;
        if (!cancelled && res?.success && Array.isArray(res.data)) {
          setMemories(res.data.map((m: any) => ({ id: m.id, name: m.name })));
        }
      } catch {
      } finally {
        if (!cancelled) setLoadingMemories(false);
      }
    })();
    return () => { cancelled = true };
  }, [open]);

  const detectMapping = (headers: string[]) => {
    const norm = (s: string) => String(s || '').trim().toLowerCase();
    const hs = headers.map(norm);
    const findAny = (cands: string[]) => {
      for (const c of cands) {
        const idx = hs.indexOf(norm(c));
        if (idx >= 0) return headers[idx];
      }
      return '';
    };
    const s = findAny(['source', 'src', '源', '原文']);
    const t = findAny(['target', 'tgt', '译', '译文']);
    const n = findAny(['notes', 'note', '备注']);
    if (s) setSourceKey(s);
    if (t) setTargetKey(t);
    if (n) setNotesKey(n);
  };

  const handleFileChange = async (f: File | null) => {
    setFile(f);
    setPreviewLines([]);
    if (!f) return;
    try {
      const name = f.name.toLowerCase();
      const ext = name.slice(name.lastIndexOf('.') + 1);
      if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sn = wb.SheetNames[0];
        const ws = sn ? wb.Sheets[sn] : undefined;
        const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
        if (rows.length > 0) detectMapping(Object.keys(rows[0]));
        setPreviewLines(rows.slice(0, 10).map((r) => JSON.stringify(r)));
      } else if (ext === 'csv' || ext === 'tsv') {
        const txt = await f.text();
        const lines = txt.split(/\r?\n/).filter(Boolean);
        if (lines.length > 0) {
          const headerLine = lines[0] ?? '';
          const header = headerLine.split(/,|\t/).map((h) => h.trim());
          detectMapping(header);
        }
        setPreviewLines(lines.slice(0, 10));
      } else if (ext === 'tmx' || ext === 'xml') {
        const txt = await f.text();
        setPreviewLines(txt.split(/\r?\n/).slice(0, 10));
      } else {
        setPreviewLines([`不支持的文件类型: .${ext}`]);
      }
    } catch (e: any) {
      setPreviewLines([`预览失败: ${e?.message || String(e)}`]);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error("提示", { description: "请先选择文件" });
      return;
    }

    setSubmitting(true);
    setSubmittingUI(true);
    setProgress(0);
    setCurrentBatch(0);
    setTotalBatches(0);
    setStage('embedding');

    try {
      const form = new FormData();
      form.append('file', file);
      if (memoryId) form.append('memoryId', memoryId);
      if (sourceLang) form.append('sourceLang', sourceLang);
      if (targetLang) form.append('targetLang', targetLang);
      if (sourceKey) form.append('sourceKey', sourceKey);
      if (targetKey) form.append('targetKey', targetKey);
      if (notesKey) form.append('notesKey', notesKey);

      // 使用流式 API 获取实时进度
      const response = await fetch('/api/memories/import-progress', {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        throw new Error('导入请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let result: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'init') {
                setTotalBatches(data.totalBatches);
                setStage(data.stage);
              } else if (data.type === 'progress') {
                setCurrentBatch(data.currentBatch);
                setTotalBatches(data.totalBatches);
                setProgress(data.progress);
                setStage(data.stage);
              } else if (data.type === 'complete') {
                setProgress(100);
                setStage('complete');
                result = data.result;
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // 忽略解析错误，继续处理下一行
            }
          }
        }
      }

      if (!result?.success) {
        throw new Error(result?.error || '导入失败');
      }

      toast.success('导入完成', { description: `成功导入 ${result.data.total} 条记忆` });

      // 延迟关闭对话框，让用户看到完成状态
      setTimeout(() => {
        setOpen(false);
        setFile(null);
        onCompleted?.();
      }, 1000);

    } catch (e: any) {
      toast.error("错误", { description: e.message || String(e) });
    } finally {
      setSubmitting(false);
      // 延迟重置 UI 状态
      setTimeout(() => {
        setSubmittingUI(false);
        setProgress(0);
        setCurrentBatch(0);
        setTotalBatches(0);
      }, 2000);
    }
  };

  const getFileTypeIcon = () => {
    if (!file) return <FileText className="h-4 w-4" />;
    const name = file.name.toLowerCase();
    if (/(xlsx|xls|csv|tsv)$/.test(name)) return <span className="text-green-600">📊</span>;
    if (/(tmx|xml)$/.test(name)) return <span className="text-blue-600">📋</span>;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t("open")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {submittingUI && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  <span className="text-amber-800">
                    {stage === 'embedding' && t('embedding')}
                    {stage === 'milvus' && t('milvus')}
                    {stage === 'complete' && t('complete')}
                  </span>
                </div>

                {totalBatches > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-amber-700">
                      <span>{t('progressBatches', { current: currentBatch, total: totalBatches })}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-amber-200 rounded-full h-2">
                      <div
                        className="bg-amber-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('fileAndMappingSettings')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">{t('targetMemoryOptional')}</Label>
                  <Select value={memoryId} onValueChange={(v) => setMemoryId(v)}>
                    <SelectTrigger className="h-9" disabled={submitting || loadingMemories}>
                      <SelectValue placeholder={loadingMemories ? t('loadingMemories') : t('selectMemoryOptional')} />
                    </SelectTrigger>
                    <SelectContent>
                      {memories.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">{t('selectFile')}</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".tmx,.csv,.tsv,.xml,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className="h-9"
                    disabled={submitting}
                  />
                  {file && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      {getFileTypeIcon()}
                      <Badge variant="secondary" className="text-xs">
                        {file.name.split('.').pop()?.toUpperCase()}
                      </Badge>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('supportedFileTypes')}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t('sourceLanguageOptional')}</Label>
                  <Select value={sourceLang} onValueChange={(v) => setSourceLang(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t('selectSourceLanguageOptional')} />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((l) => (
                        <SelectItem key={l.key} value={l.key}>{langsT(l.key)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('targetLanguageOptional')}</Label>
                  <Select value={targetLang} onValueChange={(v) => setTargetLang(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t('selectTargetLanguageOptional')} />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((l) => (
                        <SelectItem key={l.key} value={l.key}>{langsT(l.key)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm">{t('sourceColumn')}</Label>
                  <Input value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} className="h-8" placeholder="source" disabled={submitting} />
                </div>
                <div>
                  <Label className="text-sm">{t('targetColumn')}</Label>
                  <Input value={targetKey} onChange={(e) => setTargetKey(e.target.value)} className="h-8" placeholder="target" disabled={submitting} />
                </div>
                <div>
                  <Label className="text-sm">{t('notesColumnOptional')}</Label>
                  <Input value={notesKey} onChange={(e) => setNotesKey(e.target.value)} className="h-8" placeholder="notes" disabled={submitting} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t('filePreview')}
                {previewLines.length > 0 && (
                  <Badge variant="outline" className="ml-2">{t('previewLineCount', { count: previewLines.length })}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-lg p-4 max-h-48 overflow-auto">
                {previewLines.length > 0 ? (
                  <div className="space-y-1 font-mono text-xs">
                    {previewLines.map((line, idx) => (
                      <div key={idx} className="text-slate-700 leading-relaxed">{line}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm text-center py-4">{t('previewPlaceholder')}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center pt-4 border-t flex-shrink-0">
          <div className="text-sm text-muted-foreground">
            {file ? t('selectedFile', { name: file.name }) : t('selectFileHint')}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>{common('cancel')}</Button>
            <Button onClick={handleSubmit} disabled={submitting || !file} className="min-w-[120px]">
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('importing')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('startImport')}
                </span>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


