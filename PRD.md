# Yomu — Adaptive Japanese & Mandarin Chinese Graded Reader

**Product Requirements Document**

| Field | Value |
|---|---|
| Status | Implemented MVP, smoke-tested; living document |
| Version | 1.0 |
| Owner | Ken Pang |
| Date | 2026-10-25 |
| Product | Yomu |
| Scope | Bilingual adaptive reader: Japanese (JLPT N5–N1) and Simplified Mandarin Chinese (HSK 1–6) |

---

## 1. Summary

Yomu is a browser-based graded reading application for native English speakers learning Japanese or Mandarin Chinese. It generates short stories calibrated to the learner's current level, renders them with optional furigana or pinyin, and shows English readings and glosses on hover, tap, or click. A one-click action adds a word to a tracked vocabulary list. Tracked words are deliberately recycled into later stories, then fade as recognition strengthens.

After each story, a short feedback card asks how the story felt and checks recognition of tracked words that actually appeared. Those responses update both the learner's level estimate and each word's schedule, so the next story is generated from a fresher model of what the learner knows.

The core bet: personalized, recycled, comprehensible input beats static graded readers and isolated flashcards for building reading fluency. Repetition happens inside coherent new stories, not drills.

The MVP is local-first. Learner data stays in IndexedDB. Story generation is browser-only and BYOK (bring your own OpenAI-compatible endpoint and key). An offline mock provider makes the full loop work without a key. No backend, account, or telemetry is required.

## 2. Problem

Static graded readers come in coarse level bands and cannot know which words an individual has already learned. They either over-explain, bore the reader, or jump to material the reader cannot decode. Dictionaries and translators break reading flow. Flashcard apps teach words in isolation and do not build reading stamina or inference skills.

A learner needs three things at once:

1. **Something readable now.** Material at roughly 95% known-word coverage, at their current level.
2. **Zero-friction lookup and capture.** A reading, a meaning, and an “add to my words” action without leaving the page.
3. **Memory that carries across stories.** New and weak words return naturally, spaced out, and stop appearing once they are firmly recognized.

Existing tools solve at most one of these well. Yomu connects all three in one loop for two target languages.

## 3. Goals, non-goals, and success metrics

### 3.1 Product goals

- A learner can open the app and be reading a suitable story in under 60 seconds, then generate the next one in one click.
- Default stories are readable at the language’s coverage target and finishable in 2–5 minutes.
- Lookup and word capture take under two seconds and never navigate away from the text.
- Difficulty adapts after every story. After onboarding, the learner never has to manually choose a level.
- Tracked words recur with spacing and fade as recognition improves.
- Japanese and Chinese progress are independent and never mix.
- Learner data is local, exportable, and never lost.
- The same product loop works without a provider key through the offline mock.

### 3.2 Beta success metrics

| Metric | Target | Source |
|---|---|---|
| Story completion rate | ≥80% | Local event log |
| Median comprehension self-rating | ≥4 / 5 | Feedback |
| Stories rated “just right” | ≥60% | Feedback |
| Lookups per 100 characters | ≤3 | Local event log |
| Tracked words marked “Knew it” after 3+ exposures | ≥70% | Feedback |
| Level calibration error | ≤0.5 sub-level | Feedback + model |
| Generation success without fallback | ≥95% | Generation log |
| Chinese generation accepted (with warnings allowed) | ≥95% | Generation log |
| p95 time to first story text | ≤8 s | Performance log |
| Data loss or corruption | 0 | Test suite |

Local-only metrics require tester sessions or an explicitly exported diagnostic log. No telemetry is sent by default.

### 3.3 Non-goals (v1)

- Listening, speaking, pronunciation, audio/TTS, or pitch-accent training.
- Handwriting, stroke order, or handwriting recognition.
- A standalone flashcard queue or daily Anki-style drills. The story is the review.
- JLPT or HSK certification prep, score prediction, or official level guarantees.
- Traditional Chinese, TOCFL levels, or HSK 3.0 levels 1–9.
- Learners who cannot yet read kana, or Chinese learners who cannot yet read hanzi.
- Accounts, cloud sync, cross-device continuity, or social features.
- Teacher or classroom dashboards.
- User-authored or imported stories.
- Native mobile apps. Responsive web only.
- Localization of the English base UI.
- A production-grade multi-tenant backend or public rate-limiting service.

## 4. Users and jobs

**Primary persona — “Returning beginner” (Japanese).** 22–45, native English speaker, completed a beginner course (Genki I or equivalent). Reads kana, knows roughly 100–800 kanji, gets through short NHK Easy-style pieces with effort but bounces off native material. Studies 10–20 minutes, 3–5 times a week.

**Primary persona — “Mandarin starter” (Chinese).** 22–45, native English speaker, has learned pinyin and basic word order, knows roughly 150–1,000 hanzi, and can read short HSK 2–4 passages with effort. Needs tone-marked pinyin support and vocabulary recycling without a textbook.

**Secondary persona — “Maintainer.”** N3–N2 Japanese or HSK 4–5 Chinese. Reads native material slowly and wants steady vocabulary recycling and level-appropriate practice.

**Not a fit.** Absolute beginners who cannot read kana or hanzi; advanced learners seeking literary nuance or exam scoring.

## 5. Core loop

1. **Choose language.** Japanese or Chinese, from onboarding or the persistent header toggle.
2. **Onboard.** Choose a starting JLPT/HSK level, pronunciation default, interests, and story length.
3. **Generate.** Select due/weak tracked words for the active language and generate a story at the active level.
4. **Read.** Toggle furigana/pinyin, look up words and phrases on hover or click, and add unknown words.
5. **Reflect.** Finish the story and give 20–45 seconds of feedback plus recognition checks for words that appeared.
6. **Adapt.** Update the active language’s level state and each word’s schedule; show what changed.
7. **Repeat or switch.** The next story reflects the updated state. Switching languages restores the other language’s level, word list, history, and schedule.

## 6. Language and level model

### 6.1 Supported languages

| Language | Script | Level system | Pronunciation | Tokenizer |
|---|---|---|---|---|
| Japanese | Japanese (kanji, hiragana, katakana) | JLPT N5–N1 | Furigana (kana ruby) | kuromoji.js in a Web Worker |
| Chinese (Mandarin) | Simplified Chinese | HSK 1–6 | Tone-marked Hanyu Pinyin ruby | `Intl.Segmenter` + `pinyin-pro` (lazy chunk) |

- The learner-facing base language is English for both.
- Level is stored internally as a continuous score from 1.0 (beginner) to 5.0 (advanced), with language-specific bands and sub-levels.
- Progress, level state, pronunciation mode, word list, story history, and review schedule are stored separately per language.
- The active language is stored on the profile. Switching languages saves the current flat state into `savedLevels` and loads the target state.

### 6.2 Level bands

Japanese (JLPT):

| Band | Internal | Story chars (full band) | New-word base | Lookup baseline /100 chars | Typical focus |
|---|---|---|---|---|---|
| N5 | 1.0–1.99 | 150–300 | 4 | 8 | です/ます, basic particles, past tense, て-form |
| N4 | 2.0–2.99 | 300–600 | 5 | 6 | Potential, volitional, conditionals, everyday topics |
| N3 | 3.0–3.99 | 600–1,000 | 7 | 4 | Passive, causative, keigo basics, abstract topics |
| N2 | 4.0–4.99 | 1,000–1,600 | 9 | 2.5 | Complex clauses, formal register, idioms |
| N1 | 5.0 | 1,600–2,500 | 12 | 1.5 | Literary/formal styles, rare kanji, nuance |

Chinese (HSK 1–6, mapped onto the same 1.0–5.0 scale):

| Band | Internal | Story chars (full band) | New-word base | Lookup baseline /100 chars | Typical focus |
|---|---|---|---|---|---|
| HSK1 | 1.0–1.799 | 80–200 | 4 | 8 | SVO, 是, 吗-questions, 了, measure words |
| HSK2 | 1.8–2.599 | 120–280 | 6 | 6 | 过, 正在, 得-complements, 因为…所以…, comparisons |
| HSK3 | 2.6–3.399 | 180–380 | 8 | 4 | 把, 被, 越来越, 一边…一边…, topic-comment |
| HSK4 | 3.4–4.199 | 240–500 | 10 | 2.8 | Concession, cause-effect, formal connectors |
| HSK5 | 4.2–4.799 | 320–650 | 12 | 1.8 | Complex complements, formal register, rhetorical questions |
| HSK6 | 4.8–5.0 | 400–800 | 14 | 1.2 | Literary structures, 成语, advanced discourse markers |

Preferences: `short` uses roughly the lower 58% of a band’s character range; `medium` shifts inward; `long` uses the upper range. The validator allows ±30% around the preferred range as a hard gate and treats the softer preferred range as a warning.

### 6.3 Vocabulary states

| State | Meaning | Injected into stories? | Quizzed at story end? |
|---|---|---|---|
| Untracked | Not on the learner’s list | Only as level-appropriate filler | No |
| Learning | On the list, recognition < 85 | Yes, 1–4 times by strength; newly added words are prioritized in the next story | Yes, if it appeared |
| Known | Graduated, recognition ≥ 85 and 3 successful checks | No deliberate injection; may appear naturally | No |
| Suspended | Learner paused it | No | No |

Words above the current level are still Learning. They are prioritized for the next story, capped at three advanced introductions per story, and shown with pronunciation and a gloss on first appearance. Remaining advanced additions rotate in as “Next story.”

### 6.4 Coverage, i+1, and acceptance

| Rule | Japanese | Chinese |
|---|---|---|
| Coverage target | 95% | 90% |
| Hard coverage floor | 93% | 80% |
| Below target | Warning | Warning + story accepted |
| New-word target | Profile `newWordCap` | Profile `newWordCap` |
| Above new-word target | Hard error | Warning + story accepted |
| Hard new-word cap | Target | Target + 12 |
| Level-tag tolerance | +0.25 internal | +0.8 internal (roughly one HSK band) |
| Out-of-level kanji/hanzi | Kanji whitelist; missing ruby is an error | Hanzi whitelist is not enforced; pinyin is always available |
| Known-word evidence | Tags, lists, tracked words, names | Tags, glossary, tracked words, function words, known-character compounds, name glosses |

Chinese validation is intentionally softer than Japanese because word segmentation and model-provided HSK tags are noisy. A Chinese story may be accepted with warnings when coverage is 80–90% or when new words exceed the target but remain under the hard cap. The feedback loop is expected to lower the level next time if the story was too hard.

### 6.5 Definition of “assumed known”

Japanese: tracked Known words; tracked Learning words at reduced weight; the bundled high-frequency/JLPT vocabulary and kanji lists; function words; and names/proper nouns.

Chinese: tracked words; tokens tagged at or below the active HSK band plus one-band tolerance; a bundled HSK/everyday glossary; function words; multi-character tokens composed entirely of known characters; and glosses marked as names/proper nouns.

Per-form coverage is used: if any occurrence of a dictionary form is known, other untagged occurrences of the same form do not create a new-word entry. This prevents segmentation noise from inflating the new-word count.

## 7. Scope and priorities

| ID | Capability | Priority | Status |
|---|---|---|---|
| FR-1 | Language selection and persistent toggle | P0 | Implemented |
| FR-2 | Onboarding and starting level | P0 | Implemented |
| FR-3 | Story generation from learner state | P0 | Implemented |
| FR-4 | Validation, edit repair, lower-level retry, fallback | P0 | Implemented |
| FR-5 | Reader with optional furigana/pinyin | P0 | Implemented |
| FR-6 | Word and phrase lookup | P0 | Implemented |
| FR-7 | Click-to-reveal pronunciation/definition mode | P0 | Implemented |
| FR-8 | Add to word list | P0 | Implemented |
| FR-9 | Word list management | P0 | Implemented |
| FR-10 | End-of-story feedback and appeared-word checks | P0 | Implemented |
| FR-11 | Language-aware level adaptation | P0 | Implemented |
| FR-12 | Word frequency scheduling and fade | P0 | Implemented |
| FR-13 | Local persistence, export, import | P0 | Implemented |
| FR-14 | Story history and stats | P0 | Implemented |
| FR-15 | Settings and provider configuration | P0 | Implemented |
| FR-16 | Japanese language pack | P0 | Implemented |
| FR-17 | Simplified Chinese/HSK language pack | P0 | Implemented |
| FR-18 | Offline mock and fallback stories | P0 | Implemented |
| FR-19 | Paragraph difficulty pulse | P1 | Deferred |
| FR-20 | Calibration test | P1 | Deferred |
| FR-21 | Audio/TTS, accounts, sync | P2 | Deferred |

## 8. Functional requirements

### 8.1 Language selection and toggle (FR-1)

- The header exposes a persistent Japanese / 中文 toggle on every shell page.
- Onboarding asks for the learning language before the level.
- Settings exposes the same language choice.
- Switching languages:
  - saves the current level, hardness, new-word cap, consecutive difficulty/easy counters, and pronunciation mode into `savedLevels`;
  - loads the target language’s state, or a language default if none exists;
  - changes all views, level labels, word lists, stories, stats, and feedback to the active language;
  - navigates to Home so the next generation uses the new language;
  - never merges Japanese and Chinese words, stories, or levels.
- A learner can study both languages without re-onboarding.

### 8.2 Onboarding and level selection (FR-2)

- Three steps: language and level; reading preferences; first story.
- Japanese shows five JLPT sample levels with furigana. Chinese shows six HSK levels with a pinyin line.
- Level chooser labels are language-specific (`N5`…`N1`, `HSK 1`…`HSK 6`).
- Default pronunciation by level:
  - Japanese: N5–N4 Always, N3 Learn-only, N2–N1 Off.
  - Chinese: HSK1–HSK2 Always, HSK3–HSK4 Learn-only, HSK5–HSK6 Off.
- The learner can change level manually. A manual level change resets the adaptation moving average and per-language counters but preserves words and stories.
- No account is required; the default provider is the offline mock.
- Self-selection only in the MVP; optional calibration is P1.

### 8.3 Story generation (FR-3)

- “New story” is one click from Home or the reader.
- The generation request includes language, level, new-word cap, selected review words, known words, allowed grammar, length, topic, style, seed, recent titles, recent story IDs, and repair context.
- The prompt and contract are language-specific:
  - Japanese: kana readings, JLPT tags, kanji-aware constraints.
  - Chinese: Simplified characters only, tone-marked pinyin in `reading`, HSK 1–6 in the `jlpt` field, no pinyin/English inside the story text.
- Stories must be original, coherent, self-contained, and properly ended.
- Default topics rotate from interests; the learner can choose a topic and length.
- The story streams into a progress view and can be cancelled. A cancelled/failed generation never destroys the current story.
- Content policy is learner-selected topics; the provider’s moderation/safety settings are the boundary. The app shows a one-time notice, and every story can be regenerated or reported.
- Failure path: targeted edit repair (max three attempts at the current level) → lower the level and retry once → bundled fallback story with diagnostics.
- Generation logs and story metadata never include the provider key.

### 8.4 Validation, repair, and fallback (FR-4)

Validation gates:

| Gate | Requirement |
|---|---|
| Schema | Tolerant JSON contract; optional arrays/tokens may be omitted |
| Length | Hard ±30% of the preferred range; softer range produces a warning |
| Text integrity | `text` concatenates `sentences[].text`; client offsets/text are authoritative |
| Coverage | Japanese 93% floor/95% target; Chinese 80% floor/90% target |
| New words | Japanese hard cap; Chinese target is a warning, target + 12 is hard |
| Level tags | Within the language’s tolerance |
| Review words | Selected words appear at least once; at least 70% appear twice |
| Language | No Latin/romaji inside the story text except established loanwords |
| Repetition | Not a near-duplicate of recent stories |
| Pronunciation | Out-of-level Japanese kanji must have ruby; Chinese pinyin is generated client-side |

Repair behavior:

- The first attempt is a full generation.
- After a validation failure, the next attempt is an **edit** request containing the previous story and the exact validation errors. The model returns a JSON `edits` array targeting only failing sentences.
- Edits are applied client-side; the story is re-tokenized and re-validated.
- Repair may expand/condense existing sentences or delete one (`new_text: ""`); it must not add new sentences.
- The attempt counter reflects the real loop (1, 2, 3, and 4 after the level drop).
- If repair still fails, the app lowers the level by 0.25, retries once, then serves a bundled fallback story. The reader exposes the validation reasons.
- The saved story includes validation warnings/errors and generation metadata, but never the key.

### 8.5 Reader and display modes (FR-5)

- Paragraph layout, readable column, adjustable text size, high-contrast and reduced-motion support.
- Pronunciation modes: **Off**, **Always**, **On hover / tap**, **On click**, **Learn-only**.
- `F` cycles: Off → Always → Hover → Click → Learn-only. The toolbar label reflects the active mode exactly.
- Japanese renders furigana above kanji with okurigana outside the annotation. Chinese renders tone-marked pinyin above the token.
- **On click** behavior:
  - hovering a token does not open a popover;
  - left-click/tap opens a pinned definition popover and reveals the token’s pinyin/reading ruby;
  - clicking the same token again, clicking outside, or pressing `Esc` closes it;
  - keyboard focus/`Enter` reveals the reading and opens the popover;
  - the clicked token is visually marked while open.
- Learn-only shows pronunciation for tracked Learning words only.
- Tracked Learning words use a subtle underline; Known words are undecorated.
- The story title is tokenized with the same language, gets pronunciation annotations, hover/click definitions, word-add actions, and keyboard navigation.
- Sentence translations are available on demand, not shown by default. A toolbar `T` toggles all translations.
- Reading progress and position autosave; returning offers resume.
- Estimated reading time and progress are shown.
- A finish action is always available; the end-of-text prompt invites feedback.
- Keyboard: `F` mode, `T` translations, `Esc` close, `Enter` word details, `A` add word, arrows move between tokens; roving tabindex avoids one tab stop per word.
- Zoomed/pinched view: word popovers clamp to `visualViewport`, cap their height, scroll internally, and reposition on viewport changes.
- The sentence translation icon is grouped with the final token so it cannot be orphaned on the next line.

### 8.6 Word and phrase lookup (FR-6)

- Hover (mouse, ~120 ms intent) or click/tap opens a popover containing:
  - surface form;
  - reading/pinyin;
  - dictionary form and part of speech;
  - contextual English gloss;
  - level tag (JLPT N-level or HSK 1–6) and tracked state;
  - enclosing phrase translation and full sentence translation (collapsible);
  - Add/Added action and a gloss-report action.
- Phrase spans are bunsetsu-like for Japanese; for Chinese, the client builds phrase spans from tokens/sentence context.
- The popover opens from cached data with no network request while reading.
- Clicking pins the popover; `Esc`, outside click, or another token dismisses it.
- Missing glosses show “No gloss available” with a report action; never a blank panel.
- The popover flips/clamps to stay visible at viewport edges and under zoom.

### 8.7 Add to word list (FR-7)

- Adds the dictionary form with reading/pinyin, gloss, level tag, language, and source story/sentence.
- Duplicate detection uses language + dictionary form + reading.
- Added words enter Learning with recognition 0, stability 1 day, due tomorrow.
- Newly added words are prioritized for the next story. Up to three above-level words are introduced per story; the rest rotate in as “Next story.”
- A toast with Undo confirms and reverses the add.
- Events are logged locally; no data leaves the browser.

### 8.8 Word list (FR-8)

- Reachable from the reader without losing reading position.
- Filtered to the active language.
- Search, state filters, and sorts (recent, weakest, most seen, due).
- Rows show word, reading/pinyin, gloss, level tag, recognition, exposures, last seen, and state.
- Actions: mark Known, suspend/resume, delete, and “needs review” for a Known word.
- CSV export uses language-appropriate reading/pinyin columns.
- Empty state explains how words get here and offers a story.

### 8.9 End-of-story feedback (FR-9)

- Appears after finishing; target completion 20–45 seconds.
- Comprehension 1–5; difficulty Too easy / Just right / Too hard; optional interest 1–3.
- Word checks: only tracked words that appeared in this story, capped at six; prioritize weak/due words; show the sentence context.
- Known, Suspended, and absent words are never asked about.
- Responses: Knew it / Sort of / Didn’t know.
- Skipping still records behavioral signals but applies no recognition updates; the story is marked unrated.
- After submit, show a one-line adaptation summary and a Read next action.
- Feedback is stored with the story; it is read-only when revisited.

### 8.10 Language-aware level adaptation (FR-10)

- Adaptation uses language-specific lookup baselines and new-word caps.
- After a rated story, the level moves by at most 0.15 (plus the consecutive-story bonus/cap rules).
- Two consecutive too-hard stories or comprehension ≤2: extra −0.10 and a consolidation story with new-word cap 0.
- Two consecutive too-easy stories with comprehension 5: extra +0.10 and +2 new words.
- The level never moves more than 0.50 between consecutive stories.
- Feedback updates the state for the **story’s language**. If that is the active language, the flat profile fields update too; otherwise only `savedLevels[story.language]` changes.
- Manual level lock is P1; manual level changes reset adaptation state.

### 8.11 Word frequency scheduling and fade (FR-11)

- Each word stores recognition, successes, lapses, stability, due date, last seen, and exposures.
- Knew it: +14 recognition, success +1, stability from `[1,3,7,14,30,60]`.
- Sort of: +4, due at half the current stability.
- Didn’t know: −25, successes reset, stability 1 day, due tomorrow.
- Passive exposure adds +1 capped at 40.
- Graduation: recognition ≥85, successes ≥3, and the last three checks are Knew it.
- Known words are not injected or quizzed; they may appear naturally.
- Fade is gradual (4 → 2 → 1 → 0 occurrences) with recognition-based cooldowns.
- A word that cannot be placed naturally is skipped and remains due; no forced keyword stuffing.

### 8.12 Persistence, export, and import (FR-12)

- IndexedDB via Dexie stores profile, words, stories, feedback, settings, events, and generation logs.
- Schema v3 adds per-language fields and indexes.
- Autosave after interactions; recovery from interrupted generation.
- Export all learner data as versioned JSON; the API key is excluded.
- Import validates the schema, previews counts, and merges. Newer feedback wins; words are deduplicated by language + dictionary + reading; stories are deduplicated by ID.
- Clear all data requires confirmation and removes the key.
- Data survives reload, tab close, and browser restart.

### 8.13 Story history and stats (FR-13)

- History is filtered by active language; each row shows title, date, level, topic, rating, and word count.
- Reread without regenerating; previously submitted feedback is read-only.
- Stats are filtered by active language: stories read/finished, median comprehension, words learning/known/suspended/due, characters, and level trend.
- Home shows recent stories and compact stats for the active language.

### 8.14 Settings and provider configuration (FR-14)

- Active language toggle, level, pronunciation mode, text size, translations default, story length, and interests.
- Provider: offline mock or OpenAI-compatible; base URL, model, API key; Test connection.
- Provider settings save automatically and can be reset; the key is masked and never exported/logged.
- Optional shared LAN defaults:
  - `VITE_SHARED_PROVIDER=1` plus `VITE_SHARED_API_KEY`, `VITE_SHARED_API_URL`, `VITE_SHARED_API_MODEL`.
  - Vite injects the values into the browser, so every client on the network can use the same provider without entering a key.
  - This exposes the key to anyone who can load the page; trusted LAN only, scoped key recommended, never for public deployment.
- Data export/import and clear-all.
- Recent generation diagnostics and validation warnings/errors.

### 8.15 Paragraph difficulty pulse (P1)

- For stories over 600 characters, an optional one-tap difficulty pulse after each ~400-character screen, with no word checks.
- Pulses carry half the weight of end-of-story difficulty.
- Not part of the implemented MVP.

## 9. Generation contract

### 9.1 Story contract

```json
{
  "title_ja": "公園の猫",
  "title_en": "The Park Cat",
  "level": 2.0,
  "summary_en": "A short story about a cat in the park.",
  "text": "今日は公園へ行きました。ベンチに白い猫がいました。",
  "sentences": [
    {
      "text": "今日は公園へ行きました。",
      "translation_en": "Today I went to the park.",
      "tokens": [
        {"surface": "今日", "dictionary": "今日", "reading": "きょう", "pos": "noun", "gloss": "today", "jlpt": 5},
        {"surface": "公園", "dictionary": "公園", "reading": "こうえん", "pos": "noun", "gloss": "park", "jlpt": 5}
      ],
      "phrases": []
    }
  ],
  "target_words": [
    {"dictionary": "公園", "reading": "こうえん", "gloss": "park", "occurrences": 1}
  ],
  "grammar_points": ["past tense 〜ました"],
  "content_notes": []
}
```

Language-specific interpretation:

- `title_ja` is the **native title field** for both languages (legacy name). Chinese stories put the Simplified Chinese title here.
- `reading` is kana for Japanese and tone-marked Hanyu Pinyin for Chinese.
- `jlpt` is the JLPT N-level (1–5, where 5 = N5) for Japanese and the HSK band (1–6) for Chinese.
- `level` is the internal 1.0–5.0 continuous score.
- `title_en` and `summary_en` are English.
- The client tokenizer is authoritative for token offsets, ruby/pinyin, and furigana segmentation; models must not rely on supplying offsets.
- Tokens/phrases/optional arrays may be omitted or partial. Missing/partial data is repaired or re-tokenized client-side; one malformed token does not reject the whole story.
- Japanese text must not contain English/romaji. Chinese text must use Simplified characters and must not contain pinyin or English inside the story text.
- `target_words` is informational; the app derives review occurrences from the actual normalized story.

### 9.2 Edit/repair contract

When editing a previously generated story, the model returns only:

```json
{
  "edits": [
    {
      "sentence_index": 1,
      "old_text": "ベンチに白い猫がいました。",
      "new_text": "ベンチに白い猫がいました。",
      "translation_en": "There was a white cat on the bench.",
      "tokens": [
        {"surface": "ベンチ", "dictionary": "ベンチ", "reading": "ベンチ", "pos": "noun", "gloss": "bench", "jlpt": 4}
      ]
    }
  ]
}
```

- Only failing sentences are edited; unaffected sentences are preserved exactly.
- `sentence_index` is 0-based; `old_text` is copied exactly.
- Deletion uses `new_text: ""`.
- New sentences are not supported; length errors are fixed by expanding/condensing existing sentences.
- The pipeline applies patches, rebuilds `text`, recomputes occurrences, re-tokenizes, normalizes, and re-validates.
- If the model returns a full story instead, it is accepted as a fallback, but the prompt asks for edits to save output tokens.

## 10. Adaptation and scheduling algorithms

### 10.1 Feedback signals

| Signal | Definition | Range |
|---|---|---|
| `d` | Difficulty: too easy −1, just right 0, too hard +1 | −1 to +1 |
| `c_hard` | `(3 − comprehension) / 2` | −1 to +1 |
| `l_hard` | Lookup rate per 100 chars vs language/level baseline, clamped | −1 to +1 |
| `q_hard` | `clamp(((didn’t_know / checks) − 0.3) / 0.7, −1, 1)` | −1 to +1 |

Lookup baselines are language-specific (table in §6.2). Word popovers count 1; deliberate sentence translation reveals count 0.5; furigana/pinyin toggles do not count.

### 10.2 Level update

```text
hardness = 0.45*d + 0.30*c_hard + 0.15*l_hard + 0.10*q_hard
H        = 0.6*H_prev + 0.4*hardness
level    = clamp(level - 0.15*H, 1.0, 5.0)
new_cap  = base_new_word_cap(level, language)
           + (comprehension >= 4 ? +1 : comprehension <= 2 ? -2 : 0)
new_cap  = clamp(new_cap, 0, 12)
```

- Consecutive-hard rule: two stories with `d=+1` or comprehension ≤2 → extra −0.10 and `new_cap=0` next story.
- Consecutive-easy rule: two stories with `d=−1` and comprehension 5 → extra +0.10 and +2 new words.
- Maximum total movement: 0.25 per story under normal rules; never more than 0.50 between stories.
- Skipped feedback applies only half-weighted lookup signals and does not trigger consecutive-story rules.
- Feedback updates the story language’s state, even if the learner switched languages before submitting.

### 10.3 Word recognition updates

| Event | Recognition | Other effects |
|---|---|---|
| Added | 0 | Stability 1 day; due tomorrow |
| Knew it | +14 | Success +1; stability ladder `[1,3,7,14,30,60]`; due = now + stability |
| Sort of | +4 | Stability unchanged; due at half stability |
| Didn’t know | −25 | Successes 0; stability 1 day; due tomorrow |
| Passive exposure | +1, capped at 40 total | Exposures +1 |

- Graduation: recognition ≥85, successes ≥3, last three checks Knew it.
- Known words stop being injected and quizzed; manual “needs review” returns them to Learning at recognition 50.
- Injection count: `clamp(round(4 * (1 - recognition/100)), 0, 4)` for Learning words.
- Cooldowns: recognition <40 → 0 days; 40–69 → 3 days; 70–84 → 7 days; ≥85 → graduated.
- Newly added words bypass the cooldown for their first appearance and appear 1–2 times.
- At most three above-level introductions per story; up to 12 review words by length; no forced keyword stuffing.

## 11. UX specification

### 11.1 Screens

1. **Onboarding.** Language + level, pronunciation preference, interests/length, first story.
2. **Home.** Active language, level, due words, Read next, topic/length, recent stories, compact stats.
3. **Reader.** The core reading surface, toolbar, title, story text, end-of-story actions.
4. **Feedback sheet.** Comprehension, difficulty, interest, appeared-word checks, adaptation summary.
5. **Word list.** Active-language vocabulary, filters, actions, CSV export.
6. **History.** Active-language stories, ratings, reread.
7. **Stats.** Active-language progress and level trend.
8. **Settings.** Language, level, pronunciation, reading preferences, provider, data.

### 11.2 Reader wireframe

```text
┌──────────────────────────────────────────────────┐
│ ← Library      HSK 3 · lower     F · Click  T  Aa │
├──────────────────────────────────────────────────┤
│ 公园的猫                                          │
│ gōngyuán de māo               2 min · 42%         │
│                                                  │
│ 今天我去公园了。                                  │
│ 椅子上有一只白猫。                                │
│                                                  │
│      ┌─ 猫 ────────────────────┐                 │
│      │ māo · cat               │                 │
│      │ noun · HSK1 · not tracked│                │
│      │ Phrase: 有一只白猫        │                 │
│      │ [ + Add to word list ]   │                 │
│      └──────────────────────────┘                 │
│                              [ Finish story ]    │
└──────────────────────────────────────────────────┘
```

### 11.3 Interaction principles

- Text first; no persistent chrome over the reading column.
- Lookup never navigates; adding a word never moves the reading position.
- Hover, click, and keyboard are all first-class; touch is required.
- One overlay at a time; the word popover is not a modal.
- Pronunciation and translations are learner-controlled and remembered per language.
- Empty, loading, error, offline, and fallback states are explicit and recoverable.
- No streak pressure, leaderboards, or guilt copy.

### 11.4 Feedback sheet

- Four short steps: comprehension, difficulty, optional interest, appeared-word checks.
- Maximum six word checks; show the sentence where the word appeared.
- Skip is allowed; show adaptation summary after submit.
- Copy avoids test framing; these are self-reports, not grades.

## 12. Technical architecture

### 12.1 Stack and constraints

- Static browser app: Vite 6 + TypeScript → HTML/JS/CSS. No backend.
- Node.js 20+ recommended for development/build.
- IndexedDB via Dexie; localStorage for the provider key and small UI flags.
- OpenAI-compatible chat-completions adapter with streaming; configurable base URL/model/key.
- Offline mock provider and bundled fallback stories.
- Japanese tokenizer: kuromoji.js in a Web Worker; dictionary generated into `public/kuromoji-dict` and browser UMD copied into `public/vendor` by the install/dev/build script.
- Chinese tokenizer: `Intl.Segmenter('zh-Hans', { granularity: 'word' })` + `pinyin-pro`, loaded as a lazy chunk. A character-level fallback covers browsers without `Intl.Segmenter`.
- Japanese rendering: okurigana-aware kana ruby.
- Chinese rendering: tone-marked pinyin ruby above tokens; known compound splitting reduces segmentation artifacts.
- CSP restricts connections; all model output is rendered as text, never HTML.
- `npm run dev`/`npm run build` copy/generate tokenizer assets.
- Production: `npm run build` → `npm run preview` or serve `dist/` from the domain root.
- Do not open `index.html` via `file://`; tokenizer assets need HTTP.

### 12.2 Provider and sharing model

- Default provider is the offline mock; live generation is BYOK.
- The learner can enter a key in Settings; it is stored in localStorage, masked, excluded from exports/logs, and removed by Clear all data.
- Optional shared LAN defaults use Vite-exposed variables and inject the key into the client so all browsers on the network share the provider without entry. This is explicitly a trusted-LAN convenience, not a secure distribution mechanism.
- Public distribution would require a proxy, scoped keys, rate limits, and a content/abuse policy; not part of the MVP.

### 12.3 Dependencies

- `kuromoji` (Japanese tokenization; dictionary lazily fetched)
- `pinyin-pro` (Chinese pinyin; lazy chunk)
- `dexie` (IndexedDB)
- `jsonrepair` (model JSON tolerance)
- `vite`, `typescript`, `vitest` (build/test)
- Browser `Intl.Segmenter` and `DecompressionStream` (current Chrome, Edge, Firefox, Safari 16.4+)

## 13. Data model

| Entity | Key fields |
|---|---|
| `Profile` | `id`, `language`, `level`, `levelLocked`, `furiganaMode`, `translationsDefault`, `interests[]`, `storyLength`, `hardness`, `newWordCap`, `consecutiveHard`, `consecutiveEasy`, `savedLevels`, `onboarded`, `contentNoticeAcknowledged`, timestamps |
| `LanguageState` | `level`, `hardness`, `newWordCap`, `consecutiveHard`, `consecutiveEasy`, `furiganaMode` |
| `Word` | `id`, `language`, `dictionary`, `reading` (kana/pinyin), `surfaceForms[]`, `gloss`, `pos`, `jlpt` (JLPT/HSK tag), `state`, `aboveLevel`, `firstStoryPending`, `recognition`, `successes`, `lapses`, `stabilityDays`, `dueAt`, `lastSeenAt`, `exposures`, `checks[]`, source fields, timestamps |
| `Story` | `id`, `language`, `createdAt`, `level`, `levelAtGeneration`, `topic`, `titleJa` (native title), `titleEn`, `text`, `sentences[]`, `targetWords[]`, `grammarPoints[]`, `generationMeta`, `isFallback`, `readState`, `progress`, `lookupCount`, `translationReveals`, timestamps |
| `Feedback` | `storyId`, `comprehension`, `difficulty`, `interest`, `skipped`, `wordChecks[]`, `lookupCount`, `translationReveals`, `levelBefore`, `levelAfter`, `adaptationSummary`, `createdAt` |
| `GenerationLog` | `id`, `storyId`, request, model, attempts, validation, fallbackUsed, errors, timestamps |
| `Settings` | provider, base URL, model, furigana default, text size, translations default, locale |

Indexes:

- `Word`: `language`, `state`, `dueAt`, `recognition`, `[language+dictionary+reading]`, `lastSeenAt`, `[language+state]`
- `Story`: `createdAt`, `level`, `readState`, `language`, `[language+createdAt]`
- `Feedback`: `storyId` unique, `createdAt`
- `Profile`/`Settings`: single row by `id`

Export/import:

- Versioned JSON; old imports without language fields default to Japanese.
- API key never included.
- Word identity includes language, dictionary form, and reading.
- Merge policy: newer feedback wins; no duplicate words/stories.

## 14. Validation and acceptance criteria

### 14.1 Validation gates

- Schema: tolerant parser; required core fields only; optional arrays/tokens/phrases default.
- Length: hard ±30%; preferred range is a warning.
- Text integrity: `text` equals concatenated sentences; client tokenization/offsets authoritative.
- Coverage: Japanese 93/95; Chinese 80/90 with soft acceptance.
- New words: Japanese hard cap; Chinese target warning and target+12 hard cap.
- Level tags: within the language tolerance.
- Review words: at least one occurrence each; ≥70% at two or more; cannot be forced unnaturally.
- Language: no Latin/romaji in Japanese story text; no pinyin/English in Chinese story text.
- Repetition: not a near-duplicate of recent stories.
- Pronunciation: out-of-level Japanese kanji must have ruby; Chinese pinyin is generated client-side.
- Alignment: normalized client-side; misalignment is repaired, not shown.

### 14.2 Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | A new learner chooses Japanese or Chinese and receives a story at the chosen JLPT/HSK level with language-appropriate length and vocabulary. |
| AC-2 | The header, onboarding, and settings language toggle switch all views and restore the selected language’s level, pronunciation mode, words, and stories without mixing languages. |
| AC-3 | Japanese shows optional furigana; Chinese shows optional tone-marked pinyin ruby. |
| AC-4 | All five pronunciation modes work: Off, Always, Hover, Click, Learn-only; the F cycle and toolbar label include Click. |
| AC-5 | In Click mode, hover does nothing; click/tap shows the token’s reading/pinyin and definition; click again/outside/Esc closes; keyboard focus/Enter also works. |
| AC-6 | The story title has language-appropriate pronunciation annotations and lookup/add behavior. |
| AC-7 | Word popovers show reading/pinyin, dictionary form, POS, gloss, JLPT/HSK tag, tracked state, phrase/sentence translations, and Add. |
| AC-8 | Adding a word stores its language and dictionary form, prevents duplicates within that language, supports Undo, and prioritizes it in the next story. |
| AC-9 | Feedback asks about at most six tracked words that actually appeared; absent/Known/Suspended words are not asked. |
| AC-10 | Three Knew it checks across three stories plus recognition ≥85 graduate a word; it stops being injected/quizzed and its occurrences fade. |
| AC-11 | Two consecutive hard stories lower the level and use a consolidation story; two consecutive easy stories raise it. |
| AC-12 | Chinese stories are accepted when coverage is ≥80% or new words are within target+12, with warnings; harder failures still fall back. |
| AC-13 | Japanese stories keep the stricter 93/95 coverage and hard new-word gate. |
| AC-14 | A failed validation triggers edit-based repair that patches only failing sentences; the first attempt is a full generation, and the attempt counter increments correctly. |
| AC-15 | The reader shows a fallback story with validation reasons when generation cannot be repaired. |
| AC-16 | Reload, tab close, and browser restart preserve profile, language state, words, stories, settings, and feedback. Export/import round-trips and excludes the key. |
| AC-17 | Word lists, history, stats, and feedback are filtered to the active language; switching restores the other language’s data. |
| AC-18 | The app works fully in offline mock mode without a provider key. |
| AC-19 | No API key is rendered in plain text, exported, logged, or committed; nested zoomed viewports do not push word popovers off screen. |
| AC-20 | Typecheck, 49 automated tests, and the production build pass; a manual smoke test passes for both languages. |

## 15. Accessibility, performance, and privacy

### 15.1 Accessibility

- WCAG 2.1 AA contrast; 200% zoom; 44px touch targets.
- Roving tabindex; arrow keys move between tokens; Enter opens details; `A` adds; `F` changes mode; `T` translations; Esc closes.
- Sentence text remains in natural reading order for screen readers; token details are on demand.
- Pinyin/furigana ruby is `aria-hidden`; the accessible token label includes the reading.
- Title tokens are included in keyboard navigation.
- Click mode preserves keyboard access to the same definitions.
- Copying story text yields plain text without ruby/sentence tools.
- Respect reduced motion and high contrast.

### 15.2 Performance

- Japanese tokenization in a Web Worker; Chinese tokenization lazy-loaded.
- Popovers use precomputed token data; no per-token network calls.
- Kuromoji dictionary and fallback corpus load lazily; Chinese pinyin chunk is ~305 KB (140 KB gzip).
- p95 first story text ≤8 s; full story ≤20 s on broadband.
- IndexedDB normal operations <50 ms; 2,000-character stories render interactive tokens <200 ms after tokenization.

### 15.3 Privacy and security

- No accounts, backend, or telemetry by default.
- Provider key in localStorage; masked; never exported/logged; excluded from git.
- Shared LAN defaults intentionally expose the key to any client that loads the page; trusted-network only, scoped key, no public deployment.
- All model output is text; CSP restricts connections; no remote scripts beyond configured API.
- Content policy: learner-selected topics; provider moderation is the boundary; regenerate/report available; revisit before public distribution.
- The app stores learner data locally; clearing data is explicit.

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Chinese segmentation/HSK tagging is noisy | False new words, rejected or too-hard stories | Per-form coverage, known-character compound fallback, glossary expansion, HSK tolerance, soft 80/90 acceptance, feedback adaptation |
| Model exceeds Chinese level | Story too hard | HSK prompts, i+1 tolerance, soft warnings, level drop/consolidation, feedback |
| Model under/over-shoots length | Retry churn | Chinese length bands tuned to observed model output, explicit LENGTH RULE, repair by expanding/condensing |
| Pinyin polyphonic characters | Wrong readings | `pinyin-pro` context, particle overrides, glossary/LLM readings; residual ambiguity accepted |
| Name/proper-noun segmentation | Misleading gloss/coverage | Name-gloss heuristic, per-form coverage, manual word add |
| Japanese/Chinese data mixing | Corrupted progress | `language` fields, per-language filters/indexes, per-language saved state, export normalization |
| Shared LAN key exposure | Key leakage | Trusted LAN only, warning, scoped key, no public deployment; BYOK default |
| API key in a production build | Key leakage | `VITE_SHARED_PROVIDER` is explicit and documented as unsafe for public hosting; `.env` ignored |
| Local data loss | Lost progress | Autosave, atomic writes, export/import, diagnostics |
| Scope creep into a full SRS app | Diluted product | Reading-is-review non-goal; no flashcard queue |
| Model-generated content safety | Harm/trust | Provider moderation, topic control, regenerate/report, public-distribution review |

## 17. Deferred items

1. Traditional Chinese and TOCFL levels.
2. HSK 3.0 levels 1–9.
3. Calibration/placement test (P1).
4. Paragraph difficulty pulses (P1).
5. Auto-suggested words (P1).
6. Periodic Known-word recheck (P2; manual “needs review” exists).
7. Audio/TTS, pitch accent, listening, speaking.
8. Accounts, cloud sync, cross-device continuity.
9. Public/self-hosted backend proxy, rate limits, and abuse controls.
10. Single-file HTML packaging (not planned; static build is the deliverable).
11. Official HSK hanzi whitelist and higher-fidelity Chinese segmentation.
12. Public content/age policy and distribution review.

## 18. Milestones and status

| Phase | Scope | Status |
|---|---|---|
| M1 | App shell, onboarding, IndexedDB, settings | Complete |
| M2 | Reader, Japanese tokenizer, furigana, popovers, add words | Complete |
| M3 | Generation, validation, edit repair, fallback | Complete |
| M4 | Feedback, language-aware adaptation, scheduling | Complete |
| M5 | Word list, history, stats, export/import | Complete |
| M6 | Chinese/HSK language pack, pinyin ruby, language toggle | Complete |
| M7 | Click mode, title annotations, zoom-safe popovers, validation tuning | Complete |
| M8 | Accessibility/cross-browser review, public distribution hardening | P1/P2 |

Verification at the time of this version:

- `npm run typecheck` clean.
- `npm test` 49/49 passing across 7 files.
- `npm run build` successful.
- Manual smoke test passed for Japanese ↔ Chinese switching, Chinese generation, reading, word add, feedback, and switching back.
- Dev server runs via `npm run dev`; no `npm start` script.

## 19. Decisions log

| # | Question | Decision |
|---|---|---|
| Q1 | Generation/hosting | Static browser app, BYOK; no backend. Optional shared LAN defaults for trusted testing only. |
| Q2 | Feedback cadence | End of story only in the MVP; paragraph pulse P1. |
| Q3 | Starting level | Self-select JLPT/HSK; optional calibration P1. |
| Q4 | Backend | No backend in v1. |
| Q5 | Accounts/sync | Local-only + JSON export/import. |
| Q6 | Story length default | Short (2–4 minutes), with medium/long selectable. |
| Q7 | Translation access | Word hover/click; full-sentence English on demand. |
| Q8 | Content boundaries | Learner-selected topics; provider moderation; regenerate/report; public-distribution review required. |
| Q9 | Auto-suggested words | Manual adds only in the MVP; suggestions P1. |
| Q10 | Known-word maintenance | Three Knew it checks across three stories + recognition ≥85; manual mark/needs-review; no automatic recheck. |
| Q11 | Flashcard mode | No separate review queue; reading is the review. |
| Q12 | Packaging | Static Vite build, not single-file HTML. |
| Q13 | Tokenizer | kuromoji for Japanese; Intl.Segmenter + pinyin-pro for Chinese; both lazy. |
| Q14 | Audio | Deferred to P2. |
| Q15 | Advanced added words | Include immediately; cap three above-level introductions per story; rest rotate. |
| Q16 | Language support | Japanese + Simplified Mandarin Chinese, English base UI. |
| Q17 | Chinese level system | HSK 1–6 mapped onto the internal 1.0–5.0 scale. |
| Q18 | Progress model | Separate per-language level, pronunciation mode, words, stories, and schedule. |
| Q19 | Chinese pronunciation | Tone-marked pinyin ruby above hanzi, with the same display-mode system as furigana. |
| Q20 | Click mode | Add On click to the pronunciation modes; hover is disabled in that mode; click reveals reading + definition. |
| Q21 | Chinese validation | Softer 80/90 coverage and target+12 new-word hard cap with warnings, because Chinese segmentation/tagging is noisy; feedback adapts. |
| Q22 | Repair strategy | First attempt full generation; subsequent attempts edit only failing sentences via a patch contract; lower-level retry then fallback. |
