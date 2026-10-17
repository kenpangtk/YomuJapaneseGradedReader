import { describe, expect, it } from 'vitest';
import {
  alignSentence,
  normalizeContractToClientTokens,
  validateContractAlignment,
  type GlossLookup,
} from '../src/lib/alignment';
import type { ContractSentence, ContractStory } from '../src/generation/contract';
import type { RawTokenizedSentence } from '../src/tokenizer/protocol';

const sentenceText = '今日は公園へ行きました。';

const contractSentence: ContractSentence = {
  text: sentenceText,
  translation_en: 'Today I went to the park.',
  tokens: [
    { surface: '今日', dictionary: '今日', reading: 'きょう', pos: 'noun', gloss: 'today', jlpt: 5, start: 0, end: 2 },
    { surface: 'は', dictionary: 'は', reading: 'は', pos: 'particle', gloss: 'topic marker', jlpt: 5, start: 2, end: 3 },
    { surface: '公園', dictionary: '公園', reading: 'こうえん', pos: 'noun', gloss: 'park', jlpt: 5, start: 3, end: 5 },
    { surface: 'へ', dictionary: 'へ', reading: 'へ', pos: 'particle', gloss: 'toward', jlpt: 5, start: 5, end: 6 },
    { surface: '行き', dictionary: '行く', reading: 'いき', pos: 'verb', gloss: 'went', jlpt: 5, start: 6, end: 8 },
    { surface: 'まし', dictionary: 'ます', reading: 'まし', pos: 'auxiliary', gloss: 'polite past', jlpt: 5, start: 8, end: 10 },
    { surface: 'た', dictionary: 'た', reading: 'た', pos: 'auxiliary', gloss: 'past', jlpt: 5, start: 10, end: 11 },
    { surface: '。', dictionary: '。', reading: '。', pos: 'symbol', gloss: 'period', jlpt: 5, start: 11, end: 12 },
  ],
  phrases: [
    { start: 0, end: 3, gloss: 'as for today' },
    { start: 3, end: 4, gloss: 'to the park' },
    { start: 4, end: 8, gloss: 'went' },
  ],
};

const contractStory: ContractStory = {
  title_ja: '公園',
  title_en: 'The Park',
  level: 1,
  summary_en: 'A short walk.',
  text: sentenceText,
  sentences: [contractSentence],
  target_words: [{ dictionary: '公園', reading: 'こうえん', gloss: 'park', occurrences: 1 }],
  grammar_points: ['past tense'],
  content_notes: [],
};

const raw: RawTokenizedSentence = {
  text: sentenceText,
  tokens: [
    { surface: '今日', dictionary: '今日', reading: 'きょう', pos: 'noun', posDetail: '副詞可能', properNoun: false, start: 0, end: 2 },
    { surface: 'は', dictionary: 'は', reading: 'は', pos: 'particle', posDetail: '係助詞', properNoun: false, start: 2, end: 3 },
    { surface: '公園', dictionary: '公園', reading: 'こうえん', pos: 'noun', posDetail: '一般', properNoun: false, start: 3, end: 5 },
    { surface: 'へ', dictionary: 'へ', reading: 'へ', pos: 'particle', posDetail: '格助詞', properNoun: false, start: 5, end: 6 },
    { surface: '行き', dictionary: '行く', reading: 'いき', pos: 'verb', posDetail: '自立', properNoun: false, start: 6, end: 8 },
    { surface: 'まし', dictionary: 'ます', reading: 'まし', pos: 'auxiliary', posDetail: '*', properNoun: false, start: 8, end: 10 },
    { surface: 'た', dictionary: 'た', reading: 'た', pos: 'auxiliary', posDetail: '*', properNoun: false, start: 10, end: 11 },
    { surface: '。', dictionary: '。', reading: '。', pos: 'symbol', posDetail: '句点', properNoun: false, start: 11, end: 12 },
  ],
};

const lookup = ((surface: string, dictionary: string, reading: string) => {
  if (dictionary === '公園' && reading === 'こうえん') return { gloss: 'park', jlpt: 5 };
  if (surface === '今日') return { gloss: 'today', jlpt: 5 };
  return undefined;
}) as GlossLookup;

describe('contract alignment', () => {
  it('accepts exact sentence, token, and phrase coverage', () => {
    const report = validateContractAlignment(contractStory);
    expect(report.errors).toEqual([]);
    expect(report.textIntegrity).toBe(true);
    expect(report.tokensAligned).toBe(true);
    expect(report.phrasesAligned).toBe(true);
    expect(report.targetWordsValid).toBe(true);
  });

  it('rejects a token offset gap', () => {
    const broken: ContractStory = {
      ...contractStory,
      sentences: [
        {
          ...contractSentence,
          tokens: contractSentence.tokens.map((token) =>
            token.surface === '公園' ? { ...token, start: 4, end: 6 } : token,
          ),
        },
      ],
    };
    const report = validateContractAlignment(broken);
    expect(report.tokensAligned).toBe(false);
    expect(report.errors.join(' ')).toContain('offsets');
  });

  it('rejects text that is not the concatenation of sentences', () => {
    const broken = { ...contractStory, text: `${sentenceText}余分` };
    const report = validateContractAlignment(broken);
    expect(report.textIntegrity).toBe(false);
  });

  it('repairs broken model offsets by rebuilding tokens from the client tokenizer', () => {
    const broken: ContractStory = {
      ...contractStory,
      sentences: [
        {
          ...contractSentence,
          tokens: contractSentence.tokens.map((token) => ({ ...token, start: 0, end: 1 })),
          phrases: [{ start: 0, end: 99, gloss: 'broken' }],
        },
      ],
    };
    const normalized = normalizeContractToClientTokens(broken, [raw], lookup);
    const report = validateContractAlignment(normalized);
    expect(report.errors).toEqual([]);
    expect(normalized.sentences[0].tokens).toHaveLength(raw.tokens.length);
    expect(normalized.sentences[0].tokens[2].surface).toBe('公園');
    expect(normalized.sentences[0].tokens[2].gloss).toBe('park');
    expect(normalized.sentences[0].phrases).toEqual([
      { start: 0, end: raw.tokens.length, gloss: 'Today I went to the park.' },
    ]);
    expect(normalized.target_words[0].occurrences).toBe(1);
  });

  it('normalizes compact content-word gloss lists without corrupting particle glosses', () => {
    const compact: ContractStory = {
      ...contractStory,
      sentences: [
        {
          ...contractSentence,
          tokens: [
            { surface: '今日', dictionary: '今日', reading: 'きょう', pos: 'noun', gloss: 'today', jlpt: 5, start: 0, end: 0 },
            { surface: '公園', dictionary: '公園', reading: 'こうえん', pos: 'noun', gloss: 'park', jlpt: 5, start: 0, end: 0 },
            { surface: '行きました', dictionary: '行く', reading: 'いきました', pos: 'verb', gloss: 'went', jlpt: 5, start: 0, end: 0 },
          ],
          phrases: [],
        },
      ],
    };
    const normalized = normalizeContractToClientTokens(compact, [raw], lookup);
    const aligned = alignSentence(normalized.sentences[0], raw, lookup);
    expect(aligned.tokens[0].gloss).toBe('today');
    expect(aligned.tokens[1].gloss).not.toBe('park');
    expect(aligned.tokens[2].gloss).toBe('park');
    expect(aligned.tokens[4].gloss).toBe('went');
    expect(normalized.sentences[0].phrases).toHaveLength(1);
  });

  it('uses client tokenizer data for tokens and contract data for glosses', () => {
    const aligned = alignSentence(contractSentence, raw, lookup);
    expect(aligned.tokens).toHaveLength(8);
    expect(aligned.tokens[2].surface).toBe('公園');
    expect(aligned.tokens[2].reading).toBe('こうえん');
    expect(aligned.tokens[2].gloss).toBe('park');
    expect(aligned.tokens[2].furigana).toEqual([{ text: '公園', ruby: 'こうえん' }]);
    expect(aligned.phrases[0].start).toBe(0);
    expect(aligned.phrases[0].end).toBeGreaterThan(0);
    expect(aligned.phrases[aligned.phrases.length - 1].end).toBe(8);
  });
});
