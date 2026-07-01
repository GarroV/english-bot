import { answerCallbackQuery, sendDocument, sendMessage } from "../lib/telegram.ts";
import { getSession, saveAssignment, saveFolioTemplateFromBot } from "../lib/db.ts";
import { generatePdf } from "../lib/pdf.ts";
import { makeFilename, makeTeacherFilename, extractTopic } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

// Download PDF(s): sends student PDF always, plus teacher guide PDF when present in session.
// Saves the student assignment to the bot cache and mirrors it into the tutor's Folio library —
// only downloaded assignments are persisted (the user approved them by downloading).
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

    // Teacher version is best-effort: the student PDF is already delivered, so a failure here must
    // not surface as a PDF error nor skip the persistence/mirror below (sendDocument now throws).
    if (teacherText) {
      try {
        const teacherBytes = await generatePdf(teacherText);
        const teacherFilename = makeTeacherFilename(teacherText);
        await sendDocument(chatId, teacherFilename, teacherBytes, "Версия для учителя");
      } catch (e) {
        console.error("teacher PDF send failed:", e);
        await sendMessage(chatId, "⚠️ Студенческий PDF готов, но версию для учителя отправить не удалось.");
      }
    }

    // Save to DB after successful download — user approved this assignment
    const level = session?.context.params?.level ?? "B1";
    const ageGroup = session?.context.params?.ageGroup ?? "adult";
    const moduleType = session?.context.module_type ?? "READING_MODULE";
    const topic = extractTopic(studentText);

    // Best-effort persistence: the PDF is already delivered, so a cache-write failure must not
    // surface as a PDF error. Isolate it like the Folio mirror below.
    try {
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
      console.error("saveAssignment failed:", e);
    }

    // Bridge: mirror into the tutor's Folio library (source='bot') so it is visible/assignable
    // in the web. Best-effort and isolated — a Folio write must never break PDF delivery.
    try {
      const result = await saveFolioTemplateFromBot({
        telegramId: userId,
        moduleType,
        level,
        ageGroup,
        topic,
        content: studentText,
      });
      if (result === "saved") {
        await sendMessage(chatId, "📚 Добавлено в библиотеку Folio");
      }
    } catch (e) {
      console.error("saveFolioTemplateFromBot failed:", e);
    }
  } catch (e) {
    await sendMessage(chatId, `Ошибка при создании PDF: ${e}`);
  }
}
