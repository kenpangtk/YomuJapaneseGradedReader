import { jsonrepair } from 'jsonrepair';

export interface ContractToken {
  surface: string;
  dictionary: string;
  reading: string;
  pos: string;
  gloss: string;
  jlpt?: number | null;
  start: number;
  end: number;
}

export interface ContractPhrase {
  start: number;
  end: number;
  gloss: string;
}

export interface ContractSentence {
  text: string;
  translation_en: string;
  tokens: ContractToken[];
  phrases: ContractPhrase[];
}

export interface ContractTargetWord {
  dictionary: string;
  reading: string;
  gloss: string;
  occurrences?: number;
}

export interface ContractStory {
  title_ja: string;
  title_en: string;
  level: number;
  summary_en: string;
  text: string;
  sentences: ContractSentence[];
  target_words: ContractTargetWord[];
  grammar_points: string[];
  content_notes: string[];
}

const CONTRACT_KEYS = [
  'title_ja',
  'title_en',
  'level',
  'summary_en',
  'text',
  'sentences',
  'target_words',
  'grammar_points',
  'content_notes',
] as const;

export function extractJsonObject(raw: string): { value: unknown; cleaned: string } {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The provider did not return a JSON object.');
  }
  const json = candidate.slice(start, end + 1);
  try {
    return { value: JSON.parse(json) as unknown, cleaned: json };
  } catch (error) {
    try {
      const repaired = jsonrepair(json);
      return { value: JSON.parse(repaired) as unknown, cleaned: repaired };
    } catch {
      throw new Error(
        `The provider returned invalid JSON that could not be repaired: ${error instanceof Error ? error.message : 'parse error'}`,
      );
    }
  }
}

export function validateContractShape(value: unknown): ContractStory {
  if (!value || typeof value !== 'object') {
    throw new Error('Story payload is not an object.');
  }
  const record = value as Record<string, unknown>;
  for (const key of CONTRACT_KEYS) {
    if (!(key in record)) throw new Error(`Missing required field: ${key}.`);
  }
  if (typeof record.title_ja !== 'string' || !record.title_ja.trim()) {
    throw new Error('title_ja must be a non-empty string.');
  }
  if (typeof record.title_en !== 'string') throw new Error('title_en must be a string.');
  if (typeof record.level !== 'number' || !Number.isFinite(record.level)) {
    throw new Error('level must be a number.');
  }
  if (typeof record.summary_en !== 'string') throw new Error('summary_en must be a string.');
  if (typeof record.text !== 'string' || !record.text.trim()) {
    throw new Error('text must be a non-empty string.');
  }
  if (!Array.isArray(record.sentences) || record.sentences.length === 0) {
    throw new Error('sentences must be a non-empty array.');
  }
  if (!Array.isArray(record.target_words)) throw new Error('target_words must be an array.');
  if (!Array.isArray(record.grammar_points)) throw new Error('grammar_points must be an array.');
  if (!Array.isArray(record.content_notes)) throw new Error('content_notes must be an array.');

  const sentences = record.sentences.map((item, sentenceIndex) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`sentences[${sentenceIndex}] must be an object.`);
    }
    const sentence = item as Record<string, unknown>;
    if (typeof sentence.text !== 'string' || !sentence.text) {
      throw new Error(`sentences[${sentenceIndex}].text must be a non-empty string.`);
    }
    if (typeof sentence.translation_en !== 'string') {
      throw new Error(`sentences[${sentenceIndex}].translation_en must be a string.`);
    }
    if (!Array.isArray(sentence.tokens)) {
      throw new Error(`sentences[${sentenceIndex}].tokens must be an array.`);
    }
    if (!Array.isArray(sentence.phrases)) {
      throw new Error(`sentences[${sentenceIndex}].phrases must be an array.`);
    }
    const tokens = sentence.tokens.map((token, tokenIndex) => {
      if (!token || typeof token !== 'object') {
        throw new Error(`tokens[${tokenIndex}] must be an object.`);
      }
      const t = token as Record<string, unknown>;
      for (const key of ['surface', 'dictionary', 'reading', 'pos', 'gloss'] as const) {
        if (typeof t[key] !== 'string') {
          throw new Error(`sentences[${sentenceIndex}].tokens[${tokenIndex}].${key} must be a string.`);
        }
      }
      const hasStart = typeof t.start === 'number';
      const hasEnd = typeof t.end === 'number';
      if (hasStart !== hasEnd) {
        throw new Error(`sentences[${sentenceIndex}].tokens[${tokenIndex}] has incomplete offsets.`);
      }
      if (
        (hasStart && !Number.isInteger(t.start)) ||
        (hasEnd && !Number.isInteger(t.end))
      ) {
        throw new Error(`sentences[${sentenceIndex}].tokens[${tokenIndex}] has invalid offsets.`);
      }
      return {
        surface: t.surface as string,
        dictionary: t.dictionary as string,
        reading: t.reading as string,
        pos: t.pos as string,
        gloss: t.gloss as string,
        jlpt: typeof t.jlpt === 'number' ? t.jlpt : null,
        start: hasStart ? (t.start as number) : 0,
        end: hasEnd ? (t.end as number) : 0,
      } satisfies ContractToken;
    });
    const phrases = sentence.phrases.map((phrase, phraseIndex) => {
      if (!phrase || typeof phrase !== 'object') {
        throw new Error(`phrases[${phraseIndex}] must be an object.`);
      }
      const p = phrase as Record<string, unknown>;
      if (
        typeof p.start !== 'number' ||
        typeof p.end !== 'number' ||
        !Number.isInteger(p.start) ||
        !Number.isInteger(p.end) ||
        typeof p.gloss !== 'string'
      ) {
        throw new Error(`sentences[${sentenceIndex}].phrases[${phraseIndex}] is invalid.`);
      }
      return { start: p.start, end: p.end, gloss: p.gloss } satisfies ContractPhrase;
    });
    return {
      text: sentence.text as string,
      translation_en: sentence.translation_en as string,
      tokens,
      phrases,
    } satisfies ContractSentence;
  });

  const targetWords = record.target_words.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`target_words[${index}] is invalid.`);
    const word = item as Record<string, unknown>;
    if (
      typeof word.dictionary !== 'string' ||
      typeof word.reading !== 'string' ||
      typeof word.gloss !== 'string'
    ) {
      throw new Error(`target_words[${index}] must include dictionary, reading, and gloss.`);
    }
    return {
      dictionary: word.dictionary,
      reading: word.reading,
      gloss: word.gloss,
      occurrences: typeof word.occurrences === 'number' ? word.occurrences : undefined,
    } satisfies ContractTargetWord;
  });

  return {
    title_ja: record.title_ja,
    title_en: record.title_en,
    level: record.level,
    summary_en: record.summary_en,
    text: record.text,
    sentences,
    target_words: targetWords,
    grammar_points: record.grammar_points.filter((item): item is string => typeof item === 'string'),
    content_notes: record.content_notes.filter((item): item is string => typeof item === 'string'),
  };
}
