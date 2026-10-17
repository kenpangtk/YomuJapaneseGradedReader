const KANJI = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const KANJI_GLOBAL = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu;
const KATAKANA = /[\u30a0-\u30ff\u31f0-\u31ff]/u;

export function hasKanji(text: string): boolean {
  return KANJI.test(text);
}

export function countKanji(text: string): number {
  return [...text.matchAll(KANJI_GLOBAL)].length;
}

export function isKatakanaOnly(text: string): boolean {
  return text.length > 0 && KATAKANA.test(text) && !/[\u3040-\u309f\u3400-\u9fff]/u.test(text);
}

export function katakanaToHiragana(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6) {
        return String.fromCharCode(code - 0x60);
      }
      return char;
    })
    .join('');
}

export function normalizeReading(surface: string, reading: string): string {
  if (!reading || reading === '*') return '';
  if (isKatakanaOnly(surface) && isKatakanaOnly(reading)) return reading;
  return katakanaToHiragana(reading);
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, '').replace(/[、。！？!?「」『』（）()…・,.]/g, '');
}

export function charCount(text: string): number {
  return [...text].length;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sentenceTexts(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function truncate(text: string, length: number): string {
  const chars = [...text];
  return chars.length <= length ? text : `${chars.slice(0, Math.max(0, length - 1)).join('')}…`;
}
