import { describe, expect, it } from 'vitest';
import { tokenizeChineseSentence, tokenizeChineseSentences } from '../src/tokenizer/zh';
import { buildPinyinFurigana, plainTextFromSegments } from '../src/lib/furigana';
import { alignSentence, type GlossLookup } from '../src/lib/alignment';
import { analyzeCoverage } from '../src/lib/coverage';
import type { ContractSentence } from '../src/generation/contract';
import type { ReaderSentence, ReaderToken } from '../src/types';

describe('Chinese tokenizer', () => {
  it('segments Simplified Chinese words with tone-marked pinyin and exact offsets', () => {
    const [sentence] = tokenizeChineseSentences(['我今天去公园。']);
    expect(sentence.text).toBe('我今天去公园。');
    expect(sentence.tokens.map((token) => token.surface)).toEqual(['我', '今天', '去', '公园', '。']);
    expect(sentence.tokens.map((token) => token.reading)).toEqual([
      'wǒ',
      'jīntiān',
      'qù',
      'gōngyuán',
      '。',
    ]);

    let cursor = 0;
    for (const token of sentence.tokens) {
      expect(token.start).toBe(cursor);
      expect(token.end).toBe(cursor + token.surface.length);
      expect(sentence.text.slice(token.start, token.end)).toBe(token.surface);
      expect(token.dictionary).toBe(token.surface);
      expect(token.properNoun).toBe(false);
      cursor = token.end;
    }
    expect(cursor).toBe(sentence.text.length);
  });

  it('tags punctuation as symbols without pinyin and uses glossary parts of speech', () => {
    const tokens = tokenizeChineseSentence('我很好。');
    const pronoun = tokens.find((token) => token.surface === '我');
    const symbol = tokens.find((token) => token.surface === '。');
    expect(pronoun?.pos).toBe('pronoun');
    expect(symbol?.pos).toBe('symbol');
    expect(symbol?.reading).toBe('。');
  });

  it('falls back to "word" for unlisted hanzi', () => {
    const tokens = tokenizeChineseSentence('超市');
    expect(tokens.every((token) => token.pos === 'word')).toBe(true);
    expect(tokens.map((token) => token.reading).join('')).toBe('chāoshì');
  });
});

describe('Chinese pinyin ruby', () => {
  it('annotates hanzi with the whole reading', () => {
    expect(buildPinyinFurigana('公园', 'gōngyuán')).toEqual([{ text: '公园', ruby: 'gōngyuán' }]);
  });

  it('leaves non-hanzi and missing readings as plain text', () => {
    expect(buildPinyinFurigana('。', '。')).toEqual([{ text: '。' }]);
    expect(buildPinyinFurigana('Hello', 'Hello')).toEqual([{ text: 'Hello' }]);
    expect(buildPinyinFurigana('公园', '')).toEqual([{ text: '公园' }]);
  });

  it('preserves plain text when serialized from segments', () => {
    const segments = buildPinyinFurigana('我今天去公园。', 'wǒ jīntiān qù gōngyuán');
    expect(plainTextFromSegments(segments)).toBe('我今天去公园。');
    expect(segments[0]).toEqual({ text: '我今天去公园。', ruby: 'wǒ jīntiān qù gōngyuán' });
  });
});

describe('Chinese alignment', () => {
  it('uses pinyin ruby when aligning a Chinese sentence', () => {
    const raw = {
      text: '我去公园。',
      tokens: tokenizeChineseSentence('我去公园。'),
    };
    const contract: ContractSentence = {
      text: raw.text,
      translation_en: 'I went to the park.',
      tokens: [],
      phrases: [],
    };
    const lookup: GlossLookup = () => undefined;
    const aligned = alignSentence(contract, raw, lookup, 'zh');
    const park = aligned.tokens.find((token) => token.surface === '公园');
    expect(park?.furigana).toEqual([{ text: '公园', ruby: 'gōngyuán' }]);
    expect(aligned.tokens.find((token) => token.surface === '。')?.furigana).toEqual([
      { text: '。' },
    ]);
  });
});

function readerToken(
  surface: string,
  reading: string,
  pos: string,
  jlpt: number | null,
  start: number,
): ReaderToken {
  return {
    surface,
    dictionary: surface,
    reading,
    pos,
    posDetail: '',
    properNoun: false,
    jlpt,
    gloss: 'gloss',
    start,
    end: start + surface.length,
    furigana: [],
  };
}

function sentenceWithTokens(text: string, tokens: ReaderToken[]): ReaderSentence {
  return { text, translationEn: '', tokens, phrases: [] };
}

describe('Chinese coverage', () => {
  it('counts function words and glossary HSK tags as known', () => {
    const tokens = [
      readerToken('我', 'wǒ', 'pronoun', 1, 0),
      readerToken('很', 'hěn', 'adverb', 1, 1),
      readerToken('好', 'hǎo', 'adjective', 1, 2),
      readerToken('呀', 'ya', 'particle', null, 3),
      readerToken('。', '。', 'symbol', null, 4),
    ];
    const report = analyzeCoverage(
      [sentenceWithTokens('我很好呀。', tokens)],
      1,
      [],
      [],
      'zh',
    );
    expect(report.countedTokens).toBe(4);
    expect(report.rawCoverage).toBe(1);
    expect(report.adjustedCoverage).toBe(1);
    expect(report.newWords).toEqual([]);
  });

  it('uses HSK scores and skips the kanji out-of-level path', () => {
    const tokens = [
      readerToken('发现', 'fāxiàn', 'verb', 3, 0),
      readerToken('超市', 'chāoshì', 'word', null, 2),
    ];
    const report = analyzeCoverage(
      [sentenceWithTokens('发现超市', tokens)],
      1,
      [],
      [],
      'zh',
    );
    expect(report.countedTokens).toBe(2);
    expect(report.rawCoverage).toBe(0);
    expect(report.newWords).toEqual(['发现', '超市']);
    expect(report.kanjiTokens).toBe(0);
    expect(report.outOfLevelKanjiTokens).toBe(0);
    expect(report.kanjiOutOfLevelPct).toBe(0);
    expect(report.missingFurigana).toEqual([]);
  });
});
