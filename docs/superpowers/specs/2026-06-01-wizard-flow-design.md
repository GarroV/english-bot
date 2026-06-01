# Wizard Flow Design

**Date:** 2026-06-01

## Overview

Replace the "all params at once" clarify screen with a sequential wizard: each tap advances a single self-rewriting message through one step at a time. No "✅ Генерировать" confirm button — the last step fires generation immediately.

## Step Order

**Reading / Vocabulary:**
`Тип → Версия → Уровень → Направленность → Генерация`

**All other types (Translation, VERB_SENTENCES):**
`Тип → Уровень → Направленность → Генерация`

**VERB_SENTENCES (no verb in topic):**
`Тип → Уровень → Направленность → [ask verb text] → Генерация`

## Step Details

### Start message
`/start` and "📝 Новое задание" send only:
> Напиши тему задания:

### Step 1 — Тип
Triggered when user submits topic text. Bot auto-detects module type (existing `detectModule`) and pre-marks it with ✓.

Summary text: `Выбери тип задания:`

Buttons (3 rows):
```
Reading           Vocabulary
Перевод (тексты)  Перевод (пред.)
     Глаголы (пред.)
```

### Step 2a — Версия (Reading / Vocabulary only)
Triggered when user taps a Reading or Vocabulary type button.

Summary text: `✓ {type}\n\nВерсия:`

Buttons (1 row):
```
Без ответов    С ответами для учителя
```

### Step 2b — Уровень (non-Reading/Vocabulary)
Triggered when user taps Translation or VERB_SENTENCES type button.

Summary text: `✓ {type}\n\nУровень:`

Buttons (1 row): `A2  B1  B2  C1  C2`

### Step 3 — Уровень (after Версия, Reading/Vocabulary only)
Summary text: `✓ {type} · {version}\n\nУровень:`

Buttons: `A2  B1  B2  C1  C2`

### Step 4 — Направленность
Summary text: `✓ {type} · [{version} · ]{level}\n\nНаправленность:`

Buttons (1 row): `подросток  молодой взрослый  взрослый`

### Final step
- Tapping age button → generation fires immediately (no confirm)
- For VERB_SENTENCES with no verb detected: set `WAITING_VERB`, ask "Какой глагол? (например: must / have to)"
- For VERB_SENTENCES with verb in topic: generate immediately

## Version Labels

Internal values unchanged (`student` / `teacher`). Display labels:
- `student` → `Без ответов`
- `teacher` → `С ответами для учителя`

## Session Context

Add `wizard_step` field to `SessionContext`:
```typescript
wizard_step?: "type" | "version" | "level" | "age";
```

State stays `CLARIFYING` throughout the wizard. `wizard_step` tells the handler which step is active and what button tap means.

## Callback Data

New prefixes (replace old `clr_` prefixes):
- `wiz_type_{MODULE_TYPE}` — type selection
- `wiz_ver_{version}` — version selection
- `wiz_level_{level}` — level selection
- `wiz_age_{ageGroup}` — age selection

Old `clr_confirm` callback removed entirely.
Old `clr_type_`, `clr_level_`, `clr_age_`, `clr_ver_` callbacks removed.

## Handler Changes

### `handlers/clarify.ts`
- Remove `buildClarifyMessage` (replaced by `buildWizardMessage`)
- Add `buildWizardMessage(step, moduleType, params): {text, kb}` — builds per-step keyboard
- Replace `handleClarifyParam` with `handleWizardStep(query)` — routes by `wizard_step` and advances
- Remove `handleClarifyConfirm` (no confirm button)
- Keep `handleVerbInput` and `handleTopicInput` (unchanged)

### `handlers/request.ts`
- After `detectModule`, set `wizard_step: "type"` in context
- Send `buildWizardMessage("type", moduleType, params)` instead of old clarify message

### `handlers/start.ts`
- Replace `WELCOME` with just: `"Напиши тему задания:"`

### `index.ts`
- Replace `clr_type_` / `clr_level_` / `clr_age_` / `clr_ver_` / `clr_confirm` routes
- Add single route: `data.startsWith("wiz_")` → `handleWizardStep(query)`

### `types.ts`
- Add `wizard_step?: string` to `SessionContext`

## Removed States

`WAITING_TOPIC` state is no longer needed (welcome always asks for topic text → `WAITING_REQUEST`). Keep in the union for now to avoid breaking existing sessions, but don't route to it.

## Files Changed

| File | Change |
|------|--------|
| `lib/types.ts` | Add `wizard_step` to `SessionContext` |
| `handlers/clarify.ts` | Replace clarify UI with wizard; remove confirm; keep `handleVerbInput` |
| `handlers/request.ts` | Set `wizard_step: "type"`, use `buildWizardMessage` |
| `handlers/start.ts` | Simplify welcome message |
| `index.ts` | Replace `clr_*` routes with single `wiz_*` route |
