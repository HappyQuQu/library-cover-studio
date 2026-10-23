# Contributing

[简体中文](CONTRIBUTING.md) · **English** · [Project overview](README.en.md)

Describe the problem your change solves. UI changes must include Simplified Chinese and English; Chinese defines the translation keys and structure.

## Development and pull requests

Use Node.js 24.22.1 LTS and pnpm 10.28.0; follow the [local development instructions](README.en.md#development). Keep secrets, `.env`, databases, user artwork, build outputs and personal test data out of commits.

Before submitting, run:

```bash
pnpm check:i18n
pnpm test
pnpm build
```

Explain the problem, resulting behavior and validation in the PR. Include Chinese and English screenshots for UI changes, identifying fixture data. Rendering, scheduling and API changes must retain existing data and business parameters.

## Translation rules

- Update both `web/src/locales/zh-CN/<module>.ts` and `en-US/<module>.ts`. English uses `satisfies TranslationShape<typeof zh>`; register new modules in both indexes.
- Use semantic keys, complete sentences and named interpolation: `t('templates.deleteConfirm', { name })`. Avoid sentence fragments, appended plural suffixes and call-site `defaultValue` text.
- Counts use `count` and `_one` / `_other` in both languages. Use `formatDisplayNumber` and `formatDisplayDate`. Schedule displays use the task's `timezone`; locale must not alter Cron or timestamps.
- Use sentence case for English controls, such as “Save changes” and “Template details”. Preserve product names, formats, model IDs and technical identifiers. Translate accessible names, tooltips, image alternatives, empty states, errors and notifications too.
- Translate during React rendering. Store persistent feedback as codes or `DisplayMessage` descriptors. Async notifications use `i18n.t` when the operation finishes; existing notifications need not be translated retroactively.

## Preserve state and source content

A first visit always uses Chinese. Explicit preferences use the browser's `lcs-language` entry and synchronize across tabs of the same origin. Do not add automatic browser-language detection, database locale fields or locale-dependent page keys.

Changing language must retain forms, wizard steps, canvas objects, undo history and drafts, without repeating preview or AI requests. Preserve user input, library/template names, canvas text and variable bindings, AI instructions/conversations/output, community descriptions, release notes and legacy diagnostics. Fill example text and AI shortcuts only when users explicitly create or choose them.

Add stable API codes and structured parameters while preserving legacy fields and HTTP behavior. Translate through `getLocalizedApiError` or explicit mappings. Unknown feedback gets a localized generic message; `ErrorDetails` can expose the original diagnosis. Do not infer meaning by matching Chinese error text.

## Checks and acceptance

`pnpm check:i18n` checks all TS/TSX under `web/src`, with separate resource validation: keys, interpolation, plurals, Chinese left in English resources and hardcoded Chinese. Comments are excluded. Exact source-content exceptions in `scripts/i18n-check.ts` specify their file, value and reason; do not exempt whole pages or directories. Hardcoded English and translation quality still require human review.

Follow the [bilingual QA checklist](doc/I18n_QA.md), including success, failure and language changes with unsaved state. Check English controls at widths of 390, 1024 and 1440 pixels. The disposable fixture covers browser behavior; backend integration tests in `pnpm test` validate real business logic separately. Record unverified cases and distinguish mock responses from real uploads or external AI calls.
