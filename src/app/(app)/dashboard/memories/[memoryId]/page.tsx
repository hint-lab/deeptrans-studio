"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Search, RefreshCw, Filter, Eye, EyeOff } from "lucide-react";
import { getMemoryByIdAction, getMemoryEntriesPagedAction, searchMemoryInLibraryAction } from "@/actions/memories";
import { HybridSearchConfig, DEFAULT_HYBRID_CONFIG } from "@/types/hybrid-search";
import { SearchConfigPanel } from "../components/search-config-panel";
import { SearchResultItem } from "../components/search-result-item";

export default function MemoryDetailPage() {
  const params = useParams();
  const memoryId = String(params?.memoryId || "");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 新增状态
  const [searchConfig, setSearchConfig] = useState<Partial<HybridSearchConfig>>(DEFAULT_HYBRID_CONFIG);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.3);
  const [maxResults, setMaxResults] = useState(50);
  const [showScores, setShowScores] = useState(true);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchStats, setSearchStats] = useState<{
    searchTime?: number;
    totalFound?: number;
    mode?: string;
  }>({});

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / pageSize)), [total, pageSize]);

  const loadMeta = async () => {
    const res = await getMemoryByIdAction(memoryId);
    if (!res.success) toast.error("加载失败" + res.error);
    else setMeta(res.data);
  };

  const loadEntries = async () => {
    setLoading(true);
    const startTime = performance.now();

    try {
      if (q.trim()) {
        // 搜索模式
        setIsSearchMode(true);
        const res = await searchMemoryInLibraryAction(
          memoryId,
          q,
          maxResults,
          searchConfig
        );

        if (!res.success) throw new Error(res.error);

        // 过滤低于阈值的结果
        const filteredItems = (res.data || []).filter((item: any) =>
          !item.score || item.score >= similarityThreshold
        );

        setItems(filteredItems);
        setTotal(filteredItems.length);

        const endTime = performance.now();
        setSearchStats({
          searchTime: endTime - startTime,
          totalFound: (res.data || []).length,
          mode: res.mode || searchConfig.mode || 'hybrid'
        });
      } else {
        // 浏览模式
        setIsSearchMode(false);
        const res = await getMemoryEntriesPagedAction(memoryId, page, pageSize);
        if (!res.success) throw new Error(res.error);
        setItems(res.data || []);
        setTotal(res.total || 0);
        setSearchStats({});
      }
    } catch (e: any) {
      toast.error("加载失败: " + (e?.message || String(e)));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // 手动搜索函数
  const handleSearch = async () => {
    setPage(1);
    await loadEntries();
  };

  // 清空搜索
  const handleClearSearch = () => {
    setQ("");
    setPage(1);
  };

  useEffect(() => { void loadMeta(); }, [memoryId]);
  useEffect(() => {
    // 自动搜索的延迟触发
    const timer = setTimeout(() => {
      void loadEntries();
    }, q.trim() ? 500 : 0); // 搜索时延迟500ms，浏览时立即执行

    return () => clearTimeout(timer);
  }, [memoryId, page, pageSize, q, searchConfig, similarityThreshold, maxResults]);

  return (
    <div className="p-4 space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">记忆库详情</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              {meta?.name || memoryId}
            </p>
            {isSearchMode && searchStats.totalFound !== undefined && (
              <Badge variant="secondary">
                找到 {searchStats.totalFound} 条，显示 {total} 条
              </Badge>
            )}
            {!isSearchMode && (
              <Badge variant="outline">
                共 {total} 条记录
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <a href="/dashboard/memories">返回</a>
          </Button>
        </div>
      </div>

      <Separator />

      {/* 搜索区域 */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索源文、译文或备注..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSearch} disabled={loading} className="flex items-center gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              搜索
            </Button>
            {q && (
              <Button variant="outline" onClick={handleClearSearch}>
                清空
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowScores(!showScores)}
              title={showScores ? "隐藏相似度" : "显示相似度"}
            >
              {showScores ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* 搜索统计信息 */}
        {isSearchMode && searchStats.searchTime && (
          <Alert>
            <Search className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center gap-4 text-sm">
                <span>搜索模式: <Badge variant="secondary">{searchStats.mode}</Badge></span>
                <span>用时: {Math.round(searchStats.searchTime)}ms</span>
                <span>阈值: {(similarityThreshold * 100).toFixed(0)}%</span>
                {searchStats.totalFound !== total && (
                  <span className="text-amber-600">
                    已过滤 {(searchStats.totalFound || 0) - total} 条低相似度结果
                  </span>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </Card>

      {/* 搜索配置面板 */}
      <SearchConfigPanel
        config={searchConfig}
        onConfigChange={setSearchConfig}
        similarityThreshold={similarityThreshold}
        onSimilarityThresholdChange={setSimilarityThreshold}
        maxResults={maxResults}
        onMaxResultsChange={setMaxResults}
      />

      {/* 搜索结果 */}
      <div className="space-y-4">
        {loading ? (
          <Card className="p-8">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>搜索中...</span>
            </div>
          </Card>
        ) : items.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              {q ? '未找到匹配的结果' : '暂无数据'}
            </div>
          </Card>
        ) : (
          <>
            {/* 搜索结果列表 */}
            <div className="space-y-3">
              {items.map((item, index) => (
                <SearchResultItem
                  key={item.id}
                  item={item}
                  index={index}
                  searchQuery={q}
                  showScores={showScores && isSearchMode}
                />
              ))}
            </div>

            {/* 分页控制 */}
            {!isSearchMode && totalPages > 1 && (
              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    第 {page} / {totalPages} 页 · 共 {total} 条记录
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}


