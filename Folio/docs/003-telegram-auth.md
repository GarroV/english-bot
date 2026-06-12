# ADR-003: Telegram-login для Folio (M2a)

Date: 2026-06-12
Status: Accepted

## Контекст
M2 (Auth) изначально планировал email magic link + Telegram Login Widget + инвайты + n8n. Пользователь пересмотрел первый заход: вход целиком на Telegram, без n8n, первый super_admin захардкожен. Telegram Login Widget требует публичный HTTPS-домен на боте (BotFather), не работает на localhost.

## Решение
- Вход через **bot deep-link + одноразовый токен**, переиспользуя english-bot (а не Login Widget). Таблица `folio_login_tokens` (pending→confirmed→consumed, TTL 5 мин, single-use, deny-all RLS, service-role). english-bot ловит `/start folio_login_<token>`, резолвит юзера по telegram_id и помечает токен confirmed.
- **Сессия Supabase** выпускается на сервере Folio: `admin.generateLink({type:'magiclink'})` → `verifyOtp({token_hash, type:'email'})` (magic link и email OTP делят реализацию). @supabase/ssr пишет auth-куки.
- **Bootstrap** первого super_admin — seed-миграция (telegram_id 744230399). Временное решение.
- **Защита роутов**: `proxy.ts` (Next 16) — оптимистичная проверка куки; реальная проверка в server-компоненте через `getUser()`.

## Последствия
- Работает на localhost, без Vercel/туннелей/доменов; один бот.
- Откладываются: email/magic-link как пользовательский метод, инвайты репетиторов/учеников, n8n, Telegram Login Widget.
- Сидинг `auth.users` через SQL: token-колонки (confirmation_token, recovery_token, email_change*, phone_change*, reauthentication_token) ОБЯЗАТЕЛЬНО '' а не NULL — иначе GoTrue падает с "Database error finding user".
- Bootstrap super_admin — временный; заменить нормальным онбордингом.
