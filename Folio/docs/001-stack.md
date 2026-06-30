# ADR-001: Выбор стека

Date: 2026-06-04
Status: Accepted — частично пересмотрено (см. «Обновление 2026-06-30»: хостинг и AI изменены; n8n не внедрён)
Updated: 2026-06-08 — уточнено: тот же Supabase-проект и репозиторий, что у english-bot

## Контекст

Нужно выбрать стек для Folio. Бюджет — $0 на старте. Разработчик один (не программист, работает с Claude Code). Первый клиент — один репетитор, нагрузка минимальная.

Folio — расширение english-bot, а не отдельный продукт: общий репозиторий (`english_bot`), общий Supabase-проект (`btlglelwxazdxfqdmcti`), общая инфраструктура. Разделение — на уровне таблиц (`folio_*` vs `eb_*`) и кода (Next.js приложение в своей директории), не на уровне проектов.

## Решение

Next.js + Supabase (существующий проект `btlglelwxazdxfqdmcti`) + TypeScript + shadcn/ui + n8n.

Тот же стек что в Shift Scheduler (Next.js/Supabase) — переиспользуем знания. English-bot уже на Supabase/Deno — Bot Bridge будет естественным, так как обе части используют один и тот же Supabase-проект напрямую.

## Последствия

- Vercel Hobby tier = $0 на старте, Pro = $20/мес при масштабировании
- Supabase Free tier уже используется english-bot — без дополнительных затрат на БД
- n8n на Railway = ~$5/мес
- Итого старт: $0-5/мес
- Repo остаётся монорепо: `supabase/functions/english-bot/` (бот) + директория Next.js приложения Folio рядом

## Обновление (2026-06-30)

Решение по ядру (Next.js + Supabase + TypeScript + shadcn/ui, общий проект и репозиторий) в силе. Отклонения, принятые по ходу разработки:

- **Хостинг: Cloudflare Workers через OpenNext**, а не Vercel. Деплой `npm run cf:deploy`; прод `folio.vasiliy-garro.workers.dev`. Следствие для кода — middleware на Edge (`middleware.ts`, не `proxy.ts`). См. [ARCHITECTURE.md](ARCHITECTURE.md) «Hosting».
- **AI: общий движок Anthropic Claude** (`claude-sonnet-4-6`) с english-bot (`_shared/generate.ts`), а не отдельный OpenAI GPT-4o-mini. OpenAI в проект не вводился (решение о равносилии веб ↔ бот, M7a).
- **n8n не внедрён.** Событийная логика пока в server actions / best-effort; n8n остаётся в планах V2+. Соответственно расходы на Railway пока не возникают.
