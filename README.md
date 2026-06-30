# English Bot + Folio

Монорепозиторий двух связанных проектов с общим Supabase-проектом (`btlglelwxazdxfqdmcti`) и общим движком генерации заданий (`supabase/functions/_shared/generate.ts`, Anthropic Claude).

- **English Bot** — Telegram-бот генерации учебных заданий по английскому. Deno / Supabase Edge Function. Документация: [docs/](docs/) ([README](docs/README.md), [BOT.md](docs/BOT.md)).
- **Folio** — веб-кабинет репетитора (ученики, расписание, учёт денег, журнал, домашки). Next.js 16 на Cloudflare Workers. Документация: [Folio/](Folio/) ([README](Folio/README.md), [docs/](Folio/docs/)).

Конвенции и правила работы — в [CLAUDE.md](CLAUDE.md) (и [Folio/CLAUDE.md](Folio/CLAUDE.md) для веб-части).
