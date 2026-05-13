import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_KEY") });

const GENERATION_PROMPT = `Ты опытный репетитор английского языка. Создай домашнее задание на основе запроса: {INPUT}

Структура задания:
0. Самая первая строка (до заголовка текста): Level: [уровень] · Topic: [тема на английском] · Age group: [возраст на английском]
1. Текст для чтения (150-200 слов) на английском, подходящий под уровень
2. Task 1 — Vocabulary (matching или выбор слов)
3. Task 2 — Reading: True/False (6 утверждений)
4. Task 3 — Reading: вопросы по тексту (5 вопросов, ответить полными предложениями)
5. Task 4 — Grammar (тема грамматики подходящая для уровня, 6 предложений)
6. Task 5 — Grammar (другой тип упражнения на ту же или смежную тему)
7. Task 6 — Vocabulary in context (выбор правильного слова)
8. Task 7 — Speaking (4-5 вопросов для подготовки к следующему уроку)
9. Task 8 — Creative writing optional (4-6 предложений, необязательное)

Требования:
- Все задания на английском
- Инструкции чёткие и понятные — ученик делает дома самостоятельно
- Задания интересные и разнообразные
- Уровень сложности строго соответствует запросу
- Текст обезличенный — никаких имён героев, никакого повествования от первого лица ("I travelled", "My trip"). Только нейтральный стиль: описание места, факты, диалоги без конкретного героя

Форматирование:
- Никаких заголовков типа "Homework Assignment" в начале
- Никаких разделителей --- между блоками
- Никаких фраз "Good luck" или похожих в конце
- Заголовки блоков просто: Task 1 · Vocabulary, Task 2 · Reading и т.д.`;

export async function generateAssignment(userInput: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: GENERATION_PROMPT.replace("{INPUT}", userInput),
    }],
  });
  return (message.content[0] as { text: string }).text;
}

export async function applyEdit(
  original: string,
  editRequest: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Вот задание по английскому:\n\n${original}\n\nВнеси следующие правки: ${editRequest}\n\nВерни полное исправленное задание, сохранив всю структуру и форматирование.`,
    }],
  });
  return (message.content[0] as { text: string }).text;
}
