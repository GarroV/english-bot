import { answerCallbackQuery, sendDocument, sendMessage } from "../lib/telegram.ts";
import { getSession } from "../lib/db.ts";
import { generatePdf } from "../lib/pdf.ts";
import { makeFilename, makeTeacherFilename } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

// Download PDF(s): sends student PDF always, plus teacher guide PDF when present in session
export async function handleDownloadPdf(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id, "Генерирую PDF...");

  const session = await getSession(query.from.id);
  const chatId = query.message.chat.id;
  const studentText = session?.context.current_assignment ?? "";
  const teacherText = session?.context.current_assignment_teacher;

  try {
    const studentBytes = await generatePdf(studentText);
    const studentFilename = makeFilename(studentText);
    await sendDocument(chatId, studentFilename, studentBytes, teacherText ? "Студенческая версия" : "Готово!");

    if (teacherText) {
      const teacherBytes = await generatePdf(teacherText);
      const teacherFilename = makeTeacherFilename(teacherText);
      await sendDocument(chatId, teacherFilename, teacherBytes, "Версия для учителя");
    }
  } catch (e) {
    await sendMessage(chatId, `Ошибка при создании PDF: ${e}`);
  }
}
