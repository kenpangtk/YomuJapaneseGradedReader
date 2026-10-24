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

const CONTRACT_KEYS = ['title_ja', 'level', 'text', 'sentences'] as const;

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
  if (typeof record.level !== 'number' || !Number.isFinite(record.level)) {
    throw new Error('level must be a number.');
  }
  if (typeof record.text !== 'string' || !record.text.trim()) {
    throw new Error('text must be a non-empty string.');
  }
  if (!Array.isArray(record.sentences) || record.sentences.length === 0) {
    throw new Error('sentences must be a non-empty array.');
  }
  const targetWordValues = Array.isArray(record.target_words) ? record.target_words : [];
  const grammarValues = Array.isArray(record.grammar_points) ? record.grammar_points : [];
  const contentNoteValues = Array.isArray(record.content_notes) ? record.content_notes : [];

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
    const tokenValues = Array.isArray(sentence.tokens) ? sentence.tokens : [];
    const phraseValues = Array.isArray(sentence.phrases) ? sentence.phrases : [];
    const tokens = tokenValues.flatMap((token): ContractToken[] => {
      if (!token || typeof token !== 'object') return [];
      const t = token as Record<string, unknown>;
      for (const key of ['surface', 'dictionary', 'reading', 'pos', 'gloss'] as const) {
        if (typeof t[key] !== 'string') {
          return [];
        }
      }
      const hasStart = typeof t.start === 'number' && Number.isInteger(t.start);
      const hasEnd = typeof t.end === 'number' && Number.isInteger(t.end);
      return [
        {
          surface: t.surface as string,
          dictionary: t.dictionary as string,
          reading: t.reading as string,
          pos: t.pos as string,
          gloss: t.gloss as string,
          jlpt: typeof t.jlpt === 'number' ? t.jlpt : null,
          start: hasStart && hasEnd ? (t.start as number) : 0,
          end: hasStart && hasEnd ? (t.end as number) : 0,
        },
      ];
    });
    const phrases = phraseValues.flatMap((phrase): ContractPhrase[] => {
      if (!phrase || typeof phrase !== 'object') return [];
      const p = phrase as Record<string, unknown>;
      if (
        typeof p.start !== 'number' ||
        typeof p.end !== 'number' ||
        !Number.isInteger(p.start) ||
        !Number.isInteger(p.end) ||
        typeof p.gloss !== 'string'
      ) {
        return [];
      }
      return [{ start: p.start, end: p.end, gloss: p.gloss }];
    });
    return {
      text: sentence.text as string,
      translation_en: sentence.translation_en as string,
      tokens,
      phrases,
    } satisfies ContractSentence;
  });

  const targetWords = targetWordValues.flatMap((item): ContractTargetWord[] => {
    if (!item || typeof item !== 'object') return [];
    const word = item as Record<string, unknown>;
    if (
      typeof word.dictionary !== 'string' ||
      typeof word.reading !== 'string' ||
      typeof word.gloss !== 'string'
    ) {
      return [];
    }
    return [
      {
        dictionary: word.dictionary,
        reading: word.reading,
        gloss: word.gloss,
        occurrences: typeof word.occurrences === 'number' ? word.occurrences : undefined,
      },
    ];
  });

  return {
    title_ja: record.title_ja,
    title_en: typeof record.title_en === 'string' ? record.title_en : '',
    level: record.level,
    summary_en: typeof record.summary_en === 'string' ? record.summary_en : '',
    text: record.text,
    sentences,
    target_words: targetWords,
    grammar_points: grammarValues.filter((item): item is string => typeof item === 'string'),
    content_notes: contentNoteValues.filter((item): item is string => typeof item === 'string'),
  };
}

export interface ContractEdit {
  sentence_index?: number;
  old_text: string;
  new_text: string;
  translation_en?: string;
  tokens?: ContractToken[];
}

export interface ContractPatch {
  edits: ContractEdit[];
  title_ja?: string;
  title_en?: string;
  summary_en?: string;
}

function sameText(left: string, right: string): boolean {
  return left === right || left.trim() === right.trim();
}

function cleanEditTokens(value: unknown): ContractToken[] {
  if (!Array.isArray(value)) return [];
  const tokens: ContractToken[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const token = item as Record<string, unknown>;
    if (
      typeof token.surface !== 'string' ||
      typeof token.dictionary !== 'string' ||
      typeof token.reading !== 'string' ||
      typeof token.pos !== 'string' ||
      typeof token.gloss !== 'string'
    ) {
      continue;
    }
    tokens.push({
      surface: token.surface,
      dictionary: token.dictionary,
      reading: token.reading,
      pos: token.pos,
      gloss: token.gloss,
      jlpt: typeof token.jlpt === 'number' ? token.jlpt : null,
      // The client tokenizer supplies authoritative offsets during alignment.
      start: 0,
      end: 0,
    });
  }
  return tokens;
}

export function applyRepairPatch(previous: ContractStory, patch: ContractPatch): ContractStory {
  if (!Array.isArray(patch.edits) || patch.edits.length === 0) {
    throw new Error('The edit response contained no sentence changes.');
  }

  const replacements = new Map<number, ContractEdit>();
  for (const edit of patch.edits) {
    if (!edit || typeof edit !== 'object') {
      throw new Error('The edit response contained an invalid edit entry.');
    }
    if (typeof edit.old_text !== 'string' || typeof edit.new_text !== 'string') {
      throw new Error('Each edit must include old_text and new_text strings.');
    }

    let index = -1;
    if (typeof edit.sentence_index === 'number' && Number.isInteger(edit.sentence_index)) {
      const candidate = previous.sentences[edit.sentence_index];
      if (candidate && sameText(candidate.text, edit.old_text)) index = edit.sentence_index;
    }
    if (index === -1) {
      index = previous.sentences.findIndex(
        (sentence, candidateIndex) =>
          !replacements.has(candidateIndex) && sameText(sentence.text, edit.old_text),
      );
    }
    if (index === -1) {
      throw new Error(`Edit target not found for old_text "${edit.old_text.slice(0, 80)}".`);
    }
    if (replacements.has(index)) {
      throw new Error(`Multiple edits target sentence ${index}.`);
    }
    replacements.set(index, edit);
  }

  const sentences: ContractSentence[] = [];
  previous.sentences.forEach((sentence, index) => {
    const edit = replacements.get(index);
    if (!edit) {
      sentences.push({
        ...sentence,
        tokens: sentence.tokens.map((token) => ({ ...token })),
        phrases: sentence.phrases.map((phrase) => ({ ...phrase })),
      });
      return;
    }
    if (!edit.new_text.trim()) return;
    sentences.push({
      text: edit.new_text,
      translation_en:
        typeof edit.translation_en === 'string' ? edit.translation_en : sentence.translation_en,
      tokens: cleanEditTokens(edit.tokens),
      phrases: [],
    });
  });

  if (sentences.length === 0) {
    throw new Error('The edit response removed the entire story.');
  }

  const tokenKeys = new Map<string, number>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      const key = `${token.dictionary}|${token.reading}`;
      tokenKeys.set(key, (tokenKeys.get(key) ?? 0) + 1);
    }
  }

  return {
    ...previous,
    title_ja:
      typeof patch.title_ja === 'string' && patch.title_ja.trim()
        ? patch.title_ja
        : previous.title_ja,
    title_en: typeof patch.title_en === 'string' ? patch.title_en : previous.title_en,
    summary_en: typeof patch.summary_en === 'string' ? patch.summary_en : previous.summary_en,
    text: sentences.map((sentence) => sentence.text).join(''),
    sentences,
    target_words: previous.target_words.map((word) => ({
      ...word,
      occurrences: tokenKeys.get(`${word.dictionary}|${word.reading}`) ?? 0,
    })),
  };
}

export function parseRepairResponse(value: unknown, previous: ContractStory): ContractStory {
  if (!value || typeof value !== 'object') {
    throw new Error('Edit payload is not an object.');
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.edits)) {
    return applyRepairPatch(previous, record as unknown as ContractPatch);
  }
  return validateContractShape(value);
}
