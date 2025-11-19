"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coffee, Loader2, Upload, FileText, Eye, Settings, CheckCircle2, Building2, User } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { createDictionaryAction, importDictionaryAction } from "@/actions/dictionary";

type DictLite = { id: string; name: string };

export function ImportDictionaryDialog({
  dictionaries,
  onImported,
  modeContext,
  userId,
}: {
  dictionaries?: DictLite[];
  onImported?: () => void;
  modeContext: 'private' | 'project';
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [parsedEntries, setParsedEntries] = useState<Array<{ sourceText: string; targetText: string; notes?: string }>>([]);
  const [loading, setLoading] = useState(false);

  // 字段映射（Excel）
  const [sourceKey, setSourceKey] = useState('source');
  const [targetKey, setTargetKey] = useState('target');
  const [notesKey, setNotesKey] = useState('notes');
  const isExcel = useMemo(() => file && /\.(xlsx|xls|csv)$/i.test(file.name), [file]);
  const isTbx = useMemo(() => file && /\.(tbx|xml)$/i.test(file.name), [file]);
  
  // 启用预览功能
  const enablePreview = true;
  
  const isProject = modeContext === 'project';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview([]);
    setParsedEntries([]);
    if (!f || !enablePreview) return;
    
    try {
      const ext = f.name.toLowerCase().split('.').pop();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const XLSX = await import('xlsx');
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const firstSheetName = wb.SheetNames?.[0] ?? '';
        const ws = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
        const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
        
        // 生成更友好的预览
        const previewRows = rows.slice(0, 10).map((r, idx) => {
          const keys = Object.keys(r).slice(0, 5); // 只显示前5列
          const preview = keys.map(k => `${k}: ${String(r[k]).slice(0, 30)}`).join(' | ');
          return `行${idx + 1}: ${preview}`;
        });
        setPreview(previewRows);
        
        // 预解析数据
        const norm = (k: string) => String(k || '').trim().toLowerCase();
        const entries = rows.map((r) => {
          const keys = Object.keys(r);
          const kv: any = {};
          for (const k of keys) kv[norm(k)] = r[k];
          return {
            sourceText: String(kv[norm(sourceKey)] ?? kv['源'] ?? kv['source'] ?? ''),
            targetText: String(kv[norm(targetKey)] ?? kv['译'] ?? kv['target'] ?? ''),
            notes: String(kv[norm(notesKey)] ?? kv['备注'] ?? kv['notes'] ?? ''),
          };
        }).filter(e => e.sourceText && e.targetText);
        setParsedEntries(entries);
      } else if (ext === 'tbx' || ext === 'xml') {
        const text = await f.text();
        const lines = text.split(/\r?\n/).slice(0, 10);
        setPreview(lines.map((line, idx) => `行${idx + 1}: ${line.slice(0, 100)}`));
        setParsedEntries([]);
      } else {
        setPreview([`❌ 不支持的文件类型: ${ext}`]);
        setParsedEntries([]);
      }
    } catch (e) {
      setPreview([`❌ 预览失败: ${String(e)}`]);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast('请选择文件（支持 .xlsx / .tbx）');
      return;
    }
    try {
      setLoading(true);
      
      // 1) 根据模式创建词库：project -> 项目词库；private -> 私有词库
      const baseName = file.name.replace(/\.[^.]+$/, '') || (isProject ? 'project-dict' : 'private-dict');
      const createRes = await createDictionaryAction({ 
        name: baseName, 
        description: isProject ? '项目共享词库' : '私有项目词库', 
        domain: 'general', 
        visibility: (isProject ? 'PROJECT' : 'PRIVATE'),
        userId: isProject ? undefined : userId
      });
      if (!createRes?.success || !createRes?.data?.id) throw new Error('创建词库失败');
      const dictionaryId = createRes.data.id as string;

      // 2) 导入文件内容到该词库
      const mapping = { sourceKey, targetKey, notesKey } as any;
      const importRes = await importDictionaryAction({ dictionaryId, file, mode: 'upsert', sourceLang: 'auto', targetLang: 'auto', ...mapping });
      if (!importRes?.success) throw new Error((importRes as any)?.error || '导入失败');
      toast(`${isProject ? '项目词库导入成功' : '私有词库导入成功'}：“${baseName}”，导入 ${importRes?.data?.total ?? 0} 条`);
      onImported?.();
      setOpen(false);
    } catch (e) {
      toast.error('导入出错', { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const getFileTypeIcon = () => {
    if (!file) return <FileText className="h-4 w-4" />;
    if (isExcel) return <span className="text-green-600">📊</span>;
    if (isTbx) return <span className="text-blue-600">📋</span>;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        {isProject ? '导入项目词库' : '导入私有词库'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {isProject ? (
                <Building2 className="h-5 w-5 text-blue-600" />
              ) : (
                <User className="h-5 w-5 text-purple-600" />
              )}
              导入智能词库
            </DialogTitle>
            <DialogDescription>
              {isProject ? '创建项目共享词库并导入数据，支持语义检索与智能匹配' : '创建私有项目词库并导入数据，仅自己可见'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto space-y-4">
            {/* 加载状态 */}
            {loading && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="flex items-center gap-3 py-4">
                  <Coffee className="h-5 w-5 text-amber-600" />
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  <span className="text-amber-800">正在导入词库，请稍等片刻…</span>
                </CardContent>
              </Card>
            )}
            {/* 文件选择区域 */}
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {isProject ? '项目词库配置' : '私有词库配置'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4"> 
                <div>
                  <Label className="text-sm font-medium">选择文件</Label>
                  <div className="relative">
                    <Input 
                      type="file" 
                      accept=".xlsx,.xls,.csv,.tbx,.xml" 
                      onChange={handleFileChange} 
                      className="h-9" 
                      disabled={loading} 
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
                  <p className="text-xs text-muted-foreground mt-1">
                    支持 Excel (.xlsx/.xls/.csv) 和 TBX (.tbx/.xml) 格式
                  </p>
                </div>
                
                {isProject && (
                  <div className="bg-blue-100 rounded-lg p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Building2 className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-800">项目智能词库特性</p>
                        <ul className="text-blue-700 text-xs mt-1 space-y-1">
                          <li>• AI 增强的语义检索</li>
                          <li>• 支持模糊匹配和上下文理解</li>
                          <li>• 项目共享，云端存储</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Excel 字段映射 */}
            {isExcel && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    字段映射设置
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-sm">源文列名</Label>
                      <Input 
                        value={sourceKey} 
                        onChange={(e) => setSourceKey(e.target.value)} 
                        className="h-8" 
                        placeholder="source" 
                        disabled={loading} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm">译文列名</Label>
                      <Input 
                        value={targetKey} 
                        onChange={(e) => setTargetKey(e.target.value)} 
                        className="h-8" 
                        placeholder="target" 
                        disabled={loading} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm">备注列名</Label>
                      <Input 
                        value={notesKey} 
                        onChange={(e) => setNotesKey(e.target.value)} 
                        className="h-8" 
                        placeholder="notes" 
                        disabled={loading} 
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 文件预览 */}
            {file && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    文件预览
                    {parsedEntries.length > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {parsedEntries.length} 条有效数据
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-slate-50 rounded-lg p-4 max-h-48 overflow-auto">
                    {preview.length > 0 ? (
                      <div className="space-y-1 font-mono text-xs">
                        {preview.map((line, idx) => (
                          <div key={idx} className="text-slate-700 leading-relaxed">
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-sm text-center py-4">
                        选择文件后将显示预览内容
                      </div>
                    )}
                  </div>
                  {parsedEntries.length > 0 && (
                    <div className="mt-3 text-sm text-green-600 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      解析成功，预计导入 {parsedEntries.length} 条词条
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-between items-center pt-4 border-t flex-shrink-0">
            <div className="text-sm text-muted-foreground">{file ? `已选择: ${file.name}` : '请选择要导入的词库文件'}</div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                取消
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={loading || !file}
                className="min-w-[120px] bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> 
                    上传中…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    {isProject ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    {isProject ? '导入项目词库' : '导入私有词库'}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ImportDictionaryDialog;