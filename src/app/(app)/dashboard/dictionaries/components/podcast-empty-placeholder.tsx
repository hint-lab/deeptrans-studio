import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DictionaryEmptyPlaceholder() {
  return (
    <div className="flex h-[450px] shrink-0 items-center justify-center rounded-md border border-dashed">
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          className="h-10 w-10 text-muted-foreground"
          viewBox="0 0 24 24"
        >
          <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>

        <h3 className="mt-4 text-lg font-semibold">没有找到私有词库</h3>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">
          您还没有创建任何私有词库，点击下方按钮创建一个。
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="relative">
              创建词库
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新词库</DialogTitle>
              <DialogDescription>
                填写下列信息创建一个新的私有词库。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">词库名称</Label>
                <Input id="name" placeholder="例如：技术文档术语" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="domain">领域</Label>
                <Input id="domain" placeholder="例如：IT技术、医疗、法律等" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">描述（可选）</Label>
                <Input id="description" placeholder="词库的简要描述" />
              </div>
            </div>
            <DialogFooter>
              <Button>创建词库</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
