import { Icons } from "@/components/icons";

export default function Loading() {
  return (
    <div className="mt-40 flex flex-row items-center justify-center text-foreground">
      <div className="flex flex-col items-center justify-center gap-4">
        <img
          src="/logo.svg"
          alt="Loading..."
          className="mb-4 h-[100px] w-[300px]"
        />

        <Icons.spinner className="h-[100px] w-[100px] animate-spin text-primary" />
      </div>
    </div>
  );
}
