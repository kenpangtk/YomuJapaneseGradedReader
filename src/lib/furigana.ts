import type { FuriganaSegment } from '../types';

const KANJI_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005]/u;

function isKanji(char: string): boolean {
  return KANJI_CHAR.test(char);
}

interface CharGroup {
  text: string;
  kanji: boolean;
}

function groupCharacters(surface: string): CharGroup[] {
  const groups: CharGroup[] = [];
  for (const char of [...surface]) {
    const kanji = isKanji(char);
    const last = groups[groups.length - 1];
    if (last && last.kanji === kanji) {
      last.text += char;
    } else {
      groups.push({ text: char, kanji });
    }
  }
  return groups;
}

/**
 * Splits a token into plain/ruby segments. Only kanji runs are annotated;
 * okurigana and other kana stay outside the ruby annotation.
 */
export function buildFurigana(surface: string, reading: string): FuriganaSegment[] {
  if (!surface || !reading || ![...surface].some(isKanji)) {
    return [{ text: surface }];
  }

  const groups = groupCharacters(surface);
  const segments: FuriganaSegment[] = [];
  let readingPosition = 0;
  let aligned = true;

  groups.forEach((group, index) => {
    if (!group.kanji) {
      const found = reading.indexOf(group.text, readingPosition);
      if (found === -1) {
        aligned = false;
        segments.push({ text: group.text });
        return;
      }
      readingPosition = found + group.text.length;
      segments.push({ text: group.text });
      return;
    }

    const next = groups[index + 1];
    let end: number;
    if (next && !next.kanji) {
      const found = reading.indexOf(next.text, readingPosition);
      if (found === -1) {
        end = readingPosition;
        aligned = false;
      } else {
        end = found;
      }
    } else {
      end = reading.length;
    }

    const ruby = reading.slice(readingPosition, end);
    readingPosition = Math.max(readingPosition, end);
    segments.push(ruby ? { text: group.text, ruby } : { text: group.text });
  });

  if (!aligned || !segments.some((segment) => segment.ruby)) {
    const firstKanji = groups.findIndex((group) => group.kanji);
    if (firstKanji !== -1) {
      segments.length = 0;
      groups.forEach((group, index) => {
        if (index === firstKanji) {
          segments.push({ text: group.text, ruby: reading });
        } else {
          segments.push({ text: group.text });
        }
      });
    }
  }

  return segments;
}

/**
 * Chinese pinyin ruby is word-level: a token containing hanzi gets its whole
 * tone-marked pinyin reading as ruby. Non-hanzi tokens stay plain text.
 */
export function buildPinyinFurigana(surface: string, reading: string): FuriganaSegment[] {
  if (!surface || !reading || ![...surface].some(isKanji)) {
    return [{ text: surface }];
  }
  return [{ text: surface, ruby: reading }];
}

export function plainTextFromSegments(segments: FuriganaSegment[]): string {
  return segments.map((segment) => segment.text).join('');
}

export function rubyPreview(segments: FuriganaSegment[]): string {
  return segments
    .map((segment) => (segment.ruby ? `${segment.text}（${segment.ruby}）` : segment.text))
    .join('');
}
