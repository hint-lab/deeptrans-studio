"use client";
import React, { useState, useEffect } from "react";
import { FileUpload } from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Settings,
  BookOpen,
  Globe,
  FileText,
  Image as ImageIcon,
  Search,
  Plus,
  X,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { fetchDictionariesAction } from "@/actions/dictionary";
import { fetchDictionaryEntriesAction } from "@/actions/dictionary";
import { useTranslations } from "next-intl";

// 动态语言选项 - 将在组件内部基于翻译创建

// 翻译引擎选项
const translationEngines = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'google', label: 'Google' },
];

export default function DocumentIntelligencePage() {
  const { data: session } = useSession();
  const tDashboard = useTranslations("Dashboard");
  const t = useTranslations("Dashboard.DocumentTranslate");

  // 动态语言选项
  const sourceLanguages = [
    { key: 'auto', label: tDashboard('autoDetect') },
    { key: 'en', label: tDashboard('english') },
    { key: 'de', label: tDashboard('german') },
  ];
  const targetLanguages = [
    { key: 'zh', label: tDashboard('chinese') },
  ];
  // 公共参数
  const [tab, setTab] = useState("document");
  // 文档识别翻译参数
  const [taskStatus, setTaskStatus] = useState("idle");
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("zh");
  const [translationEngine, setTranslationEngine] = useState("deepseek");
  const [preserveFormatting, setPreserveFormatting] = useState(true);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [selectedDictionaries, setSelectedDictionaries] = useState<string[]>([]);

  // 与即时翻译一致的词库状态
  interface DictionarySummary {
    id: string;
    name: string;
    description?: string | null;
    domain: string;
    isPublic: boolean;
    _count?: { entries: number };
  }
  interface DictionaryEntryItem {
    id: string;
    sourceText: string;
    targetText: string;
    notes?: string | null;
  }

  const [dictionaryDialogOpen, setDictionaryDialogOpen] = useState(false);
  const [publicDictionaries, setPublicDictionaries] = useState<DictionarySummary[]>([]);
  const [privateDictionaries, setPrivateDictionaries] = useState<DictionarySummary[]>([]);
  const [loadingDictionaries, setLoadingDictionaries] = useState(false);
  const [expandedDictionaryIds, setExpandedDictionaryIds] = useState<string[]>([]);
  const [dictionaryEntriesById, setDictionaryEntriesById] = useState<Record<string, DictionaryEntryItem[]>>({});
  const [loadingEntries, setLoadingEntries] = useState<Record<string, boolean>>({});
  const [dictionarySearch, setDictionarySearch] = useState("");

  // 加载公共/私有词典（不加载词条）
  useEffect(() => {
    const loadDictionaries = async () => {
      setLoadingDictionaries(true);
      try {
        const [pubRes, privRes] = await Promise.all([
          fetchDictionariesAction("public"),
          session?.user?.id ? fetchDictionariesAction("private", session.user.id) : Promise.resolve({ success: true, data: [] as DictionarySummary[] })
        ]);
        if (pubRes.success && pubRes.data) {
          setPublicDictionaries(pubRes.data as unknown as DictionarySummary[]);
        }
        if (privRes.success && privRes.data) {
          setPrivateDictionaries(privRes.data as unknown as DictionarySummary[]);
        } else if (!session?.user?.id) {
          setPrivateDictionaries([]);
        }
      } catch (e) {
        console.error(t("loadDictionariesFailed"), e);
        toast.error(t("loadDictionariesFailed"));
      } finally {
        setLoadingDictionaries(false);
      }
    };
    void loadDictionaries();
  }, [session?.user?.id, toast]);

  // 展开并懒加载词条
  const onExpandDictionary = async (dictionaryId: string) => {
    setExpandedDictionaryIds(prev => prev.includes(dictionaryId) ? prev.filter(id => id !== dictionaryId) : [...prev, dictionaryId]);
    if (!dictionaryEntriesById[dictionaryId]) {
      setLoadingEntries(prev => ({ ...prev, [dictionaryId]: true }));
      try {
        const res = await fetchDictionaryEntriesAction(dictionaryId);
        if (res.success && res.data) {
          setDictionaryEntriesById(prev => ({ ...prev, [dictionaryId]: (res.data as unknown as DictionaryEntryItem[]) ?? [] }));
        }
      } catch (e) {
        console.error("加载词条失败", e);
        toast.error(t("loadEntriesFailed"));
      } finally {
        setLoadingEntries(prev => ({ ...prev, [dictionaryId]: false }));
      }
    }
  };

  // 使用/取消使用某词典
  const onToggleUseDictionary = (dictionaryId: string) => {
    setSelectedDictionaries(prev => prev.includes(dictionaryId)
      ? prev.filter(id => id !== dictionaryId)
      : [...prev, dictionaryId]
    );
  };

  // 过滤词典
  const filteredPublic = publicDictionaries.filter((dict: DictionarySummary) =>
    dict.name.toLowerCase().includes(dictionarySearch.toLowerCase()) ||
    dict.domain.toLowerCase().includes(dictionarySearch.toLowerCase())
  );
  const filteredPrivate = privateDictionaries.filter((dict: DictionarySummary) =>
    dict.name.toLowerCase().includes(dictionarySearch.toLowerCase()) ||
    dict.domain.toLowerCase().includes(dictionarySearch.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("title")}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t("description")}</p>
      </div>

      <div className="flex items-center justify-between mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label className="text-sm font-medium">{tDashboard("sourceLanguage")}</Label>
            <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
              <SelectTrigger className="w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                {sourceLanguages.map((lang) => (
                  <SelectItem key={lang.key} value={lang.key} className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Label className="text-sm font-medium">{tDashboard("targetLanguage")}</Label>
            <Select value={targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger className="w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                {targetLanguages.map((lang) => (
                  <SelectItem key={lang.key} value={lang.key} className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch id="preserve-formatting" checked={preserveFormatting} onCheckedChange={setPreserveFormatting} />
            <Label htmlFor="preserve-formatting">{t("preserveFormatting")}</Label>
          </div>

          <Dialog open={dictionaryDialogOpen} onOpenChange={setDictionaryDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t("dictionarySelection")}
                <Badge variant="secondary" className="ml-1">{selectedDictionaries.length}</Badge>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t("dictionarySelection")}</DialogTitle>
              </DialogHeader>
              <div className="mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-gray-500">{t("selected")} {selectedDictionaries.length} {t("dictionaries")}</div>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder={t("searchDictionaries")}
                      value={dictionarySearch}
                      onChange={(e) => setDictionarySearch(e.target.value)}
                      className="pl-8 pr-4 py-2 border rounded-md text-sm w-56"
                    />
                  </div>
                </div>
                <ScrollArea className="h-80">
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-sm font-semibold text-gray-600">{t("publicDictionaries")}</div>
                      {loadingDictionaries && filteredPublic.length === 0 ? (
                        <div className="text-sm text-gray-500">{t("loading")}</div>
                      ) : (
                        <div className="space-y-3">
                          {filteredPublic.map((dictionary) => (
                            <div key={dictionary.id} className={`p-3 border rounded-lg transition-colors ${expandedDictionaryIds.includes(dictionary.id) ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                                    <FileText className="h-5 w-5 text-white" />
                                  </div>
                                  <div>
                                    <h4 className="font-medium">{dictionary.name}</h4>
                                    <p className="text-sm text-gray-500">{dictionary.domain}</p>
                                    <p className="text-xs text-gray-400">{dictionary.description ?? ''}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Badge variant="outline">{dictionary._count?.entries ?? 0} {t("entries")}</Badge>
                                  <Button size="sm" variant={selectedDictionaries.includes(dictionary.id) ? 'default' : 'outline'} onClick={() => onToggleUseDictionary(dictionary.id)}>
                                    {selectedDictionaries.includes(dictionary.id) ? t("used") : t("use")}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => onExpandDictionary(dictionary.id)}>
                                    {expandedDictionaryIds.includes(dictionary.id) ? t("collapse") : t("viewTerms")}
                                  </Button>
                                </div>
                              </div>
                              {expandedDictionaryIds.includes(dictionary.id) && (
                                <div className="mt-3">
                                  {(loadingEntries[dictionary.id] ?? false) ? (
                                    <div className="text-sm text-gray-500">{t("loadingTerms")}</div>
                                  ) : (
                                    <div className="space-y-2 max-h-40 overflow-auto pr-1">
                                      {(dictionaryEntriesById[dictionary.id] ?? []).map((entry: DictionaryEntryItem) => (
                                        <div key={entry.id} className="text-sm text-gray-700 dark:text-gray-300">
                                          <span className="font-medium">{entry.sourceText}</span>
                                          <span className="mx-2 text-gray-400">→</span>
                                          <span>{entry.targetText}</span>
                                          {entry.notes ? <span className="ml-2 text-xs text-gray-400">({entry.notes})</span> : null}
                                        </div>
                                      ))}
                                      {(!(dictionaryEntriesById[dictionary.id] ?? []).length) && (
                                        <div className="text-sm text-gray-500">{t("noTerms")}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <div className="mb-2 text-sm font-semibold text-gray-600">{t("privateDictionaries")}</div>
                      {loadingDictionaries && filteredPrivate.length === 0 ? (
                        <div className="text-sm text-gray-500">{t("loading")}</div>
                      ) : (
                        <div className="space-y-3">
                          {filteredPrivate.map((dictionary) => (
                            <div key={dictionary.id} className={`p-3 border rounded-lg transition-colors ${expandedDictionaryIds.includes(dictionary.id) ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                                    <FileText className="h-5 w-5 text-white" />
                                  </div>
                                  <div>
                                    <h4 className="font-medium">{dictionary.name}</h4>
                                    <p className="text-sm text-gray-500">{dictionary.domain}</p>
                                    <p className="text-xs text-gray-400">{dictionary.description ?? ''}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Badge variant="outline">{dictionary._count?.entries ?? 0} {t("entries")}</Badge>
                                  <Button size="sm" variant={selectedDictionaries.includes(dictionary.id) ? 'default' : 'outline'} onClick={() => onToggleUseDictionary(dictionary.id)}>
                                    {selectedDictionaries.includes(dictionary.id) ? t("used") : t("use")}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => onExpandDictionary(dictionary.id)}>
                                    {expandedDictionaryIds.includes(dictionary.id) ? t("collapse") : t("viewTerms")}
                                  </Button>
                                </div>
                              </div>
                              {expandedDictionaryIds.includes(dictionary.id) && (
                                <div className="mt-3">
                                  {(loadingEntries[dictionary.id] ?? false) ? (
                                    <div className="text-sm text-gray-500">{t("loadingTerms")}</div>
                                  ) : (
                                    <div className="space-y-2 max-h-40 overflow-auto pr-1">
                                      {(dictionaryEntriesById[dictionary.id] ?? []).map((entry: DictionaryEntryItem) => (
                                        <div key={entry.id} className="text-sm text-gray-700 dark:text-gray-300">
                                          <span className="font-medium">{entry.sourceText}</span>
                                          <span className="mx-2 text-gray-400">→</span>
                                          <span>{entry.targetText}</span>
                                          {entry.notes ? <span className="ml-2 text-xs text-gray-400">({entry.notes})</span> : null}
                                        </div>
                                      ))}
                                      {(!(dictionaryEntriesById[dictionary.id] ?? []).length) && (
                                        <div className="text-sm text-gray-500">{t("noTerms")}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="text-lg font-medium">{t("documentUpload")}</div>
          </div>
          <div className="p-4">
            <div className="w-full mb-3">
              <FileUpload onUploadComplete={() => setTaskStatus("pending")} projectName={t("temporaryDocument")} elementName="Dashboard.DocumentTranslate"/>
            </div>
            <div className="mt-2 text-sm text-purple-600">{t("supportedFileTypes")}</div>
          </div>
        </div>

        {showAdvancedOptions && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="text-lg font-medium">{t("advancedOptions")}</div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Label className="text-sm font-medium">{t("translationStyle")}</Label>
                  <Select>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">{tDashboard("formal")}</SelectItem>
                      <SelectItem value="casual">{tDashboard("casual")}</SelectItem>
                      <SelectItem value="technical">{tDashboard("technical")}</SelectItem>
                      <SelectItem value="creative">{tDashboard("creative")}</SelectItem>
                      <SelectItem value="academic">{tDashboard("academic")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Label className="text-sm font-medium">{t("qualityLevel")}</Label>
                  <Select>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast">{t("fast")}</SelectItem>
                      <SelectItem value="standard">{t("standard")}</SelectItem>
                      <SelectItem value="high">{t("high")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="text-lg font-medium">{t("translate")}</div>
          </div>
          <div className="p-4">
            <Button className="w-40" disabled={taskStatus !== "pending"}>{t("startTranslation")}</Button>
            {translatedContent && (
              <div className="mt-6">
                <div className="text-lg font-semibold mb-2">{t("translationResult")}</div>
                <div className="whitespace-pre-wrap text-sm max-h-96 overflow-auto">{translatedContent}</div>
                <Button className="mt-4">{t("downloadResult")}</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 