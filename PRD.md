# Yomu — Adaptive Japanese Graded Reader

**Product Requirements Document**

| Field | Value |
|---|---|
| Status | Draft for review |
| Version | 0.3 |
| Owner | Ken Pang |
| Date | 2026-10-17 |
| Product | Yomu (working title) |
| Scope | MVP: adaptive story generation, assisted reading, vocabulary tracking |

---

## 1. Summary

Yomu is a browser-based reading application for native English speakers learning Japanese. It generates short graded stories calibrated to the learner's current reading level, renders them with optional furigana, and shows English readings and glosses on hover or tap for individual words and phrases. A one-click action adds any word to a tracked vocabulary list. Tracked words are deliberately recycled into later stories, then fade out as the learner's recognition of them strengthens.

After each story, a short feedback card asks how the story felt and checks recognition of the tracked words that actually appeared. Those responses update both the learner's level estimate and each word's schedule, so the next story is generated from a fresher model of what the learner knows.

The core bet: personalized, recycled, comprehensible input beats static graded readers and isolated flashcards for building reading fluency. Repetition happens inside coherent new stories, not drills.

The MVP is local-first. All learner data stays in the browser, and story generation is browser-only: the learner supplies an LLM endpoint and API key (BYOK), with no backend service.

## 2. Problem

Static graded readers come in coarse level bands and cannot know which words an individual has already learned. They either over-explain, bore the reader, or jump to material the reader cannot decode. Dictionaries and translators break reading flow. Flashcard apps teach words in isolation and do not build the stamina and inference skills that reading requires.

A learner needs three things at once:

1. **Something readable now.** Material at roughly 95–98% known-word coverage, at their current level.
2. **Zero-friction lookup and capture.** A reading, a meaning, and an "add to my words" action without leaving the page.
3. **Memory that carries across stories.** New and weak words return naturally, spaced out, and stop appearing once they are firmly recognized.

Existing tools solve at most one of these well. Yomu connects all three in a single loop.

## 3. Goals and success metrics

### Product goals

- A learner can open the app and be reading a suitable story in under 60 seconds, and generate the next one in one click.
- Every story is readable at ≥95% known-token coverage and finishable in 2–5 minutes.
- Lookup and word capture take under two seconds and never navigate away from the text.
- Difficulty adapts after every story. After onboarding, the learner never has to manually choose a level.
- Tracked words recur with spacing and fade as recognition improves.
- Learner data is local, exportable, and never lost.

### Beta success metrics (5–15 learners, 2 weeks)

| Metric | Target | Source |
|---|---|---|
| Story completion rate | ≥80% | Local event log |
| Median comprehension self-rating | ≥4 / 5 | Feedback |
| Stories rated "just right" | ≥60% | Feedback |
| Lookups per 100 characters | ≤3 | Local event log |
| Tracked words marked "Knew it" after 3+ exposures | ≥70% | Feedback |
| Level calibration error (predicted vs reported) | ≤0.5 sub-level | Feedback + model |
| Generation success without fallback | ≥95% | Generation log |
| p95 time to first story text | ≤8 s | Performance log |
| Data loss or corruption | 0 | Test suite |

Because the MVP is local-only, cross-user metrics require tester sessions or an explicitly exported diagnostic log. No telemetry is sent by default.

## 4. Non-goals (v1)

- Listening, speaking, pronunciation, audio/TTS, or pitch-accent training.
- Handwriting or kanji stroke order.
- A standalone flashcard review queue or daily Anki-style drills. The story is the review.
- JLPT certification prep or score prediction. JLPT labels are a vocabulary and kanji heuristic, not a guarantee.
- Learners who cannot yet read hiragana and katakana.
- Accounts, cloud sync, cross-device continuity, or social features.
- Teacher or classroom dashboards.
- User-authored or imported stories.
- Native mobile apps. Responsive web only.
- Languages other than Japanese, or gloss languages other than English.

## 5. Users

**Primary persona — "Returning beginner."** 22–45, native English speaker, has completed a beginner course (Genki I or equivalent). Reads kana, knows roughly 100–800 kanji, and can get through short NHK Easy-style pieces with effort but bounces off native material. Studies 10–20 minutes, 3–5 times a week. Wants to read for pleasure and stop translating every sentence.

**Secondary persona — "Intermediate maintainer."** N3–N2. Reads native material slowly and wants steady vocabulary recycling and level-appropriate practice without a textbook.

**Not a fit.** Absolute beginners who cannot read kana; advanced learners seeking literary nuance or exam scoring.

## 6. Core loop

1. **Onboard.** Choose a starting level, furigana default, interests, and preferred story length.
2. **Generate.** The app selects due and weak tracked words and generates a story at the current level.
3. **Read.** The learner reads, toggles furigana, hovers or taps words and phrases for reading and English, and adds unknown words.
4. **Reflect.** At the end, the learner gives 20–45 seconds of feedback and recognition checks for tracked words that appeared.
5. **Adapt.** The app updates the level estimate and word schedules and shows a one-line summary of what changed.
6. **Repeat.** The next story reflects the new state. Graduated words are no longer injected or quizzed.
7. **Review.** The word list shows learning, known, and suspended words; past stories remain readable.

## 7. Product model

### 7.1 Level scale

Level is shown as a JLPT band with three sub-levels (lower / mid / upper) and stored internally as a continuous score from 1.0 (N5) to 5.0 (N1). The score moves by small increments after feedback rather than jumping whole bands.

| Band | Internal score | Typical cumulative kanji | Vocabulary and grammar guidance | Story length (chars) | Sentences | Target read time |
|---|---|---|---|---|---|---|
| N5 | 1.0–1.99 | ~100 | です/ます, basic particles, past tense, て-form, common daily vocabulary | 150–300 | 8–12 | 1–2 min |
| N4 | 2.0–2.99 | ~300 | Potential, volitional, basic conditionals, common connectors, everyday topics | 300–600 | 10–18 | 2–4 min |
| N3 | 3.0–3.99 | ~650 | Passive, causative, keigo basics, nuanced conjunctions, abstract topics | 600–1,000 | 12–22 | 3–6 min |
| N2 | 4.0–4.99 | ~1,000 | Complex clauses, formal register, idioms, news-adjacent topics | 1,000–1,600 | 15–30 | 5–9 min |
| N1 | 5.0 | ~2,000 | Literary and formal styles, rare kanji, nuanced register | 1,600–2,500 | 18–40 | 8–12 min |

The learner's "reading level" is the level at which they achieve comfortable comprehension with effort, not their JLPT certificate. Default story length is "short" (2–4 minutes) regardless of band; the table is the full range available.

### 7.2 Vocabulary states

| State | Meaning | Injected into stories? | Quizzed at story end? |
|---|---|---|---|
| Untracked | Not on the learner's list | Only as level-appropriate filler | No |
| Learning | On the list, recognition < 85 | Yes, 1–4 times by strength; newly added words are prioritized in the next story | Yes, if it appeared |
| Known | Graduated: strong recognition | No deliberate injection; may appear naturally | No |
| Suspended | Learner paused it | No | No |

Words above the current level are still Learning. They are prioritized for the next story and introduced with furigana and a gloss, subject to the per-story advanced-word cap in §9.6.

Every tracked word stores recognition from 0–100. New words start at 0. Homographs are keyed by dictionary form plus reading (e.g., 生 has multiple entries).

### 7.3 Coverage and i+1

- **Known-token coverage:** at least 95% of tokens are assumed known (see §7.4). Learning words count toward coverage only at a discounted weight; validation reports both raw and adjusted coverage. Learner-added words are excluded from the coverage gate so an explicit add never causes a story to be rejected.
- **New-word load:** at most `new_word_cap` genuinely new words per story, excluding inflections of already-known words. Base caps: N5 4, N4 5, N3 7, N2 9, N1 12, adjusted by feedback. Learner-added words are exempt from this cap but subject to the advanced-word limit in §9.6.
- **Review-word load:** up to `min(12, round(story_chars / 40))` tracked Learning words per story. Each selected word appears at least once; at least 70% appear twice or more.
- **No keyword stuffing:** a review word appears at most four times unless it is the story's subject. If a word cannot be included naturally, it is skipped and remains due.
- **Inferability:** new words should be guessable from context, though a gloss is always one hover away.

### 7.4 Definition of "assumed known"

For coverage, a token is assumed known if it is:

- a tracked Known word or a tracked Learning word (counted at 0.5 weight),
- in the bundled high-frequency vocabulary list for the current level,
- a function word (particles, copula, common interjections), or
- a proper noun (glossed once on first appearance).

Names count as known but must be marked and glossed. This prevents names from unfairly lowering coverage.

## 8. Scope and priorities

| ID | Capability | Priority |
|---|---|---|
| FR-1 | Onboarding and level selection | P0 |
| FR-2 | Story generation from learner state | P0 |
| FR-3 | Level and vocabulary validation with repair/fallback | P0 |
| FR-4 | Reader with optional furigana | P0 |
| FR-5 | Word and phrase hover/tap glosses | P0 |
| FR-6 | Add to word list | P0 |
| FR-7 | Word list management | P0 |
| FR-8 | End-of-story feedback | P0 |
| FR-9 | Word recognition checks for appeared words only | P0 |
| FR-10 | Level adaptation | P0 |
| FR-11 | Word frequency scheduling and fade | P0 |
| FR-12 | Local persistence, export, import | P0 |
| FR-13 | Story history and rereading | P0 |
| FR-14 | Settings and provider configuration | P0 |
| FR-15 | Paragraph difficulty pulse for long stories | P1 |
| FR-16 | Calibration test | P1 |
| FR-17 | Reading stats dashboard | P1 |
| FR-18 | Audio/TTS, accounts, sync | P2 |

## 9. Functional requirements

### 9.1 Onboarding and level selection (FR-1)

- First run asks for: starting level, furigana default, interests, and preferred story length.
- The level chooser explains each band with a one-sentence sample that can toggle furigana and English.
- Default furigana by level: N5–N4 Always, N3 Learn-only, N2–N1 Off. The choice is editable at any time.
- No account is required. Local storage is initialized on first launch.
- An optional 3-minute calibration check is P1. The MVP ships with self-selection only.
- The learner can change level manually in settings; a manual change resets the adaptation moving average but not word schedules.

### 9.2 Story generation (FR-2)

- "New story" is one click from home or the reader. Options: topic, length (short / medium / long), and regenerate.
- The generation request includes: level score, new-word cap, selected review words, avoided/Known words, allowed grammar, length, topic, style, and a random seed for variety.
- Stories must be original, coherent, self-contained, and end properly. No "to be continued."
- Default topic rotation comes from onboarding interests; the learner can pin a topic or choose "surprise me."
- Generation streams into a skeleton view and can be cancelled. A cancelled or failed generation never destroys the current story.
- On success, the story is saved with generation metadata and precomputed token data.
- Content policy: the learner chooses the topic. The app imposes **no hard content exclusions** in v1; the configured provider's moderation and safety settings are the boundary. A one-time notice at onboarding explains this, and every story exposes Regenerate and Report actions. This policy must be revisited before any public or app-store distribution. (Q8)
- Failure path: targeted repair (max two attempts) → drop level by 0.25 and retry once → serve a bundled fallback story with a non-blocking notice.
- Identical or near-identical story text is rejected against the last 20 stories.

### 9.3 Validation and repair (FR-3)

A generated story must pass these gates before it is shown:

| Gate | Requirement |
|---|---|
| Schema | Valid JSON matching the contract in §10 |
| Length | Within the level band ±20% |
| Text integrity | `text` equals the concatenation of `sentences[].text`; token offsets cover each sentence exactly |
| Coverage | ≥95% assumed-known tokens, excluding learner-added target words (which the learner explicitly chose) |
| Kanji | ≤2% of kanji tokens outside the level whitelist; every out-of-level kanji token has furigana |
| Review words | Each selected word appears ≥1×; ≥70% appear ≥2× |
| New words | No more than `new_word_cap` new dictionary forms |
| Language | No romaji or English in Japanese text except established loanwords |
| Repetition | Not a near-duplicate of recent stories |

If a gate fails, a repair prompt names the exact violation and asks for a full rewrite (not a patch). After two failures, the app lowers the level and retries once, then falls back. Every failure reason is logged locally for tuning.

### 9.4 Reader (FR-4)

- Paragraph layout, maximum text width around 42em, adjustable font size, high contrast.
- Furigana modes: **Off**, **Always**, **On hover/tap**, and **Learn-only** (only Learning words). The mode persists and can be cycled with `F`.
- Furigana is rendered with `<ruby>` above the kanji, with okurigana outside the annotation. Kana-only tokens get no annotation.
- Tracked Learning words carry a subtle dotted underline. Known words carry no decoration. The hovered or focused token is highlighted.
- Reading position and progress save automatically. Returning to a story offers "resume" or "start over."
- Estimated reading time and a subtle progress bar are shown.
- A "Finish story" action is always available; an end-of-text prompt appears after the last paragraph.
- Sentence translations are available through a deliberate action (tap a sentence's translate affordance or toggle all), not shown by default.
- Keyboard: `F` cycles furigana, `T` toggles translations, `Esc` closes the popover, `Enter` opens/adds for the focused token, arrow keys move between tokens. Tokens use roving tabindex, not one tab stop per word.
- Respect `prefers-reduced-motion`; no animation is required to read.

### 9.5 Word and phrase lookup (FR-5)

- Hovering a token for ~120ms (mouse) or tapping it (touch) opens a popover containing:
  - surface form,
  - reading in kana,
  - dictionary form and part of speech,
  - context-appropriate English gloss or glosses,
  - JLPT tag and tracked state,
  - the enclosing phrase translation and the full sentence translation in a collapsible section,
  - Add / Added action.
- Phrases are bunsetsu-like spans supplied by the generator and validated against token indices. Hovering a phrase shows its gloss; hovering a word inside it shows the word popover with the phrase translation in the same panel. There are no nested hover targets.
- The popover opens in under 100ms from cached token data. No network call happens while reading.
- Clicking or tapping pins the popover until dismissed by `Esc`, click-outside, or another token.
- If a gloss is missing or invalid, show the tokenizer reading plus "No gloss available" and a report action. Never show a blank popover.
- The popover flips above or below and clamps to the viewport so it never covers the current line.
- Copying text from the reader yields plain Japanese without ruby artifacts.

### 9.6 Add to word list (FR-6)

- One action in the popover adds the **dictionary form** with reading, gloss, JLPT tag, and source story/sentence.
- Duplicate detection uses dictionary form plus reading. Adding an existing word shows "Already added" and does not create a duplicate.
- A toast with Undo (5 seconds) confirms the add.
- Added words enter Learning with recognition 0, stability 1 day, and due tomorrow.
- Newly added words are prioritized for the **next** generated story, including words above the current level. They appear with furigana and a gloss on first appearance regardless of the furigana setting.
- To keep the story readable, at most three words more than one level above the current level are introduced in a single story. If more are waiting, the oldest additions rotate into subsequent stories, and the word list marks each pending word as "Next story."
- Advanced additions do not count against the new-word cap, but they do count toward the displayed difficulty and the coverage report.
- Lookup and add events are logged locally for adaptation. No data leaves the browser.

### 9.7 Word list (FR-7)

- Reachable from the reader in one action without losing reading position.
- Search plus filters: Learning, Known, Suspended, All.
- Newly added words waiting for their first story show a "Next story" badge.
- Sorts: recently added, weakest recognition, most seen, due soonest.
- Each row shows word, reading, gloss, JLPT, recognition bar, times seen, last seen, and state.
- Actions: mark Known (confirm), suspend/resume, delete, and "needs review" (returns a Known word to Learning).
- Deleting a word removes its schedule and history but does not alter past stories.
- CSV export with word, reading, gloss, state, recognition, exposures, last seen, and due date.
- Empty state explains how words get here and offers "Read a story."

### 9.8 End-of-story feedback (FR-8)

The feedback sheet appears after "Finish story" and targets 20–45 seconds.

1. **Comprehension:** 1–5 ("How much did you understand?").
2. **Difficulty:** Too easy / Just right / Too hard.
3. **Interest:** 1–3, optional; informs topic selection, never level.
4. **Word checks:** recognition checks for tracked words that actually appeared, capped at six.

Rules for word checks:

- Only words that appeared in this story's text are eligible. If a tracked word was not present, it must not be asked about.
- Known and Suspended words are excluded.
- Newly added words are eligible only if they appeared (they did by definition).
- Prioritize weakest recognition and earliest due date; sample randomly among ties.
- Each check shows the word and the sentence where it appeared.
- Responses: **Knew it**, **Sort of**, **Didn't know**.
- No word check is asked twice for the same word in one story.
- The sheet is skippable. If skipped, behavioral signals still update level adaptation, but no recognition updates are applied and the story is marked unrated.
- Copy avoids test framing. There are no "correct answers," and the learner can skip individual checks.

After submission, show a concise summary of what changed, for example: "Next story: N4 lower · 3 review words · slightly shorter." Primary CTA: "Read next."

### 9.9 Level adaptation (FR-10)

- After a rated story, update the continuous level score by at most 0.15 (details in §11).
- Two consecutive "too hard" stories or comprehension ≤2: apply an extra −0.10 and set the next story's new-word cap to 0 (a consolidation story).
- Two consecutive "too easy" stories with comprehension 5: apply an extra +0.10 and raise the next new-word cap by 2.
- Changes are cumulative but capped so the level never moves more than 0.50 between consecutive stories.
- The learner can lock the level in settings (P1).
- The app never silently changes the displayed band without showing the "what changed" summary.

### 9.10 Word frequency scheduling and fade (FR-11)

- Each tracked word stores recognition, successes, lapses, stability, due date, last seen, and exposure count.
- Word checks update recognition using the formulas in §11.3.
- Injection frequency scales inversely with recognition. Known words are not injected.
- A cooldown prevents a word from appearing in back-to-back stories unless it is weak.
- After three "Knew it" responses across at least three distinct stories and recognition ≥85, the word becomes Known. It is no longer quizzed or deliberately injected, but it may still appear naturally as level-appropriate vocabulary.
- Known words are not re-quizzed automatically. The learner can send one back to Learning with "needs review" in the word list.
- Fade is gradual: four occurrences, then two, then one, then zero as recognition rises. No abrupt cut-off.
- If a due word cannot be included naturally, it is skipped and stays due. The app never forces an unnatural sentence.

### 9.11 Persistence, export, and import (FR-12)

- IndexedDB stores profile, words, stories, feedback, settings, and generation logs.
- Autosave after every interaction, with atomic writes and recovery from an interrupted generation.
- Export all learner data as versioned JSON. The API key is never included.
- Import validates the schema, previews counts, and merges. Newer feedback wins; words are deduplicated by dictionary form plus reading; stories are deduplicated by ID.
- "Clear all data" requires typed confirmation and removes the API key.
- Data survives reload, tab close, and browser restart. Saved stories require no server.

### 9.12 Story history (FR-13)

- List of past stories with title, date, level, topic, rating, and word count.
- Reread without regenerating. Previously submitted feedback is shown read-only.
- Opening a past story does not trigger new word checks.
- Deleting individual stories is P1. MVP offers only "clear all data."

### 9.13 Settings (FR-14)

- Current/starting level, furigana default, text size, translations default, story length, and topics.
- Provider settings: endpoint, model, API key (masked, stored locally), "Test connection."
- Export/import and clear data.
- Reading stats (P1): stories read, median comprehension, level trend, words learning/known.

### 9.14 Paragraph pulse (FR-15, P1)

- For stories longer than 600 characters, a one-tap difficulty pulse appears after each ~400-character screen: Too easy / Just right / Too hard, with Skip.
- Pulses contain no word checks and carry half the weight of end-of-story difficulty in adaptation.
- Purpose: catch a level mismatch before the learner grinds through a bad story.
- Not required for MVP; end-of-story feedback is the source of truth.

## 10. Generation contract

The model returns one JSON object. All displayed content is plain text, never HTML or Markdown.

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
        {"surface": "今日", "dictionary": "今日", "reading": "きょう", "pos": "noun", "gloss": "today", "jlpt": 5, "start": 0, "end": 2},
        {"surface": "公園", "dictionary": "公園", "reading": "こうえん", "pos": "noun", "gloss": "park", "jlpt": 5, "start": 4, "end": 6}
      ],
      "phrases": [
        {"start": 0, "end": 1, "gloss": "today"},
        {"start": 2, "end": 4, "gloss": "went to the park"}
      ]
    }
  ],
  "target_words": [
    {"dictionary": "公園", "reading": "こうえん", "gloss": "park", "occurrences": 2}
  ],
  "grammar_points": ["past tense 〜ました"],
  "content_notes": []
}
```

Contract rules:

- `text` is the exact concatenation of `sentences[].text`, in order.
- Every sentence is fully covered by non-overlapping tokens whose `start`/`end` offsets index into that sentence.
- Phrase spans use token indices, are non-overlapping, and cover the sentence.
- `target_words` is a subset of the sentence tokens.
- Readings use hiragana; katakana loanwords keep katakana.
- Glosses are short, context-specific, and in English.
- The model must not invent token boundaries that cannot be validated. The client re-tokenizes every sentence and treats its own tokenizer as the source of truth for furigana; LLM token data is used for glosses and is aligned by offsets.
- If alignment fails, the app makes one repair call for that story. If it still fails, the tokenizer output is shown with sentence-level translations and word glosses marked unavailable rather than showing misaligned annotations.
- A second "audit" pass (gloss and level check) is optional for the MVP and can replace the repair pass if latency allows.

Prompt requirements:

- System prompt defines the level constraints, coverage targets, review words, new-word cap, length, and the learner-selected topic and tone. The app does not impose content exclusions beyond the provider's safety settings. (Q8)
- The user prompt supplies topic, style, seed, and learner interests.
- The prompt explicitly forbids English/romaji inside Japanese text, meta-commentary, and incomplete endings.
- Word selection is a suggestion, not a checklist. Natural Japanese wins over keyword inclusion; skipped words remain due.

## 11. Adaptation and scheduling algorithms

These formulas are the MVP baseline and must be tuned against beta data.

### 11.1 Feedback signals

| Signal | Definition | Range |
|---|---|---|
| `d` | Difficulty: too easy −1, just right 0, too hard +1 | −1 to +1 |
| `c_hard` | `(3 − comprehension) / 2` (1 → +1, 5 → −1) | −1 to +1 |
| `l_hard` | Lookup rate per 100 chars, normalized against level baseline, clamped. Word popovers count 1; deliberate sentence-translation reveals count 0.5. Furigana toggles do not count. | −1 to +1 |
| `q_hard` | `clamp(((didn't_know / checks) − 0.3) / 0.7, −1, 1)` when at least one check exists; otherwise 0 | −1 to +1 |

Lookup baselines per 100 characters: N5 8, N4 6, N3 4, N2 2.5, N1 1.5. Normalize as `(observed − baseline) / baseline`, clamped.

### 11.2 Level update

```
hardness = 0.45*d + 0.30*c_hard + 0.15*l_hard + 0.10*q_hard
H        = 0.6*H_prev + 0.4*hardness        // H starts at 0
level    = clamp(level - 0.15*H, 1.0, 5.0)
new_cap  = base_cap(level)
           + (comprehension >= 4 ? +1 : comprehension <= 2 ? -2 : 0)
new_cap  = clamp(new_cap, 0, 12)
```

- Positive `hardness` means too hard, so level decreases.
- Consecutive-hard rule: two stories in a row with `d = +1` or comprehension ≤2 → `level -= 0.10` and `new_cap = 0` next story.
- Consecutive-easy rule: two stories in a row with `d = −1` and comprehension = 5 → `level += 0.10` and `new_cap += 2`.
- Hard cap: no more than 0.25 total movement per story.
- A story with no feedback applies only `l_hard` with half weight and does not trigger consecutive-story rules.

### 11.3 Word recognition updates

| Event | Recognition change | Other effects |
|---|---|---|
| Added | Set to 0 | Stability 1 day; due tomorrow |
| "Knew it" | +14 | Successes +1; stability from ladder `[1, 3, 7, 14, 30, 60]` indexed by successes; due = now + stability |
| "Sort of" | +4 | Stability unchanged; due = now + max(1, stability / 2) days |
| "Didn't know" | −25 | Successes reset to 0; stability 1 day; due tomorrow |
| Passive exposure (appeared, no check shown) | +1, capped at 40 total | Exposures +1 |

Recognition is clamped to 0–100.

**Graduation:** recognition ≥85 AND successes ≥3 AND the last three checks are all "Knew it" → Known.

**Demotion:** a Known word sent to "needs review" or marked "Didn't know" in a manual review returns to Learning with recognition 50, successes 0, due tomorrow.

**Injection count** for a Learning word:

```
n = clamp(round(4 * (1 - recognition / 100)), 0, 4)
```

Known words get n = 0 (natural occurrence only).

**First-story override:** a newly added word appears 1–2 times in its first story, even when above the current level, then follows the normal injection formula in later stories.

**Cooldown** since last appearance:

| Recognition | Minimum days before re-injection |
|---|---|
| < 40 | 0 (may appear next story) |
| 40–69 | 3 |
| 70–84 | 7 |
| ≥ 85 | Graduated; no injection |

**Selection:** up to the per-story review budget, due first, then lowest recognition. Newly added words bypass the cooldown for their first appearance and are prioritized in the next story. At most three words more than one level above the current level are introduced per story; the remainder carry over as "Next story." Skip words in cooldown or ineligible states. If a word cannot be placed naturally, skip it rather than forcing it.

## 12. UX specification

### Screens

1. **Home / Read next.** Current level, due words, primary "Read next" action, recent stories, compact stats.
2. **Reader.** The product.
3. **Feedback sheet.** Post-story, four short steps, skippable.
4. **Word list.** Search, filters, word rows, export.
5. **Settings.** Reading preferences, provider, data.
6. **Onboarding.** Three steps: level, preferences, first story.

### Reader wireframe

```
┌──────────────────────────────────────────────────┐
│  ← Library           N4 · lower        F  あ  ⚙  │
├──────────────────────────────────────────────────┤
│  公園の猫                          2 min · 40%    │
│                                                  │
│  今日は公園へ行きました。                          │
│  ベンチに白い猫がいました。                        │
│  猫は静かに眠っていました。                        │
│                                                  │
│      ┌─ 公園 ──────────────────┐                 │
│      │ こうえん · park          │                 │
│      │ noun · N5 · not tracked  │                 │
│      │ Phrase: 公園へ行きました  │                 │
│      │ → went to the park       │                 │
│      │ [ + Add to word list ]   │                 │
│      └──────────────────────────┘                 │
│                                                  │
│                              [ Finish story ]    │
└──────────────────────────────────────────────────┘
```

### Interaction principles

- Text first. No persistent chrome over the reading column.
- One overlay at a time. The word popover is not a modal.
- Lookup never navigates. Adding a word never moves the reading position.
- Furigana and translations are learner-controlled and remembered.
- Empty, loading, error, offline, and fallback states are explicit and recoverable.
- No streak pressure, leaderboards, or guilt copy in the MVP.

### Feedback sheet wireframe

```
Story complete · 3 min

How much did you understand?
  1   2   3   4   5

How did the difficulty feel?
  Too easy   Just right   Too hard

Did these words feel familiar?
  公園  (こうえん)  … ベンチに白い猫がいました。
  [ Knew it ] [ Sort of ] [ Didn't know ]

[ Skip ]                         [ Save & continue ]
```

## 13. Technical architecture

**Decided for the MVP:** a static browser application with no backend. The learner supplies an LLM endpoint and key (BYOK). This is the fastest MVP and keeps learner data local, but a public deployment exposes the key to the page origin; the UI must warn about this and recommend a scoped key.

- **Stack:** Vite + TypeScript, output as static HTML/JS/CSS deployable to any static host or run locally. A lightweight component layer (Preact or React) is acceptable; no server runtime.
- **Tokenization:** kuromoji.js in a Web Worker. Its dictionary is large (~15 MB), so load it lazily after onboarding and cache it. The UI must remain usable while it loads.
- **Furigana:** generated from tokenizer readings with okurigana-aware alignment. LLM-provided readings are a fallback for names and unknowns only.
- **Line breaking:** `line-break: strict` plus BudouX or equivalent for phrase-aware wrapping if native wrapping looks poor.
- **LLM adapter:** an interface over OpenAI-compatible chat completions with streaming, configurable base URL and model. Anthropic support can be added behind the same interface. Requests and responses are logged locally (without the key) for debugging.
- **Storage:** IndexedDB via Dexie. Settings and the API key live in localStorage; the key is excluded from exports and diagnostic logs.
- **Rendering safety:** all model output is inserted as text nodes. No `innerHTML` with model content. A strict CSP limits network destinations to the configured provider.
- **Fallback corpus:** three pre-written stories per level (15 total) with precomputed tokens, used when generation fails twice. Label clearly as "offline story"; review-word personalization may be absent.
- **Deployment caveat:** opening the app via `file://` breaks fetching the tokenizer dictionary in most browsers. The README must document `npx serve` or static hosting.
- **Browser support:** latest Chrome, Safari, Firefox, and Edge on desktop; iOS Safari and Android Chrome. Touch lookup is required, not optional.

### Dependencies to verify

- kuromoji.js dictionary license and bundle size.
- A JLPT vocabulary and kanji list with a compatible license, used for level validation and tags.
- A high-frequency word list for coverage scoring.
- LLM provider terms, rate limits, and cost per story.

## 14. Data model

| Entity | Key fields |
|---|---|
| `Profile` | `id`, `level`, `levelLocked`, `furiganaMode`, `translationsDefault`, `interests[]`, `storyLength`, `createdAt`, `updatedAt` |
| `Word` | `id`, `dictionary`, `reading`, `surfaceForms[]`, `gloss`, `pos`, `jlpt`, `state`, `aboveLevel`, `firstStoryPending`, `recognition`, `successes`, `lapses`, `stabilityDays`, `dueAt`, `lastSeenAt`, `exposures`, `checks[]`, `sourceStoryId`, `sourceSentence`, `createdAt` |
| `Story` | `id`, `createdAt`, `level`, `levelAtGeneration`, `topic`, `titleJa`, `titleEn`, `text`, `sentences[]`, `targetWords[]`, `grammarPoints[]`, `generationMeta`, `isFallback`, `readState`, `finishedAt` |
| `Feedback` | `storyId`, `comprehension`, `difficulty`, `interest`, `skipped`, `wordChecks[{wordId, response}]`, `lookupCount`, `translationReveals`, `createdAt` |
| `GenerationLog` | `id`, `storyId`, `request`, `model`, `attempts`, `validation`, `fallbackUsed`, `error`, `createdAt` |
| `Settings` | `provider`, `model`, `baseUrl`, `furiganaDefault`, `textSize`, `locale` (English only in MVP) |

Indexes: `Word(state, dueAt)`, `Word(dictionary, reading)` unique, `Story(createdAt)`, `Feedback(storyId)` unique.

## 15. Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | A new learner selects N5 and receives a 150–300 character story with ≥95% coverage, no more than four new words, and every selected review word present at least once. |
| AC-2 | Furigana can be switched between Off, Always, Hover/tap, and Learn-only. Annotations appear only above kanji, okurigana is not annotated, and the choice persists across reloads. |
| AC-3 | Hovering or tapping a word shows reading, dictionary form, gloss, phrase translation, and an Add action in under 100ms without a network request. |
| AC-4 | Adding a word stores its dictionary form, prevents duplicates by form plus reading, shows Undo, and the word appears in the next generated story. |
| AC-5 | At story end, word checks include only tracked words that appeared in the text, never exceed six, and never include Known, Suspended, or absent words. |
| AC-6 | Three "Knew it" responses across three stories plus recognition ≥85 moves a word to Known; it is then neither injected nor quizzed, and its occurrences taper to zero. |
| AC-7 | Two consecutive "too hard" stories lower the level, reduce length, and set the next new-word cap to zero. Two consecutive "too easy" stories raise the level and increase the new-word cap. |
| AC-8 | A story that fails coverage, kanji, length, or alignment validation is repaired or replaced. The learner never sees a broken, misaligned, or empty story. |
| AC-9 | Reloading or restarting the browser preserves profile, words, stories, feedback, and settings. JSON export/import round-trips without loss and excludes the API key. |
| AC-10 | A keyboard-only learner can navigate tokens, open a popover, add a word, toggle furigana, and complete feedback. Screen readers announce sentence text and token readings sensibly. |
| AC-11 | No network requests occur except to the configured LLM provider. The API key is never exported, logged, or rendered in plain text. |
| AC-12 | A 2,000-character story renders interactive tokens in under 200ms on a mid-tier laptop after tokenization is cached. |
| AC-13 | A word added above the current level appears in the next story with furigana and a gloss. No more than three above-level additions are introduced in one story; the rest are marked "Next story" and rotate in. |

## 16. Accessibility, performance, and privacy

### Accessibility

- WCAG 2.1 AA contrast; usable at 200% zoom; touch targets at least 44×44 px.
- Tokens use roving tabindex with arrow-key navigation. `Enter` opens the popover; `A` adds the focused word; `Esc` closes.
- Sentence text remains readable by screen readers in natural order. Token detail is available on demand rather than read for every token.
- Furigana does not alter copied plain text.
- No essential information is conveyed by color alone.
- Respect reduced motion and high-contrast preferences.

### Performance

- Tokenization runs in a Web Worker and is cached per story.
- Popover data is precomputed at story load; no per-token network calls.
- Lazy-load the tokenizer dictionary and fallback corpus.
- Stream generation; p95 first text ≤8 s and full story ≤20 s on a typical broadband connection.
- IndexedDB reads/writes complete in under 50 ms for normal operations.

### Privacy and security

- No accounts, no backend, no telemetry by default.
- The API key lives in localStorage, is masked in the UI, and is never exported or included in diagnostic logs.
- Clear warning when hosting publicly: a browser-held key is visible to any script on that origin. Recommend a scoped key or a thin proxy.
- All model output is rendered as text; CSP restricts connections; no remote scripts.
- Content moderation via provider plus local blocklist; no user-generated public content.

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM cannot reliably hit the target level | Unreadable or boring stories | Validator gates, repair pass, level drop, fallback corpus, human review of beta stories |
| Tokenizer or gloss misalignment | Wrong furigana or meanings | Client tokenizer is the source of truth; offset validation; repair; report action |
| Self-reported difficulty is noisy | Level oscillates | Combine behavior signals; EWMA smoothing; per-story movement cap; calibration check P1 |
| Review words make stories unnatural | Lower comprehension and trust | Natural-fit rule, occurrence caps, skip-and-retry, subject-word exception |
| Learner-added above-level words reduce readability | Comprehension drops | Cap three advanced words per story, first-appearance furigana and gloss, rotate the rest, report adjusted coverage |
| Browser-exposed API key | Cost or data risk | BYOK warning, scoped keys, optional proxy (Q1) |
| Generation latency and cost | Abandonment | Short default stories, streaming, caching, cheap model, per-day budget |
| Content safety failure | Harm and trust loss | Provider moderation, learner-selected topics, one-time notice, Regenerate/Report actions; revisit before public distribution; residual risk accepted for v1 |
| Japanese ruby and line-breaking bugs | Poor readability | Cross-browser visual tests, okurigana test corpus, BudouX |
| Local data loss | Lost progress | Autosave, atomic writes, export reminder, import validation |
| Scope creep into a full SRS app | Diluted product | Reading-is-review non-goal; no flashcard queue in MVP |

## 18. Deferred items

All blocking product questions are resolved; see the decision log in §20. The following are explicitly outside the MVP and tracked for later:

1. **Calibration check (P1).** Optional 2–3 minute level check. The MVP relies on self-selection plus adaptation.
2. **Paragraph difficulty pulse (P1).** One-tap pulses for stories over 600 characters, with no word checks.
3. **Auto-suggested words (P1).** The MVP tracks only explicit adds. Suggestions can be added if learners struggle to find words worth keeping.
4. **Reading stats dashboard (P1).** Stories read, comprehension trend, level trend, vocabulary counts.
5. **Periodic Known-word recheck (P2).** The MVP uses manual "needs review" instead.
6. **Accounts and cloud sync (P2).** Local-only plus export/import in v1.
7. **Audio and TTS (P2).**
8. **Single-file HTML packaging.** Not planned; the static build is the deliverable.
9. **Public distribution review.** If the app is shared beyond the owner, revisit BYOK key handling, content policy, provider rate limits, and abuse controls before release.

## 19. Milestones

| Milestone | Deliverable | Estimate (solo) |
|---|---|---|
| M0 | PRD sign-off and open questions resolved | 1–2 days |
| M1 | App shell, onboarding, IndexedDB schema, settings | 3–4 days |
| M2 | Reader: tokenizer, furigana, popovers, add-to-list | 5–7 days |
| M3 | Generation pipeline, validation, repair, fallback | 4–6 days |
| M4 | Feedback, level adaptation, word scheduling | 3–5 days |
| M5 | Word list, story history, export/import | 2–3 days |
| M6 | Accessibility, cross-browser testing, beta with 5–10 learners | 3–5 days |

Roughly four weeks for one developer, excluding content review and beta iteration.

## 20. Decisions log

| # | Question | Decision | Date |
|---|---|---|---|
| Q1 | Generation and hosting | **Browser-only, BYOK.** Static app; learner supplies endpoint and key stored locally; no backend in v1. | 2026-10-17 |
| Q2 | Feedback cadence | **End of story only in the MVP.** One feedback sheet with comprehension, difficulty, interest, and up to six appeared-word checks. Paragraph pulses remain P1. | 2026-10-17 |
| Q3 | Level selection | **Self-select only in the MVP.** No placement test; adaptation corrects within one or two stories. Optional calibration remains P1. | 2026-10-17 |
| Q4 | Backend acceptable | **No backend in v1.** BYOK browser-only. Revisit only if the app is publicly shared and key exposure becomes a blocker. | 2026-10-17 |
| Q5 | Accounts and sync | **Local-only + JSON export/import.** No accounts or cloud sync in v1. | 2026-10-17 |
| Q6 | Story length default | **Short, 2–4 minutes** (roughly 300–600 characters at N4). Medium and long remain selectable per story. | 2026-10-17 |
| Q7 | Translation access | **Word hover/tap** for reading, gloss, and phrase translation; **full-sentence English on demand** via tap or the `T` toggle. | 2026-10-17 |
| Q8 | Content boundaries | **Learner chooses the topic; no app-level hard exclusions.** Provider moderation and safety settings are the boundary. One-time notice at onboarding, plus Regenerate and Report on every story. Public distribution requires a policy review. | 2026-10-17 |
| Q9 | Auto-suggested words | **Manual adds only in the MVP.** Auto-suggestions are P1. | 2026-10-17 |
| Q10 | Known-word maintenance | **Three "Knew it" checks across three stories + recognition ≥85, with manual "mark known" and "needs review" overrides.** No automatic recheck of Known words. | 2026-10-17 |
| Q11 | Flashcard mode | **No separate review queue.** Reading is the review; the word list is a management view, not a daily drill. | 2026-10-17 |
| Q12 | Packaging | **Static build** (Vite + TypeScript) that outputs HTML/JS/CSS, not a single-file HTML. Deployable to any static host or served locally. | 2026-10-17 |
| Q13 | Tokenizer size | **kuromoji.js, lazy-loaded in a Web Worker.** The dictionary size is acceptable for a static app; revisit only if load time hurts the first-run experience. | 2026-10-17 |
| Q14 | Audio priority | **Deferred to P2.** No TTS in the MVP. | 2026-10-17 |
| Q15 | Advanced added words | **Include immediately.** Newly added words are prioritized for the next story even when above level. Cap three above-level introductions per story; the rest rotate in as "Next story." First appearance gets furigana and a gloss. | 2026-10-17 |
