import { answerCallbackQuery, sendDocument, sendMessage } from "../lib/telegram.ts";
import { getSession, saveAssignment } from "../lib/db.ts";
import { generatePdf } from "../lib/pdf.ts";
import { makeFilename, makeTeacherFilename } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

// Download PDF(s): sends student PDF always, plus teacher guide PDF when present in session.
// Saves the student assignment to the database — only downloaded assignments enter the cache.
export async function handleDownloadPdf(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id, "Генерирую PDF...");

  const userId = query.from.id;
  const session = await getSession(userId);
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

    // Save to DB after successful download — user approved this assignment
    const level = session?.context.params?.level ?? "B1";
    const ageGroup = session?.context.params?.ageGroup ?? "adult";
    const moduleType = session?.context.module_type ?? "READING_MODULE";
    const firstLine = studentText.split("\n")[0];
    const topicMatch = firstLine.match(/Topic:\s*([^·\n]+)/);
    const topic = topicMatch ? topicMatch[1].trim() : firstLine.slice(0, 80);

    await saveAssignment({
      telegramId: userId,
      level,
      topic,
      ageGroup,
      moduleType,
      requestText: topic,
      content: studentText,
    });
  } catch (e) {
    await sendMessage(chatId, `Ошибка при создании PDF: ${e}`);
  }
}
