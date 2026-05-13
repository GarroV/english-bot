import { answerCallbackQuery, sendDocument, sendMessage } from "../lib/telegram.ts";
import { getSession } from "../lib/db.ts";
import { generatePdf } from "../lib/pdf.ts";
import { makeFilename } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

export async function handleDownloadPdf(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id, "Генерирую PDF...");

  const session = await getSession(query.from.id);
  const text = session?.context.current_assignment ?? "";

  try {
    const bytes = await generatePdf(text);
    const filename = makeFilename(text);
    await sendDocument(query.message.chat.id, filename, bytes, "Готово!");
  } catch (e) {
    await sendMessage(query.message.chat.id, `Ошибка при создании PDF: ${e}`);
  }
}
