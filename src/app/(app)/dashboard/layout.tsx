"use client";
import React from "react";
import { type PropsWithChildren } from "react";
import Header from "./components/header";
import Sidebar from "./components/sidebar";
import { useSidebar } from "@/hooks/useSidebar";
import { useSession } from "next-auth/react"
import { useState, useEffect, useMemo } from "react"
export default function DashboardLayout({ children }: PropsWithChildren) {
  const { data: session, status, update } = useSession();
  const { isSidebarOpen } = useSidebar();
  useEffect(() => {
      console.log("客户端Layout Session状态:", status);
      console.log("客户端Layout Session数据:", session);
      console.log("客户端Layout 过期时间:",  session?.expires 
  ? new Date(session.expires).toLocaleString() 
  : "未设置");
  }, [session, status]);
  return (
    <div className="relative fixed inset-0 overflow-hidden bg-gradient-to-br from-[#0f1020] via-[#11122a] to-[#0b0c1a]">
      {/* 背景装饰 - 渐变光晕 */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/40 via-purple-500/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/30 via-blue-400/10 to-transparent blur-3xl" />

      {/* 背景装饰 - 网格细线 */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 h-10 bg-primary z-50">
        <Header />
      </div>
      {/* Sidebar */}
      <div className={isSidebarOpen ? "fixed top-10 mt-1 left-0 w-64 z-40 bg-card bottom-1 border-border/60" : "fixed top-10 mt-1 left-0 w-16 z-40 bg-transparent rounded-r-md bottom-1 border-border/60"}>
        <Sidebar />
      </div>

      {/* Content */}
      <div className={isSidebarOpen ? "fixed top-10 mt-1 left-64 right-0 p-4 z-30 bottom-1 overflow-auto bg-transparent border-l border-border/60 ml-1" : "fixed top-10 mt-1 left-16 right-0 p-4 z-30 bottom-1 overflow-auto bg-transparent border-l border-border/60 ml-1"}>
        <div className="mt-4 flex items-center justify-center">
          <div className="mx-auto w-full md:max-w-3xl lg:max-w-4xl xl:max-w-6xl">{children}</div>
        </div>
      </div>
    </div>

  );
}
