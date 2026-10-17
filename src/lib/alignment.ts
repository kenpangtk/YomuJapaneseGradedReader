import type { PhraseSpan, ReaderSentence, ReaderToken } from '../types';
import type { ContractSentence, ContractStory, ContractTargetWord, ContractToken } from '../generation/contract';
import type { RawTokenizedSentence } from '../tokenizer/protocol';
import { buildFurigana } from './furigana';
import { hasKanji } from './text';

export interface GlossEntry {
  gloss: string;
  pos?: string;
  jlpt?: number | null;
}

export type GlossLookup = (surface: string, dictionary: string, reading: string) => GlossEntry | undefined;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function lookupFallback(lookup: GlossLookup, surface: string, dictionary: string, reading: string): GlossEntry | undefined {
  return lookup(surface, dictionary, reading) ?? (dictionary !== surface ? lookup(dictionary, dictionary, reading) : undefined);
}

interface ContractPhraseSpan {
  startChar: number;
  endChar: number;
  gloss: string;
}

function phraseSpans(sentence: ContractSentence): ContractPhraseSpan[] {
  return sentence.phrases
    .map((phrase) => {
      const startToken = sentence.tokens[phrase.start];
      const endToken = sentence.tokens[phrase.end - 1];
      if (!startToken || !endToken) return null;
      return { startChar: startToken.start, endChar: endToken.end, gloss: phrase.gloss };
    })
    .filter((phrase): phrase is ContractPhraseSpan => Boolean(phrase));
}

function buildAutoPhrases(tokens: ReaderToken[], translation: string, contract: ContractSentence): PhraseSpan[] {
  if (tokens.length === 0) return [];
  const boundaries: number[] = [];
  tokens.forEach((token, index) => {
    const last = index === tokens.length - 1;
    const next = tokens[index + 1];
    const nextStartsClause = next ? next.pos === 'conjunction' : false;
    const punctuation = token.pos === 'symbol' && /[。！？!?、,.]/u.test(token.surface);
    const particleLike = token.pos === 'particle' || token.pos === 'auxiliary';
    if (last || punctuation || particleLike || nextStartsClause) {
      boundaries.push(index + 1);
    }
  });
  if (boundaries[boundaries.length - 1] !== tokens.length) boundaries.push(tokens.length);

  const spans: PhraseSpan[] = [];
  let start = 0;
  const contractPhrases = phraseSpans(contract);
  const sentenceEnd = tokens[tokens.length - 1]?.end ?? 0;
  const singleWholeSentencePhrase =
    contractPhrases.length === 1 &&
    contractPhrases[0].startChar === 0 &&
    contractPhrases[0].endChar >= sentenceEnd;
  for (const end of boundaries) {
    const phraseTokens = tokens.slice(start, end);
    if (phraseTokens.length === 0) continue;
    const source = phraseTokens.map((token) => token.surface).join('');
    const startChar = phraseTokens[0].start;
    const endChar = phraseTokens[phraseTokens.length - 1].end;
    const width = Math.max(1, endChar - startChar);
    let best: ContractPhraseSpan | null = null;
    let bestOverlap = 0;
    for (const candidate of contractPhrases) {
      const overlap = Math.min(endChar, candidate.endChar) - Math.max(startChar, candidate.startChar);
      if (overlap > bestOverlap && overlap / width >= 0.45) {
        best = candidate;
        bestOverlap = overlap;
      }
    }
    const tokenGlosses = unique(
      phraseTokens
        .filter((token) => token.pos !== 'symbol' && token.gloss !== 'No gloss available')
        .map((token) => token.gloss),
    );
    const useContractGloss = best && !(singleWholeSentencePhrase && (start !== 0 || end !== tokens.length));
    const gloss =
      (useContractGloss ? best?.gloss?.trim() : '') ||
      (spans.length === 0 && end === tokens.length ? translation : '') ||
      tokenGlosses.join(' · ') ||
      translation ||
      source;
    spans.push({ start, end, gloss, source });
    start = end;
  }
  return spans;
}

/**
 * Re-tokenizes are the source of truth for surfaces, readings, offsets, and
 * furigana. Contract tokens contribute glosses and JLPT tags, aligned by offsets.
 */
export function alignSentence(
  contract: ContractSentence,
  raw: RawTokenizedSentence,
  lookup: GlossLookup,
): ReaderSentence {
  const tokens: ReaderToken[] = raw.tokens.map((rawToken) => {
    const overlaps = contract.tokens.filter(
      (token) => token.start < rawToken.end && token.end > rawToken.start,
    );
    const fallback = lookupFallback(lookup, rawToken.surface, rawToken.dictionary, rawToken.reading);
    const glosses = unique(overlaps.map((token) => token.gloss.trim()));
    const gloss = glosses.join('; ') || fallback?.gloss || 'No gloss available';
    const llmReading = overlaps.find((token) => token.reading)?.reading;
    const reading = rawToken.reading || llmReading || '';
    const jlpt =
      overlaps.find((token) => typeof token.jlpt === 'number')?.jlpt ??
      fallback?.jlpt ??
      null;
    return {
      surface: rawToken.surface,
      dictionary: rawToken.dictionary,
      reading,
      pos: rawToken.pos,
      posDetail: rawToken.posDetail,
      properNoun: rawToken.properNoun,
      jlpt,
      gloss,
      start: rawToken.start,
      end: rawToken.end,
      furigana: buildFurigana(rawToken.surface, reading),
    };
  });

  return {
    text: contract.text,
    translationEn: contract.translation_en,
    tokens,
    phrases: buildAutoPhrases(tokens, contract.translation_en, contract),
  };
}

export function alignStory(
  contract: ContractStory,
  rawSentences: RawTokenizedSentence[],
  lookup: GlossLookup,
): ReaderSentence[] {
  if (rawSentences.length !== contract.sentences.length) {
    throw new Error('Tokenizer sentence count did not match the story contract.');
  }
  return contract.sentences.map((sentence, index) =>
    alignSentence(sentence, rawSentences[index], lookup),
  );
}

export interface AlignmentReport {
  errors: string[];
  textIntegrity: boolean;
  tokensAligned: boolean;
  phrasesAligned: boolean;
  targetWordsValid: boolean;
}

export function validateContractAlignment(contract: ContractStory): AlignmentReport {
  const errors: string[] = [];
  const concatenated = contract.sentences.map((sentence) => sentence.text).join('');
  const textIntegrity = concatenated === contract.text;
  if (!textIntegrity) errors.push('Story text is not the exact concatenation of sentences.');

  let tokensAligned = true;
  let phrasesAligned = true;
  contract.sentences.forEach((sentence, sentenceIndex) => {
    let cursor = 0;
    for (const token of sentence.tokens) {
      if (token.start !== cursor || token.end <= token.start || token.end > sentence.text.length) {
        tokensAligned = false;
        errors.push(`Sentence ${sentenceIndex + 1}: token offsets do not cover the sentence exactly.`);
        break;
      }
      const sliced = sentence.text.slice(token.start, token.end);
      if (sliced !== token.surface) {
        tokensAligned = false;
        errors.push(`Sentence ${sentenceIndex + 1}: token surface "${token.surface}" does not match its offset.`);
        break;
      }
      cursor = token.end;
    }
    if (cursor !== sentence.text.length) {
      tokensAligned = false;
      errors.push(`Sentence ${sentenceIndex + 1}: token offsets end before the sentence does.`);
    }

    let phraseCursor = 0;
    for (const phrase of sentence.phrases) {
      if (phrase.start !== phraseCursor || phrase.end <= phrase.start || phrase.end > sentence.tokens.length) {
        phrasesAligned = false;
        errors.push(`Sentence ${sentenceIndex + 1}: phrase spans are invalid or overlapping.`);
        break;
      }
      phraseCursor = phrase.end;
    }
    if (phraseCursor !== sentence.tokens.length) {
      phrasesAligned = false;
      errors.push(`Sentence ${sentenceIndex + 1}: phrases do not cover all tokens.`);
    }
  });

  const tokenKeys = new Set(
    contract.sentences.flatMap((sentence) =>
      sentence.tokens.map((token) => `${token.dictionary}|${token.reading}`),
    ),
  );
  const targetWordsValid = contract.target_words.every(
    (word) => tokenKeys.has(`${word.dictionary}|${word.reading}`),
  );
  if (!targetWordsValid) {
    errors.push('target_words is not a subset of the tokenized story.');
  }

  return { errors, textIntegrity, tokensAligned, phrasesAligned, targetWordsValid };
}

export function tokenHasKanji(token: ReaderToken): boolean {
  return hasKanji(token.surface);
}


/**
 * Models are unreliable at producing exact token offsets even when their prose
 * and glosses are good. Client tokenization is authoritative, so repair the
 * contract by rebuilding token spans from kuromoji and mapping model glosses by
 * character overlap (falling back to lexical matches and the bundled glossary).
 */
export function normalizeContractToClientTokens(
  contract: ContractStory,
  rawSentences: RawTokenizedSentence[],
  lookup: GlossLookup,
): ContractStory {
  if (rawSentences.length !== contract.sentences.length) return contract;

  const sentences: ContractSentence[] = contract.sentences.map((sentence, sentenceIndex) => {
    const raw = rawSentences[sentenceIndex];
    let cursor = 0;
    let searchFrom = 0;
    const modelTokens = sentence.tokens.map((token) => {
      const located = sentence.text.indexOf(token.surface, searchFrom);
      const start = located >= 0 ? located : cursor;
      if (located >= 0) searchFrom = located + token.surface.length;
      cursor = Math.max(cursor, start + token.surface.length);
      return { ...token, start, end: start + token.surface.length };
    });

    const tokens: ContractToken[] = raw.tokens.map((rawToken) => {
      const overlaps = modelTokens.filter(
        (token) => token.start < rawToken.end && token.end > rawToken.start,
      );
      const lexical = modelTokens.filter(
        (token) =>
          token.surface === rawToken.surface ||
          token.dictionary === rawToken.dictionary ||
          token.surface === rawToken.dictionary ||
          token.surface.startsWith(rawToken.surface) ||
          rawToken.surface.startsWith(token.surface) ||
          token.surface.startsWith(rawToken.dictionary) ||
          rawToken.surface.startsWith(token.dictionary),
      );
      const grammatical = rawToken.pos === 'particle' || rawToken.pos === 'auxiliary' || rawToken.pos === 'symbol';
      const sources = grammatical ? [] : overlaps.length ? overlaps : lexical;
      const fallback = lookup(rawToken.surface, rawToken.dictionary, rawToken.reading);
      const glosses = [...new Set(sources.map((token) => token.gloss.trim()).filter(Boolean))];
      const jlpt =
        sources.find((token) => typeof token.jlpt === 'number')?.jlpt ??
        fallback?.jlpt ??
        null;
      return {
        surface: rawToken.surface,
        dictionary: rawToken.dictionary,
        reading: rawToken.reading,
        pos: rawToken.pos,
        gloss: glosses.join('; ') || fallback?.gloss || 'No gloss available',
        jlpt,
        start: rawToken.start,
        end: rawToken.end,
      };
    });

    return {
      text: sentence.text,
      translation_en: sentence.translation_en,
      tokens,
      phrases: tokens.length
        ? [{ start: 0, end: tokens.length, gloss: sentence.translation_en }]
        : [],
    };
  });

  const tokenKeys = new Map<string, number>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      const key = `${token.dictionary}|${token.reading}`;
      tokenKeys.set(key, (tokenKeys.get(key) ?? 0) + 1);
    }
  }
  const targetWords: ContractTargetWord[] = contract.target_words.flatMap((word) => {
    const occurrences = tokenKeys.get(`${word.dictionary}|${word.reading}`) ?? 0;
    return occurrences > 0 ? [{ ...word, occurrences }] : [];
  });

  return {
    ...contract,
    text: sentences.map((sentence) => sentence.text).join(''),
    sentences,
    target_words: targetWords,
  };
}
