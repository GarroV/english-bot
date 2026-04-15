import os
import io
import anthropic
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler,
    filters, ContextTypes, ConversationHandler, CallbackQueryHandler
)

load_dotenv()
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_KEY")

claude = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

# Состояния диалога — бот всегда находится в одном из этих состояний
# и реагирует только на то, что уместно в данный момент
WAITING_REQUEST, CONFIRMING, POST_GENERATION, EDITING = range(4)

# Словарь для хранения последнего сгенерированного задания по каждому пользователю
# Ключ — Telegram ID пользователя, значение — текст задания
user_assignments = {}


# Отправляет приветствие и переводит бота в режим ожидания запроса
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Привет! Я генерирую домашние задания по английскому.\n\n"
        "Напиши запрос в формате:\n"
        "уровень, тема, возраст\n\n"
        "Например: A2, еда и рестораны, подросток"
    )
    return WAITING_REQUEST


# Принимает запрос от пользователя, сохраняет его и показывает кнопки подтверждения
async def receive_request(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_input = update.message.text.strip()
    context.user_data["last_request"] = user_input

    keyboard = [
        [InlineKeyboardButton("✅ Генерировать", callback_data="confirm")],
        [InlineKeyboardButton("✏️ Изменить запрос", callback_data="change_request")],
    ]
    await update.message.reply_text(
        f"Запрос:\n*{user_input}*\n\n"
        "Убедитесь, что указан уровень (A1/A2/B1/B2/C1), тема и возраст ученика.\n\n"
        "Всё верно?",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown",
    )
    return CONFIRMING


# Срабатывает при нажатии кнопки "Генерировать" — запускает создание задания
async def confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    user_input = context.user_data.get("last_request", "")
    await query.edit_message_text("Генерирую задание, подожди 10–20 секунд...")

    result = _generate_assignment(user_input)
    user_assignments[query.from_user.id] = result

    await _send_assignment(query.message, result)
    return POST_GENERATION


# Срабатывает при нажатии "Изменить запрос" — возвращает к вводу нового запроса
async def change_request_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await query.edit_message_text("Напиши новый запрос (уровень, тема, возраст):")
    return WAITING_REQUEST


# Срабатывает при нажатии "Поправить что-то" — просит описать нужные изменения
async def edit_assignment_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await query.message.reply_text("Что именно поправить? Опиши изменения:")
    return EDITING


# Принимает описание правок от пользователя и просит Claude внести их в задание
async def apply_edit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    edit_request = update.message.text.strip()
    user_id = update.effective_user.id
    original = user_assignments.get(user_id, "")

    await update.message.reply_text("Вношу правки...")

    message = claude.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": (
                f"Вот задание по английскому:\n\n{original}\n\n"
                f"Внеси следующие правки: {edit_request}\n\n"
                "Верни полное исправленное задание, сохранив всю структуру и форматирование."
            ),
        }],
    )

    result = message.content[0].text
    user_assignments[user_id] = result

    await _send_assignment(update.message, result)
    return POST_GENERATION


# Срабатывает при нажатии "Скачать PDF" — генерирует файл и отправляет его пользователю
async def download_pdf_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer("Генерирую PDF...")

    user_id = query.from_user.id
    text = user_assignments.get(user_id, "")

    try:
        pdf_bytes = _generate_pdf(text)
        filename = _make_filename(text)
        await query.message.reply_document(
            document=io.BytesIO(pdf_bytes),
            filename=filename,
            caption="Готово!",
        )
    except ImportError:
        await query.message.reply_text(
            "Для генерации PDF установи библиотеку:\n`pip install fpdf2`",
            parse_mode="Markdown",
        )
    except Exception as e:
        await query.message.reply_text(f"Ошибка при создании PDF: {e}")

    return POST_GENERATION


# Отвечает пользователям, которые пишут боту до нажатия /start
async def not_started(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Привет! Напиши /start чтобы начать."
    )


# Отправляет запрос в Claude и возвращает готовое задание в виде текста
def _generate_assignment(user_input: str) -> str:
    prompt = f"""Ты опытный репетитор английского языка. Создай домашнее задание на основе запроса: {user_input}

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
- Заголовки блоков просто: Task 1 · Vocabulary, Task 2 · Reading и т.д."""

    message = claude.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


# Отправляет задание пользователю с кнопками действий.
# Если текст длиннее 4096 символов (лимит Telegram) — разбивает на два сообщения
async def _send_assignment(message, text: str):
    keyboard = [
        [InlineKeyboardButton("✏️ Поправить что-то", callback_data="edit_assignment")],
        [InlineKeyboardButton("📄 Скачать PDF", callback_data="download_pdf")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if len(text) > 4096:
        mid = text.rfind("\n", 0, 4000)
        await message.reply_text(text[:mid])
        await message.reply_text(text[mid:], reply_markup=reply_markup)
    else:
        await message.reply_text(text, reply_markup=reply_markup)


# Формирует имя файла из первой строки задания, например: A2_Food_and_Restaurants.pdf
def _make_filename(text: str) -> str:
    import re
    first_line = text.split("\n")[0]
    level_match = re.search(r"Level:\s*(\S+)", first_line)
    topic_match = re.search(r"Topic:\s*([^·]+)", first_line)
    level = level_match.group(1).strip() if level_match else "homework"
    topic = topic_match.group(1).strip() if topic_match else ""
    topic_slug = re.sub(r"[^\w\s-]", "", topic).strip().replace(" ", "_")
    return f"{level}_{topic_slug}.pdf" if topic_slug else f"{level}.pdf"


# Генерирует PDF-файл из текста задания и возвращает его как набор байтов
def _generate_pdf(text: str) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(20, 20, 20)

    # Ищем системный шрифт с поддержкой Unicode (нужен для корректного отображения текста)
    font_paths = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",  # macOS
        "/Library/Fonts/Arial Unicode MS.ttf",                    # macOS alt
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",        # Linux
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",                 # Linux alt
    ]

    font_loaded = False
    for path in font_paths:
        if os.path.exists(path):
            pdf.add_font("Main", "", path)
            font_loaded = True
            break

    if font_loaded:
        pdf.set_font("Main", size=11)
    else:
        pdf.set_font("Helvetica", size=11)

    for line in text.split("\n"):
        if line.strip() == "":
            pdf.ln(4)
        else:
            if not font_loaded:
                line = line.encode("latin-1", errors="replace").decode("latin-1")
            pdf.multi_cell(0, 6, line)
            pdf.ln(1)

    return bytes(pdf.output())


# Точка входа: регистрирует все обработчики и запускает бота
def main():
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    # ConversationHandler управляет состояниями диалога —
    # бот понимает, на каком этапе находится каждый пользователь
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            WAITING_REQUEST: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_request)
            ],
            CONFIRMING: [
                CallbackQueryHandler(confirm_callback, pattern="^confirm$"),
                CallbackQueryHandler(change_request_callback, pattern="^change_request$"),
            ],
            POST_GENERATION: [
                CallbackQueryHandler(edit_assignment_callback, pattern="^edit_assignment$"),
                CallbackQueryHandler(download_pdf_callback, pattern="^download_pdf$"),
            ],
            EDITING: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, apply_edit)
            ],
        },
        fallbacks=[CommandHandler("start", start)],
    )

    app.add_handler(conv_handler)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, not_started))

    print("Бот запущен...")
    app.run_polling()


if __name__ == "__main__":
    main()