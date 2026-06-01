# Verb Sentences Module — Design

**Date:** 2026-06-01

## Overview

Add a new module type `VERB_SENTENCES` that generates 20 Russian sentences for translation, each requiring the use of a specific English verb or pair of verbs (e.g. "must / have to"). If the user does not specify a verb in their request, the bot asks before generating.

## Module Type

Add `VERB_SENTENCES` to the `ModuleType` union in `types.ts` and all places that enumerate module types: `claude.ts`, `clarify.ts`, `module_detect.ts`.

## Detection (`module_detect.ts`)

New regex checked **before** `TRANSLATION_SENTENCES`:

```
/задание на глагол|упражнение на глагол/
```

Verb extraction — new `extractVerb(input: string): string`:
- Match text after "глагол" up to a comma or end of line
- Returns empty string if not found

## Parameters (`types.ts`)

Add `targetVerb?: string` to `ClarifyingParams`. Populated from `extractVerb` at request time and stored in session context.

## Clarify Screen (`clarify.ts`)

- Add "Глаголы (пред.)" button to module type selector (replaces nothing, added as 5th option in a new row)
- Hide version row (student/teacher) when `moduleType === "VERB_SENTENCES"` — same as translation types

## Missing-Verb Flow

In `handleClarifyConfirm`, after all params are defaulted:

1. If `moduleType === "VERB_SENTENCES"` and `params.targetVerb` is empty → set state `WAITING_VERB`, ask: `"Какой глагол? (например: must / have to)"`
2. New handler `handleVerbInput` (in `clarify.ts`): saves input to `params.targetVerb`, then calls `generateAndSend`
3. New state `WAITING_VERB` in `types.ts`
4. Route `WAITING_VERB` → `handleVerbInput` in `index.ts`

## Prompt (`claude.ts`)

```
Ты опытный преподаватель английского языка. Создай упражнение на перевод предложений.

Запрос: {INPUT}
Глагол(ы): {VERB}
Уровень: {LEVEL}

Структура:
1. Первая строка: Module: Verb Sentences · Level: {LEVEL} · Verb: {VERB}
2. Заголовок: Переведите, используя {VERB}
3. 20 пронумерованных предложений на русском языке

Требования к предложениям:
- Каждое предложение требует использования указанного глагола
- Охватывают разные значения и контексты (возможность, разрешение, обязательность и т.д.)
- Постепенно усложняются от 1 к 20
- Уровень лексики и синтаксиса соответствует {LEVEL}

Правила (строго):
- Только русские предложения — никаких переводов, никаких ответов
- Никаких подсказок в скобках
- Никаких объяснений грамматики
- Никаких разделителей ---
```

## Teacher Guide

Not applicable for `VERB_SENTENCES` — translation is subjective, no answer key. The version selector is hidden; `clrParams.version` remains undefined for this type.

## Files Changed

| File | Change |
|------|--------|
| `lib/types.ts` | Add `VERB_SENTENCES` to `ModuleType`; add `targetVerb` to `ClarifyingParams`; add `WAITING_VERB` to `State` |
| `lib/module_detect.ts` | Add detection regex and `extractVerb` function |
| `lib/claude.ts` | Add `VERB_SENTENCES_PROMPT`; update `buildPrompt` to inject `{VERB}` |
| `handlers/clarify.ts` | Add "Глаголы (пред.)" to module selector; hide version row; add `handleVerbInput`; check missing verb in `handleClarifyConfirm` |
| `handlers/request.ts` | On detection of `VERB_SENTENCES`, call `extractVerb` and store in `params.targetVerb` |
| `index.ts` | Route `WAITING_VERB` state → `handleVerbInput` |
