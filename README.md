# Yomu — Adaptive Japanese Graded Reader

A local-first, browser-only MVP for graded Japanese reading. Yomu generates short stories at the learner's current level, renders them with furigana and instant word/phrase glosses, tracks vocabulary, and adapts the next story from short end-of-story feedback.

There is no backend, no account, and no telemetry. Learner data lives in IndexedDB. Story generation uses an OpenAI-compatible chat-completions endpoint supplied by the learner (BYOK); the default **offline mock provider** makes the entire loop work without a key.

## Quick start

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Do **not** open `index.html` through `file://`; the tokenizer dictionary is fetched over HTTP.

Production static build:

```bash
npm run build
npm run preview
```

`npm run build` outputs `dist/` as plain HTML, JS, CSS, the generated tokenizer worker, kuromoji's browser UMD build, and the gzipped kuromoji dictionary. Serve the directory from the domain root (the Vite base is `/`).

`npm install`/`npm run dev`/`npm run build` run `scripts/copy-kuromoji.mjs`, which:

1. copies kuromoji's dictionary into `public/kuromoji-dict/` with a `.bin` suffix so static servers do not double-decompress gzip files;
2. copies kuromoji's browser UMD build to `public/vendor/kuromoji.js` and patches its browser dictionary loader to use native `DecompressionStream`.

Those generated assets are ignored by git. `DecompressionStream` is available in current Chrome, Edge, Firefox, and Safari (16.4+).

## The default offline mock

Onboarding defaults to the mock provider. It uses the same generation contract, worker tokenization, validation, repair/fallback pipeline, reader, feedback, adaptation, and scheduling as the live provider. It selects one of the 15 bundled stories (three per JLPT band), rotates recently used stories, and can add a short review prelude containing up to two tracked words. Mock stories are labeled in the reader and require no network access.

The fallback corpus is loaded lazily and then tokenized with the same Web Worker; validated token data is saved with the story so rereading is instant. The mock intentionally does not call a model and may produce less natural review-word contexts than a live provider.

## Live OpenAI-compatible provider

Open **Settings → Story provider**:

- Provider: `OpenAI-compatible (BYOK)`
- Base URL: e.g. `https://api.openai.com/v1`
- Model: any chat-completions-compatible model
- API key: stored in `localStorage` under a Yomu-specific key

Use **Test connection** to exercise the actual POST `/chat/completions` path. The endpoint must support CORS for browser requests and streaming SSE chat completions. Provider fields save automatically on change/blur; **Save provider** is also available, and the Settings page shows the active provider and whether a key is stored.

The API key is:

- masked in the UI and never rendered as plain text;
- never included in JSON exports;
- never written to generation logs or event logs;
- removed by **Clear all data**.

Browser-held keys are visible to any script on the same origin. Use a scoped key. Public distribution requires revisiting key handling, CSP, content policy, and rate limits (see PRD §16–§17).

## Implemented MVP

- Three-step onboarding: self-selected level, furigana default, interests, story length, content notice, first story.
- Home/library with level card, due words, topic/length controls, recent stories, compact stats.
- Reader:
  - paragraph layout, 42em reading column, adjustable text size from Settings and the reader toolbar, high-contrast and reduced-motion support;
  - `Off` / `Always` / `On hover/tap` / `Learn-only` furigana with okurigana-aware ruby;
  - token popovers with reading, dictionary form, POS, contextual gloss, JLPT, tracked state, phrase translation, full sentence translation, report action, and Add/Added;
  - add-to-word-list with duplicate prevention, Undo toast, and no reading-position movement;
  - roving-tabindex keyboard navigation (`F`, `T`, arrow keys, `Enter`, `A`, `Esc`), touch lookup, pinned popovers, viewport clamping;
  - autosaved progress, resume/start-over banner, estimated time, progress bar, finish action, regenerate/report.
- Generation pipeline:
  - OpenAI-compatible streaming adapter and deterministic offline provider;
  - compact JSON gloss contract, automatic JSON repair, client re-tokenization, and offset/phrase/text alignment;
  - validation for length, coverage, new-word cap, review-word occurrences, kanji level, language, repetition, and schema;
  - soft near-miss warnings for length/coverage/kanji so a usable provider story is not discarded for a small miss;
  - targeted repair attempts, level drop retry, and bundled fallback with exact diagnostics;
  - saved generation metadata and diagnostics logs without keys.
- Feedback:
  - comprehension, difficulty, optional interest, and up to six tracked words that actually appeared;
  - every check shows the sentence where the word appeared; checks are skippable;
  - level adaptation with EWMA hardness, behavioral lookup signals, movement cap, consolidation/streak rules;
  - word recognition updates and passive exposure, stability ladder, due dates, cooldown, and graduation.
- Word list:
  - search, Learning/Known/Suspended/All filters, several sorts, due/seen/last-seen info;
  - mark known, suspend/resume, needs-review, delete, CSV export, “Next story” and above-level badges.
- Story history with rereading and read-only saved feedback.
- Reading stats page with level trend, comprehension, vocabulary counts, and reading volume.
- Settings with level changes (resets adaptation history), furigana, text size, translations, length, interests, provider, connection test, JSON export/import, typed-confirmation clear-all.
- Versioned JSON export/import: no API key, preview counts, deduplication, newer feedback wins, restore into an empty profile.
- Accessibility: WCAG-oriented contrast, keyboard controls, roving tokens, focus management, ARIA labels, plain-text copy without ruby artifacts, touch targets, reduced motion.
- Data: Dexie schema with a real v1→v2 migration, indexes, atomic feedback/import/story saves, and no partial story on failed generation.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

The Vitest suite covers:

- furigana/okurigana segmentation;
- contract token/phrase alignment and text integrity;
- level adaptation formulas, caps, streak rules, and skipped feedback;
- SRS recognition, stability, due dates, graduation, cooldowns, and review selection;
- export parsing, merge/deduplication, restore-into-empty behavior, and API-key exclusion.

Browser end-to-end tests were run against both the dev server and the production `dist/` build with the offline mock: onboarding → story → popover → add word → furigana cycle → feedback → adaptation → next story containing the added word → reload persistence → word list/settings.

The live adapter was also tested against the real DeepSeek `deepseek-chat` endpoint using local `.env` credentials: two consecutive live stories generated successfully, including a tracked word (`六`) reappearing four times in the review story, feedback submission, adaptation, and a second story with no fallback and no console errors. A local fake OpenAI-compatible SSE server was used earlier to verify streaming/provider metadata. Temporary test harnesses are not shipped.

## Architecture

```
src/
  app.ts                 hash router + application shell
  db.ts                  Dexie schema, migrations, repositories, stats
  types.ts               shared domain types
  content/
    fallbackStories.ts   15 original graded stories (lazy loaded)
    glossary.ts          compact bundled gloss/JLPT lookup
    levelLists.ts        level bands, samples, kanji heuristics, interests
  generation/
    contract.ts          JSON contract types, parsing, shape validation
    prompt.ts            system/user/repair prompts
    openai.ts            streaming OpenAI-compatible adapter
    mock.ts              deterministic offline provider
    offline.ts           fallback/mock contract construction
    pipeline.ts          review selection, generation, repair, lowering, fallback, save
  lib/
    alignment.ts         client tokenizer ↔ contract alignment
    coverage.ts          coverage/new-word/kanji analysis
    validation.ts        generation gates and duplicate detection
    furigana.ts          okurigana-aware ruby segmentation
    level.ts             continuous level scale, caps, length ranges
    adaptation.ts        feedback-based level update
    srs.ts               recognition, stability, scheduling, cooldowns
    exportImport.ts      pure export/import merge logic
  tokenizer/
    client.ts            lazy worker client + status
    protocol.ts          worker message types
  ui/                    DOM helpers, toast, modal, generation overlay
  views/                 onboarding, home, reader, feedback, words, history, settings, stats
  styles/                tokens + app + reader styles
public/
  yomu-tokenizer.worker.js   classic kuromoji worker (generated assets reference it)
  favicon.svg
scripts/
  copy-kuromoji.mjs          dictionary/UMD generation
tests/                       Vitest suites
```

### Data model

Dexie stores `profile`, `words`, `stories`, `feedback`, `generationLogs`, `settings`, and `events`. Words are keyed by dictionary form plus reading; stories are saved with their already-aligned token/phrase/furigana data. Provider credentials are the only localStorage data.

### Privacy / network boundaries

The app makes no network requests except same-origin static assets and the provider endpoint the learner configured. The CSP allows `https:` plus localhost HTTP endpoints for local model servers; BYOK endpoints are dynamic, so the production policy is intentionally not a compile-time allowlist. All model content is inserted as text nodes.

## Known deviations / intentionally deferred

- P1 items from the PRD are not implemented: paragraph difficulty pulses, the calibration test, auto-suggested words, and periodic Known-word rechecks. A compact stats page is included.
- The mock provider limits review-word introductions to two per story to keep its generated review prelude inside the level length band. Live generation uses the full review budget.
- Fallback stories are tokenized lazily and cached in the saved story rather than shipping build-time token JSON.
- The generation contract was compacted to a content-word gloss list because models were unreliable at emitting full token offsets; the client tokenizer remains authoritative and repairs/normalizes the contract.
- Near-miss length (70–130% of the preferred range) and coverage (93–95%) are accepted with warnings rather than triggering fallback. The kanji whitelist is advisory because the bundled kanji list is intentionally compact and every token still gets furigana. Selected review words are advisory when the provider cannot fit them naturally; they remain due.
- `.env` is ignored by git and is not read by the client bundle. Provider keys are entered in Settings and stored only in localStorage; local `.env` files are for automated testing only.
- BudouX is not included; the reader uses native Japanese line breaking (`line-break: strict`).
- There is no audio/TTS, accounts, cloud sync, individual story deletion, or user-authored story import.
- OpenAI-compatible streaming is implemented; provider-specific APIs outside chat completions are not.
- Visual cross-browser and 2,000-character render benchmarks remain beta work.

## No secrets

No API keys or provider credentials are committed. The settings UI stores the key only in the learner's browser after entry. `.gitignore` excludes build output and generated kuromoji assets.
