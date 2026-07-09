// Разбор текста задания на сегменты для инлайн-ответов (#56): каждый пропуск (___ из 3+
// подчёркиваний) становится полем ввода. Чистая функция — тестируется без React/Supabase.

export type InlinePart =
  | { type: "text"; value: string }
  | { type: "blank"; idx: number };

const BLANK_RE = /_{3,}/g;

// Делит контент на текстовые куски и пропуски; idx — сквозной номер пропуска (ключ ответа).
export function splitBlanks(content: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  let idx = 0;
  for (const m of content.matchAll(BLANK_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: "text", value: content.slice(last, at) });
    parts.push({ type: "blank", idx: idx++ });
    last = at + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", value: content.slice(last) });
  return parts;
}

// Сколько пропусков в контенте (0 → режим свободного ответа "free").
export function countBlanks(content: string): number {
  return splitBlanks(content).filter((p) => p.type === "blank").length;
}
