# ADR-001: Выбор стека

Date: 2026-06-04
Status: Accepted
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
