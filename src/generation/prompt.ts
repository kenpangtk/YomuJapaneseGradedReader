import { bandForLevel } from '../lib/level';
import type { Language } from '../types';
import type { GenerationRequest } from './types';

const CONTRACT_EXAMPLE_JA = `{
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

const EDIT_CONTRACT_EXAMPLE_JA = `{
  "edits": [
    {
      "sentence_index": 1,
      "old_text": "ベンチに白い猫がいました。",
      "new_text": "ベンチに白い猫がいました。",
      "translation_en": "There was a white cat on the bench.",
      "tokens": [
        {"surface": "ベンチ", "dictionary": "ベンチ", "reading": "ベンチ", "pos": "noun", "gloss": "bench", "jlpt": 4},
        {"surface": "白い", "dictionary": "白い", "reading": "しろい", "pos": "adjective", "gloss": "white", "jlpt": 5}
      ]
    }
  ],
  "title_ja": "公園の猫",
  "title_en": "The Park Cat",
  "summary_en": "A short story about a cat in the park."
}`;

const CONTRACT_EXAMPLE_ZH = `{
  "title_ja": "公园里的猫",
  "title_en": "The Cat in the Park",
  "level": 1.2,
  "summary_en": "A short story about a cat in the park.",
  "text": "今天天气很好，我去了公园。",
  "sentences": [
    {
      "text": "今天天气很好，我去了公园。",
      "translation_en": "The weather was nice today, so I went to the park.",
      "tokens": [
        {"surface": "今天", "dictionary": "今天", "reading": "jīntiān", "pos": "noun", "gloss": "today", "jlpt": 1},
        {"surface": "天气", "dictionary": "天气", "reading": "tiānqì", "pos": "noun", "gloss": "weather", "jlpt": 1},
        {"surface": "公园", "dictionary": "公园", "reading": "gōngyuán", "pos": "noun", "gloss": "park", "jlpt": 1}
      ],
      "phrases": []
    }
  ],
  "target_words": [
    {"dictionary": "公园", "reading": "gōngyuán", "gloss": "park", "occurrences": 1}
  ],
  "grammar_points": ["了 for completed actions", "是 sentences"],
  "content_notes": []
}`;

const EDIT_CONTRACT_EXAMPLE_ZH = `{
  "edits": [
    {
      "sentence_index": 1,
      "old_text": "长椅上有一只白猫。",
      "new_text": "长椅上有一只白猫。",
      "translation_en": "There was a white cat on the bench.",
      "tokens": [
        {"surface": "长椅", "dictionary": "长椅", "reading": "chángyǐ", "pos": "noun", "gloss": "bench", "jlpt": 2},
        {"surface": "白", "dictionary": "白", "reading": "bái", "pos": "adjective", "gloss": "white", "jlpt": 1}
      ]
    }
  ],
  "title_ja": "公园里的猫",
  "title_en": "The Cat in the Park",
  "summary_en": "A short story about a cat in the park."
}`;

function buildJapaneseSystemPrompt(): string {
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
    `COMPACT CONTRACT EXAMPLE:\n${CONTRACT_EXAMPLE_JA}`,
  ].join('\n');
}

function buildChineseSystemPrompt(): string {
  return [
    'You are a Simplified Chinese (Mandarin) graded-reader story generator for an English-speaking learner.',
    'Return exactly one JSON object and no markdown, code fence, commentary, or explanation.',
    'The JSON must match the contract below. All displayed content must be plain text, never HTML or Markdown.',
    'Write natural Simplified Chinese characters only. Do not use Traditional Chinese characters.',
    'The Chinese text must be original, coherent, self-contained, and end properly. Never write "to be continued."',
    'Client-side tokenization is authoritative for pinyin ruby and offsets. DO NOT output start/end offsets.',
    'Provide a compact token gloss list containing content words (nouns, verbs, adjectives, adverbs), each with surface, dictionary, reading, pos, gloss, and jlpt. Omit particles and auxiliaries unless their meaning is essential.',
    "For Chinese, the token 'reading' field must be tone-marked Hanyu Pinyin (for example 公园 → gōngyuán). Never put pinyin, English, or romaji inside the story text itself.",
    "For Chinese, the 'jlpt' token field carries the HSK band from 1 to 6.",
    'phrases may be an empty array; the client builds phrase spans and aligns tokens.',
    'target_words must be a subset of story tokens and use the same tone-marked pinyin readings.',
    'Chinese story text must not contain pinyin, English, or romaji. Do not include English translations in the story text; English belongs only in translation_en and gloss fields.',
    'Glosses are short, contextual, and in English.',
    'Aim for at least 95% assumed-known-token coverage. Respect the new-word cap. Do not stuff review words; natural Chinese wins.',
    `COMPACT CONTRACT EXAMPLE:\n${CONTRACT_EXAMPLE_ZH}`,
  ].join('\n');
}

export function buildSystemPrompt(language: Language = 'ja'): string {
  return language === 'zh' ? buildChineseSystemPrompt() : buildJapaneseSystemPrompt();
}

function buildJapaneseEditSystemPrompt(): string {
  return [
    'You are editing an existing Japanese graded-reader story for an English-speaking learner.',
    'Return exactly one JSON object and no markdown, code fence, commentary, or explanation.',
    'The object must contain an "edits" array. Each edit replaces one existing sentence.',
    'Identify the sentence with its 0-based sentence_index and copy its old_text exactly.',
    'Change ONLY the sentences needed to fix the validation errors. Preserve every unaffected sentence exactly.',
    'Prefer expanding or condensing an existing sentence. Do not add new sentences. To delete a sentence, set new_text to an empty string.',
    'Each edit must include translation_en and a compact token gloss list of content words with surface, dictionary, reading, pos, gloss, and jlpt.',
    'Do NOT output token offsets. Client-side tokenization is authoritative.',
    'Keep the story coherent, at the requested level, and within the requested length. Natural Japanese wins over keyword stuffing.',
    'Japanese text must not contain English or romaji. Katakana loanwords are allowed. Glosses are short and in English.',
    `EDIT CONTRACT EXAMPLE:\n${EDIT_CONTRACT_EXAMPLE_JA}`,
  ].join('\n');
}

function buildChineseEditSystemPrompt(): string {
  return [
    'You are editing an existing Simplified Chinese graded-reader story for an English-speaking learner.',
    'Return exactly one JSON object and no markdown, code fence, commentary, or explanation.',
    'The object must contain an "edits" array. Each edit replaces one existing sentence.',
    'Identify the sentence with its 0-based sentence_index and copy its old_text exactly.',
    'Change ONLY the sentences needed to fix the validation errors. Preserve every unaffected sentence exactly.',
    'Prefer expanding or condensing an existing sentence. Do not add new sentences. To delete a sentence, set new_text to an empty string.',
    'Each edit must include translation_en and a compact token gloss list of content words with surface, dictionary, reading, pos, gloss, and jlpt.',
    'Do NOT output token offsets. Client-side tokenization is authoritative.',
    "For Chinese, token readings must be tone-marked Hanyu Pinyin and the 'jlpt' field carries the HSK band from 1 to 6.",
    'Use Simplified Chinese characters only. Keep the story coherent, at the requested level, and within the requested length. Natural Chinese wins over keyword stuffing.',
    'Chinese text must not contain pinyin, English, or romaji. Glosses are short and in English.',
    `EDIT CONTRACT EXAMPLE:\n${EDIT_CONTRACT_EXAMPLE_ZH}`,
  ].join('\n');
}

export function buildEditSystemPrompt(language: Language = 'ja'): string {
  return language === 'zh' ? buildChineseEditSystemPrompt() : buildJapaneseEditSystemPrompt();
}

function bandLabel(level: number): string {
  if (level < 2) return 'N5';
  if (level < 3) return 'N4';
  if (level < 4) return 'N3';
  if (level < 5) return 'N2';
  return 'N1';
}

export function bandForPrompt(level: number, language: Language = 'ja'): string {
  return language === 'zh' ? bandForLevel(level, 'zh').code : bandLabel(level);
}

function levelLabel(level: number, language: Language): string {
  return language === 'zh'
    ? `HSK band ${bandForPrompt(level, language)}`
    : `JLPT band ${bandForPrompt(level, language)}`;
}

function reviewWordLines(request: GenerationRequest): string {
  if (!request.reviewWords.length) return '- None selected.';
  const tag = request.language === 'zh' ? 'HSK' : 'JLPT';
  const above = request.language === 'zh'
    ? 'above current level, gloss and pinyin on first appearance'
    : 'above current level, gloss and furigana on first appearance';
  return request.reviewWords
    .map(
      (word) =>
        `- ${word.dictionary}（${word.reading}）: ${word.gloss}; ${word.pos}; ${tag} ${word.jlpt ?? 'unknown'}; target ${word.targetOccurrences} occurrence(s)${word.aboveLevel ? `; ${above}` : ''}${word.sourceSentence ? `; previous context: ${word.sourceSentence}` : ''}`,
    )
    .join('\n');
}

function languageGuidance(language: Language): {
  script: string;
  characters: string;
  reviewNote: string;
  avoid: string;
} {
  if (language === 'zh') {
    return {
      script: 'Simplified Chinese',
      characters: 'Simplified Chinese characters',
      reviewNote: 'If a review word cannot be included naturally, do not force it; but each selected review word that you do include must appear the requested number of times, and at least 70% of selected words should appear at least twice.',
      avoid: 'Avoid pinyin, English, or romaji inside Chinese text, Traditional Chinese characters, meta-commentary, headings inside the story text, and incomplete endings.',
    };
  }
  return {
    script: 'Japanese',
    characters: 'Japanese characters',
    reviewNote: 'If a review word cannot be included naturally, do not force it; but each selected review word that you do include must appear the requested number of times, and at least 70% of selected words should appear at least twice.',
    avoid: 'Avoid English/romaji inside Japanese text, meta-commentary, headings inside the story text, and incomplete endings.',
  };
}

export function buildUserPrompt(request: GenerationRequest): string {
  if (request.previousStory && request.repairNotes.length) {
    return buildEditUserPrompt(request);
  }

  const language = request.language;
  const guidance = languageGuidance(language);
  const reviewLines = reviewWordLines(request);
  const repair = request.repairNotes.length
    ? `\nREPAIR REQUIRED. The previous attempt failed. Write a corrected story that fixes every violation:\n${request.repairNotes.map((note) => `- ${note}`).join('\n')}`
    : '';
  const pinyinLine =
    language === 'zh'
      ? "Use tone-marked Hanyu Pinyin only in each token's 'reading' field; keep the story text free of pinyin."
      : 'Use hiragana readings in the token reading field; katakana loanwords may keep katakana.';

  return [
    `Write one graded ${guidance.script} story at continuous level ${request.level.toFixed(2)} (${levelLabel(request.level, language)}).`,
    `Topic: ${request.topic}. Style: ${request.style}. Learner interests: ${request.interests.join(', ') || 'general'}.`,
    `Length: ${request.targetChars.min}–${request.targetChars.max} ${guidance.characters} (target ${request.targetChars.target}). Preference: ${request.lengthPreference}.`,
    `LENGTH RULE: The final story text must contain at least ${request.targetChars.min} and at most ${request.targetChars.max} ${guidance.characters}. Count characters, not words. Do not finish early; add scene detail, description, or dialogue until the minimum is met.`,
    `Allowed grammar and vocabulary guidance: ${request.grammar.join('; ')}.`,
    `New-word cap: ${request.newWordCap} genuinely new dictionary forms. Learner-added review words do not count against this cap.`,
    'At least 95% of eligible tokens should be assumed known at this level. Use common vocabulary and avoid unexplained rare characters.',
    guidance.reviewNote,
    'Do not deliberately inject words the learner already knows; they may appear naturally.',
    pinyinLine,
    `Review words to weave in:\n${reviewLines}`,
    `Known words (natural use only; do not keyword-stuff): ${request.knownWords.slice(0, 60).join('、') || 'none yet'}.`,
    `Random seed for variety: ${request.seed}. Avoid copying recent titles: ${request.recentTitles.slice(0, 6).join(' / ') || 'none'}.`,
    guidance.avoid,
    'Before returning, count the characters in the story text and verify the length is within the requested range.',
    'Return the JSON object only.',
    repair,
  ].join('\n');
}

function buildEditUserPrompt(request: GenerationRequest): string {
  const previous = request.previousStory;
  if (!previous) return buildUserPrompt({ ...request, previousStory: null });

  const language = request.language;
  const guidance = languageGuidance(language);
  const pinyinRule =
    language === 'zh'
      ? "- Token readings must be tone-marked Hanyu Pinyin; the 'jlpt' field carries the HSK band (1-6). Do not put pinyin or English inside the Chinese sentence text."
      : '- Token readings use hiragana; do not put English or romaji inside the Japanese sentence text.';

  return [
    'EDIT the previous story so it passes validation. Return only the JSON edit object.',
    `Target level: ${request.level.toFixed(2)} (${levelLabel(request.level, language)}).`,
    `Target length: ${request.targetChars.min}–${request.targetChars.max} ${guidance.characters} (target ${request.targetChars.target}).`,
    `LENGTH RULE: The final story must be ${request.targetChars.min}–${request.targetChars.max} ${guidance.characters}. If it is below the minimum, expand existing sentences or add a sentence with new scene detail; if it is above the maximum, condense.`,
    `New-word cap: ${request.newWordCap} genuinely new dictionary forms. Learner-added review words do not count against this cap.`,
    `Allowed grammar and vocabulary guidance: ${request.grammar.join('; ')}.`,
    `Review words to keep or weave in:\n${reviewWordLines(request)}`,
    '',
    'PREVIOUS STORY',
    `Title: ${previous.title_ja}`,
    `Summary: ${previous.summary_en}`,
    ...previous.sentences.map(
      (sentence, index) => `${index}. ${sentence.text}\n   EN: ${sentence.translation_en}`,
    ),
    '',
    'VALIDATION ERRORS TO FIX:',
    ...request.repairNotes.map((note) => `- ${note}`),
    '',
    'EDIT RULES:',
    '- Change only the sentences needed to fix the errors. Preserve all other sentences exactly.',
    '- Use the 0-based sentence_index and copy old_text exactly as shown.',
    '- Include translation_en and content-word tokens for every edited sentence.',
    '- Do not add or remove sentences unless the error cannot be fixed otherwise. Use new_text: "" to delete a sentence.',
    '- To lengthen the story, expand existing sentences with detail; to shorten it, condense existing sentences. Do not add new sentences.',
    '- Do not output token offsets. Client tokenization is authoritative.',
    pinyinRule,
    '- Return {"edits":[...]} only. No commentary.',
  ].join('\n');
}
