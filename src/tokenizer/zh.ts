import { pinyin } from 'pinyin-pro';
import { lookupGlossFor } from '../content/glossary';
import { ZH_FUNCTION_WORDS, ZH_GLOSSARY } from '../content/zh/levelLists';
import type { RawToken, RawTokenizedSentence } from './protocol';

const HANZI_ANY = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const KNOWN_WORDS = [
  ...new Set([...Object.keys(ZH_GLOSSARY), ...ZH_FUNCTION_WORDS]),
].sort((left, right) => right.length - left.length);

const READING_OVERRIDES: Record<string, string> = {
  了: 'le',
  的: 'de',
  地: 'de',
  得: 'de',
  着: 'zhe',
  过: 'guo',
  吗: 'ma',
  呢: 'ne',
  吧: 'ba',
  啊: 'a',
  呀: 'ya',
  哦: 'o',
  嗯: 'ng',
  个: 'gè',
  还: 'hái',
  都: 'dōu',
  和: 'hé',
  在: 'zài',
  会: 'huì',
  能: 'néng',
  要: 'yào',
  想: 'xiǎng',
  可以: 'kěyǐ',
  应该: 'yīnggāi',
  必须: 'bìxū',
  是: 'shì',
  不: 'bù',
  没: 'méi',
  很: 'hěn',
  太: 'tài',
  也: 'yě',
  就: 'jiù',
  才: 'cái',
  再: 'zài',
  又: 'yòu',
  已经: 'yǐjīng',
  正在: 'zhèngzài',
  我: 'wǒ',
  你: 'nǐ',
  他: 'tā',
  她: 'tā',
  这: 'zhè',
  那: 'nà',
  哪: 'nǎ',
  什么: 'shénme',
  谁: 'shéi',
  怎么: 'zěnme',
  为什么: 'wèishénme',
  一: 'yī',
  二: 'èr',
  三: 'sān',
  四: 'sì',
  五: 'wǔ',
  六: 'liù',
  七: 'qī',
  八: 'bā',
  九: 'jiǔ',
  十: 'shí',
};

interface ChineseSegment {
  text: string;
  start: number;
  end: number;
  wordLike: boolean;
}

function splitKnownSegment(text: string): string[] | null {
  if (text.length <= 1 || ZH_GLOSSARY[text] || ZH_FUNCTION_WORDS.has(text)) return null;
  const parts: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    const match = KNOWN_WORDS.find((word) => word.length > 0 && text.startsWith(word, offset));
    if (!match) return null;
    parts.push(match);
    offset += match.length;
  }
  return parts.length > 1 ? parts : null;
}

function expandSegment(segment: ChineseSegment): ChineseSegment[] {
  if (!segment.wordLike) return [segment];
  const parts = splitKnownSegment(segment.text);
  if (!parts) return [segment];
  const expanded: ChineseSegment[] = [];
  let offset = segment.start;
  for (const part of parts) {
    expanded.push({
      text: part,
      start: offset,
      end: offset + part.length,
      wordLike: true,
    });
    offset += part.length;
  }
  return expanded;
}

function readingFor(surface: string): string {
  if (READING_OVERRIDES[surface]) return READING_OVERRIDES[surface];
  if (!HANZI_ANY.test(surface)) return surface;
  return pinyin(surface, { toneType: 'symbol' }).replace(/\s+/gu, '');
}

function tokenFor(surface: string, start: number, end: number, wordLike: boolean): RawToken {
  const isSymbol = !wordLike || !WORD_CHAR.test(surface);
  const gloss = isSymbol ? undefined : lookupGlossFor('zh', surface, surface, '');
  const pos = isSymbol ? 'symbol' : gloss?.pos ?? ZH_GLOSSARY[surface]?.pos ?? 'word';
  return {
    surface,
    dictionary: surface,
    reading: isSymbol ? surface : readingFor(surface),
    pos,
    posDetail: '',
    properNoun: false,
    start,
    end,
  };
}

function segmentByCharacter(text: string): ChineseSegment[] {
  const segments: ChineseSegment[] = [];
  let offset = 0;
  for (const char of text) {
    const end = offset + char.length;
    segments.push({ text: char, start: offset, end, wordLike: WORD_CHAR.test(char) });
    offset = end;
  }
  return segments;
}

function segmentText(text: string): ChineseSegment[] {
  if (typeof Intl.Segmenter !== 'function') return segmentByCharacter(text);
  try {
    const segmenter = new Intl.Segmenter('zh-Hans', { granularity: 'word' });
    return [...segmenter.segment(text)]
      .map((part) => ({
        text: part.segment,
        start: part.index,
        end: part.index + part.segment.length,
        wordLike: part.isWordLike !== false,
      }))
      .flatMap(expandSegment);
  } catch {
    return segmentByCharacter(text);
  }
}

export function tokenizeChineseSentence(text: string): RawToken[] {
  return segmentText(text).map((segment) =>
    tokenFor(segment.text, segment.start, segment.end, segment.wordLike),
  );
}

export function tokenizeChineseSentences(sentences: string[]): RawTokenizedSentence[] {
  return sentences.map((text) => ({ text, tokens: tokenizeChineseSentence(text) }));
}
