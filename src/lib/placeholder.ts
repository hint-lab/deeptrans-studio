// 句级占位符构建工具：不修改原文，只生成映射，供后续翻译时构造 <|i|>...</|i|>

export type PlaceholderSpan = { index: number; text: string; start: number; end: number };

// 按中文/英文常见句末标点拆分，保留边界，合并过短片段
export function buildSentencePlaceholders(input: string): PlaceholderSpan[] {
  const raw = String(input || '');
  if (!raw.trim()) return [];
  const parts: PlaceholderSpan[] = [];
  const punct = /([。！？!?；;。]+)/g; // 句末标点
  let last = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = punct.exec(raw)) !== null) {
    const end = m.index + m[0].length;
    const seg = raw.slice(last, end);
    if (seg.trim()) parts.push({ index: idx++, text: seg, start: last, end });
    last = end;
  }
  if (last < raw.length) {
    const tail = raw.slice(last);
    if (tail.trim()) parts.push({ index: idx++, text: tail, start: last, end: raw.length });
  }
  // 合并过短（<12 字符）的尾随片段到前一段，避免碎片
  const merged: PlaceholderSpan[] = [];
  for (const span of parts) {
    const prev = merged[merged.length - 1];
    if (prev && span.text.trim().length < 12) {
      const text = prev.text + span.text;
      merged[merged.length - 1] = { index: prev.index, text, start: prev.start, end: span.end };
    } else {
      merged.push(span);
    }
  }
  // 重新编号 index
  return merged.map((s, i) => ({ ...s, index: i }));
}

