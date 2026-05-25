# English Bot — Changelog & Dev Notes

История доработок бота для удобного отслеживания изменений.

---

## 2026-05-25

### Диагностика: бот не отвечает

**Симптом:** бот полностью молчит после пополнения баланса Anthropic.

**Причина:** секрет `ANTHROPIC_KEY` не был задан в Supabase. В секретах был только `OPENAI_API_KEY` (от старой версии). Код в `lib/claude.ts:4` читает `Deno.env.get("ANTHROPIC_KEY")` — получал `undefined`, Anthropic SDK падал при инициализации.

**Фикс:**
```bash
supabase secrets set ANTHROPIC_KEY=<ключ>
supabase functions deploy english-bot --no-verify-jwt
```

---

## Архитектура (справка)

- **Runtime:** Deno / Supabase Edge Function (slug: `bot`, dir: `supabase/functions/english-bot/`)
- **LLM:** Anthropic claude-sonnet-4-20250514 через `lib/claude.ts`
- **База:** Supabase Postgres через `lib/db.ts`
- **Telegram:** webhook, обработка в `index.ts` → handlers/
- **PDF:** генерация в `lib/pdf.ts`, отдача через `handlers/pdf_download.ts`

## Структура модулей

| Тип модуля | Промпт |
|-----------|--------|
| `READING_MODULE` | `READING_PROMPT` |
| `VOCABULARY_MODULE` | `VOCABULARY_PROMPT` |
| `TRANSLATION_TEXTS` | `TRANSLATION_TEXTS_PROMPT` |
| `TRANSLATION_SENTENCES` | `TRANSLATION_SENTENCES_PROMPT` |
