import type { GenerationRequest } from './types';

const CONTRACT_EXAMPLE = `{
  "title_ja": "公園の猫",
  "title_en": "The Park Cat",
  "level": 2.0,
  "summary_en": "A short story about a cat in the park.",
  "text": "今日は公園へ行きました。",
  "sentences": [
    {
      "text": "今日は公園へ行きました。",
      "translation_en": "Today I went to the park.",
      "tokens": [
        {"surface": "今日", "dictionary": "今日", "reading": "きょう", "pos": "noun", "gloss": "today", "jlpt": 5},
        {"surface": "公園", "dictionary": "公園", "reading": "こうえん", "pos": "noun", "gloss": "park", "jlpt": 5},
        {"surface": "行きました", "dictionary": "行く", "reading": "いきました", "pos": "verb", "gloss": "went", "jlpt": 5}
      ],
      "phrases": []
    }
  ],
  "target_words": [
    {"dictionary": "公園", "reading": "こうえん", "gloss": "park", "occurrences": 1}
  ],
  "grammar_points": ["past tense 〜ました"],
  "content_notes": []
}`;

export function buildSystemPrompt(): string {
  return [
    'You are a Japanese graded-reader story generator for an English-speaking learner.',
    'Return exactly one JSON object and no markdown, code fence, commentary, or explanation.',
    'The JSON must match the contract below. All displayed content must be plain text, never HTML or Markdown.',
    'The Japanese text must be original, coherent, self-contained, and end properly. Never write "to be continued."',
    'Client-side tokenization is authoritative for furigana and offsets. DO NOT output start/end offsets.',
    'Provide a compact token gloss list containing content words (nouns, verbs, adjectives, adverbs), each with surface, dictionary, reading, pos, gloss, and jlpt. Omit particles and auxiliaries unless their meaning is essential.',
    'phrases may be an empty array; the client builds phrase spans and aligns tokens.',
    'target_words must be a subset of story tokens. Readings use hiragana; katakana loanwords may keep katakana.',
    'Japanese story text must not contain English or romaji. Katakana loanwords are allowed.',
    'Glosses are short, contextual, and in English.',
    'Aim for at least 95% assumed-known-token coverage. Respect the new-word cap. Do not stuff review words; natural Japanese wins.',
    `COMPACT CONTRACT EXAMPLE:\n${CONTRACT_EXAMPLE}`,
  ].join('\n');
}

export function buildUserPrompt(request: GenerationRequest): string {
  const reviewLines = request.reviewWords.length
    ? request.reviewWords
        .map(
          (word) =>
            `- ${word.dictionary}（${word.reading}）: ${word.gloss}; ${word.pos}; JLPT ${word.jlpt ?? 'unknown'}; target ${word.targetOccurrences} occurrence(s)${word.aboveLevel ? '; above current level, gloss and furigana on first appearance' : ''}${word.sourceSentence ? `; previous context: ${word.sourceSentence}` : ''}`,
        )
        .join('\n')
    : '- None selected.';

  const repair = request.repairNotes.length
    ? `\nREPAIR REQUIRED. Rewrite the whole story and fix every violation:\n${request.repairNotes.map((note) => `- ${note}`).join('\n')}`
    : '';

  return [
    `Write one graded Japanese story at continuous level ${request.level.toFixed(2)} (JLPT band ${bandForPrompt(request.level)}).`,
    `Topic: ${request.topic}. Style: ${request.style}. Learner interests: ${request.interests.join(', ') || 'general'}.`,
    `Length: ${request.targetChars.min}–${request.targetChars.max} Japanese characters (target ${request.targetChars.target}). Preference: ${request.lengthPreference}.`,
    `Allowed grammar and vocabulary guidance: ${request.grammar.join('; ')}.`,
    `New-word cap: ${request.newWordCap} genuinely new dictionary forms. Learner-added review words do not count against this cap.`,
    'At least 95% of eligible tokens should be assumed known at this level. Use common vocabulary and avoid unexplained rare kanji.',
    'If a review word cannot be included naturally, do not force it; but each selected review word that you do include must appear the requested number of times, and at least 70% of selected words should appear at least twice.',
    'Do not deliberately inject words the learner already knows; they may appear naturally.',
    `Review words to weave in:\n${reviewLines}`,
    `Known words (natural use only; do not keyword-stuff): ${request.knownWords.slice(0, 60).join('、') || 'none yet'}.`,
    `Random seed for variety: ${request.seed}. Avoid copying recent titles: ${request.recentTitles.slice(0, 6).join(' / ') || 'none'}.`,
    'Avoid English/romaji inside Japanese text, meta-commentary, headings inside the story text, and incomplete endings.',
    'Return the JSON object only.',
    repair,
  ].join('\n');
}

export function bandForPrompt(level: number): string {
  if (level < 2) return 'N5';
  if (level < 3) return 'N4';
  if (level < 4) return 'N3';
  if (level < 5) return 'N2';
  return 'N1';
}

export function buildRepairPrompt(notes: string[]): string {
  return [
    'The previous story failed validation. Rewrite the entire story as one JSON object.',
    'Do not patch the old text and do not add commentary. Fix every violation below:',
    ...notes.map((note) => `- ${note}`),
  ].join('\n');
}
