import { findDocumentWithItemsByIdDB, findDocumentsByProjectIdDB } from "@/db/document";
import { notFound, redirect } from "next/navigation";

export default async function IDEPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = id;

  // 获取该项目下最近的文档
  const docs = await findDocumentsByProjectIdDB(projectId);
  const latest = docs?.[0];
  if (!latest) {
    redirect("/dashboard?notice=nodoc");
  }
  // 新结构下基于 Document.status 控制：允许预处理完成后进入 IDE
  const allowStatuses = ["PREPROCESSED", "TRANSLATING", "COMPLETED"] as const
  if (!allowStatuses.includes((latest as any).status)) {
    redirect("/dashboard?notice=processing");
  }

  const document = await findDocumentWithItemsByIdDB(latest.id);
  if (!document) {
    notFound();
  }

  // TODO: 渲染 IDE UI（此处仅占位）。
  return (<></>);
}
