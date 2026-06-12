# Folio — Roadmap

> Последнее обновление: 2026-06-08

---

## MVP — Запуск для первого репетитора

### M1: Фундамент
- [x] Инициализация Next.js проекта (App Router, TypeScript, Tailwind, shadcn/ui) — `folio/`
- [x] ~~Supabase проект (отдельный от Swarm/english-bot)~~ Решено: используем существующий проект `btlglelwxazdxfqdmcti` (общий с english-bot), таблицы Folio с префиксом `folio_` (см. [[002-multitenancy]])
- [x] Базовые миграции: folio_workspaces, folio_users, folio_auth_methods, folio_invite_tokens (`20260608120000_folio_init.sql`)
- [x] RLS политики на все таблицы (через `folio_current_workspace_id()`)
- [x] i18n setup (next-intl, ru/en)
- [x] CLAUDE.md, DATA_MODEL.md, ARCHITECTURE.md в репо

### M2: Auth
> M2a (2026-06-12): Telegram-login ядро + seed super_admin + защита роутов. Email/инвайты/Login Widget — позже.
- [ ] Email magic link (Supabase Auth) (отложено в M2a)
- [ ] Инвайт-флоу: репетитор создаёт ученика → письмо → активация (отложено в M2a)
- [x] Super Admin создан (seed-bootstrap, telegram_id 744230399 — временно)
- [x] Telegram login (bot deep-link + одноразовый токен; не Login Widget)
- [x] Роли и middleware (защита роутов через `proxy.ts` + `getUser()`)

### M3: Students
- [ ] Список учеников в админке репетитора
- [ ] Создание/редактирование профиля ученика
- [ ] Дефолтная ставка за урок
- [ ] Архивация (soft-delete + обнуление PII)

### M4: Schedule
- [ ] Интерактивная доска (calendar view)
- [ ] Создание занятия (solo / group, online / offline)
- [ ] Перенос занятия (изменение даты)
- [ ] Отмена занятия
- [ ] Отметка "состоялось" → триггер журнала
- [ ] Провал в занятие: карточка с данными ученика

### M5: Billing Tracker
- [ ] Автоначисление при отметке "состоялось"
- [ ] Переопределение ставки в конкретном занятии
- [ ] Фиксация оплаты репетитором вручную
- [ ] Баланс ученика (view)
- [ ] Таблица долгов в админке с фильтрами по периоду

### M6: Lesson Journal
- [ ] Форма журнала после отметки "состоялось"
- [ ] История записей по ученику
- [ ] Поля: тема, уровень, комментарий, оценка прогресса

### M7: Bot Bridge
- [ ] english-bot пишет в `homework_templates`
- [ ] Список домашек в админке репетитора
- [ ] Назначение домашки ученику
- [ ] Отправка через Telegram бота / email

### M8: Student Cabinet
- [ ] Расписание ученика (solo/group пометки)
- [ ] Баланс и история оплат
- [ ] Список домашек и их статус

### M9: Super Admin
- [ ] Создание воркспейса
- [ ] Создание репетитора
- [ ] Список всех воркспейсов

---

## V2 — После обратной связи

- [ ] Progress + Achievements (ачивки через OpenAI)
- [ ] Template Editor (редактор промптов в UI)
- [ ] Notifications: UI настройки, n8n триггеры
- [ ] Statistics dashboard для репетитора
- [ ] Групповые занятия: полная поддержка состава
- [ ] Google Calendar sync

---

## V3 — Масштабирование

- [ ] Онбординг второго репетитора (самостоятельная регистрация)
- [ ] Публичный лендинг Folio
- [ ] Монетизация: subscription
- [ ] PWA / мобильное приложение
- [ ] GDPR документы и согласия
