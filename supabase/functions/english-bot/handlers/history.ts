import { answerCallbackQuery, sendDocument, sendMessage, keyboard } from "../lib/telegram.ts";
import { getUserAssignments, getAssignment } from "../lib/db.ts";
import { generatePdf } from "../lib/pdf.ts";
import { makeFilename } from "../lib/utils.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

const MODULE_LABELS: Record<string, string> = {
  READING_MODULE: "Reading",
  VOCABULARY_MODULE: "Vocabulary",
  TRANSLATION_TEXTS: "Перевод (тексты)",
  TRANSLATION_SENTENCES: "Перевод (пред.)",
  VERB_SENTENCES: "Глаголы (пред.)",
};

// Format ISO date as DD.MM.YY
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Show last 5 assignments with a PDF download button per entry
export async function handleHistory(message: TgMessage): Promise<void> {
  const userId = message.from.id;
  const chatId = message.chat.id;

  const assignments = await getUserAssignments(userId, 5);

  if (assignments.length === 0) {
    await sendMessage(chatId, "У тебя пока нет сгенерированных заданий. Создай первое — нажми *📝 Новое задание*.");
    return;
  }

  let text = "*Последние задания:*\n\n";
  const rows: [string, string][][] = [];

  assignments.forEach((a, i) => {
    const typeLabel = MODULE_LABELS[a.module_type] ?? a.module_type;
    const date = formatDate(a.created_at);
    text += `${i + 1}. ${typeLabel} · ${a.level ?? "?"} · ${date}\n`;
    if (a.topic) text += `   _${a.topic}_\n`;
    text += "\n";
    rows.push([[`📄 PDF #${i + 1}`, `hist_pdf_${a.id}`]]);
  });

  await sendMessage(chatId, text, keyboard(rows));
}

// Download PDF for a specific assignment from history
export async function handleHistoryDownload(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id, "Генерирую PDF...");

  const assignmentId = query.data.replace("hist_pdf_", "");
  const chatId = query.message.chat.id;

  const assignment = await getAssignment(assignmentId);
  if (!assignment) {
    await sendMessage(chatId, "Задание не найдено.");
    return;
  }

  try {
    const bytes = await generatePdf(assignment.content);
    const filename = makeFilename(assignment.content);
    await sendDocument(chatId, filename, bytes);
  } catch (e) {
    await sendMessage(chatId, `Ошибка при создании PDF: ${e}`);
  }
}
