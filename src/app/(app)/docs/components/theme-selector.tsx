"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";

export function ThemeSelector() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换主题">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">切换主题</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <span className="mr-2 inline-flex h-4 w-4 items-center justify-center"><Sun className="h-3.5 w-3.5" /></span>
            浅色
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <span className="mr-2 inline-flex h-4 w-4 items-center justify-center"><Moon className="h-3.5 w-3.5" /></span>
            深色
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <span className="mr-2 inline-flex h-4 w-4 items-center justify-center"><Laptop className="h-3.5 w-3.5" /></span>
            跟随系统
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


