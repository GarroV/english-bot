# ADR-001: Выбор стека

Date: 2026-06-04
Status: Accepted

## Контекст

Нужно выбрать стек для Folio. Бюджет — $0 на старте. Разработчик один (не программист, работает с Claude Code). Первый клиент — один репетитор, нагрузка минимальная.

## Решение

Next.js + Supabase + TypeScript + shadcn/ui + n8n.

Тот же стек что в Shift Scheduler (Next.js/Supabase) — переиспользуем знания. English-bot уже на Supabase/Deno — Bot Bridge будет естественным. n8n на Railway закрывает всю событийную логику без написания cron jobs.

## Последствия

- Vercel Hobby tier = $0 на старте, Pro = $20/мес при масштабировании
- Supabase Free tier = $0 (500MB, 50k MAU) — хватит надолго
- n8n на Railway = ~$5/мес
- Итого старт: $0-5/мес
