"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from 'next-intl';

export default function IDELoading() {
  const t = useTranslations('IDE.layout');
  return (
    <div className="h-[calc(100vh-64px)] w-full flex items-center justify-center">
      <div className="w-full max-w-5xl px-6">
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-[320px] w-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <div className="rounded-lg border p-3 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-[320px] w-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}


