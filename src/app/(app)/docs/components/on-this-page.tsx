"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Heading = { id: string; text: string; level: number };

export function OnThisPage() {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const pathname = usePathname();

  // 读取当前页面的 heading；在路由变化或 DOM 变化时更新
  useEffect(() => {
    const compute = () => {
      const main = document.querySelector("main");
      if (!main) return;
      const nodes = Array.from(main.querySelectorAll("h1, h2, h3"));
      nodes.forEach((n: Element) => {
        if (!n.id && n.textContent) {
          const text = n.textContent.trim();
          // 生成 ID：将文本转换为小写，替换空格为连字符，移除特殊字符
          n.id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5-]/g, "");
        }
      });
      const computed = nodes
        .filter((n) => n.id || n.textContent)
        .map((n) => {
          const tagName = n.tagName.toLowerCase();
          const level = parseInt(tagName.charAt(1));
          return {
            id: n.id ?? (n.textContent ?? "").trim().toLowerCase().replace(/\s+/g, "-"),
            text: n.textContent ?? "",
            level
          };
        });
      setHeadings(computed);
    };

    // 首次与每次路由变化后执行一次
    const raf = requestAnimationFrame(compute);

    // 监听 main 内部的 DOM 变化，处理流式渲染与懒加载段落
    const main = document.querySelector("main");
    let mo: MutationObserver | null = null;
    if (main) {
      let scheduled = false;
      mo = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          compute();
        });
      });
      mo.observe(main, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(raf);
      if (mo) mo.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (!headings.length) return;
    const nodes = Array.from(document.querySelectorAll("main h1, main h2, main h3"));
    const observer = new IntersectionObserver(
      () => {
        // 由于不再需要追踪活动标题，我们可以移除这部分逻辑
      },
      { rootMargin: "0px 0px -70% 0px", threshold: [0, 1] },
    );
    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (!headings.length) return null;

  return (
    <aside className="sticky top-0 hidden max-h-screen w-60 shrink-0 overflow-auto xl:block">
      <div className="px-2 py-1 text-sm font-medium">On this page</div>
      <nav className="space-y-0.5 px-2 text-sm">
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            className={`block rounded-md px-2 py-1 text-muted-foreground hover:text-foreground active:font-medium transition-colors ${
              h.level === 3 ? 'ml-4 text-xs' : ''
            }`}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}


