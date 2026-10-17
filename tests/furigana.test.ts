import { describe, expect, it } from 'vitest';
import { buildFurigana, plainTextFromSegments, rubyPreview } from '../src/lib/furigana';

describe('furigana segmentation', () => {
  it('keeps okurigana outside the ruby annotation', () => {
    expect(buildFurigana('食べました', 'たべました')).toEqual([
      { text: '食', ruby: 'た' },
      { text: 'べました' },
    ]);
  });

  it('handles leading kana and a kanji run', () => {
    expect(buildFurigana('お茶', 'おちゃ')).toEqual([
      { text: 'お' },
      { text: '茶', ruby: 'ちゃ' },
    ]);
  });

  it('aligns kanji runs around internal kana', () => {
    expect(buildFurigana('買い物', 'かいもの')).toEqual([
      { text: '買', ruby: 'か' },
      { text: 'い' },
      { text: '物', ruby: 'もの' },
    ]);
  });

  it('annotates only kanji, never kana-only tokens', () => {
    expect(buildFurigana('ゆっくり', 'ゆっくり')).toEqual([{ text: 'ゆっくり' }]);
    expect(buildFurigana('。', '。')).toEqual([{ text: '。' }]);
  });

  it('round-trips plain text and produces a readable preview', () => {
    const segments = buildFurigana('今日は公園へ行きました', 'きょうはこうえんへいきました');
    expect(plainTextFromSegments(segments)).toBe('今日は公園へ行きました');
    expect(rubyPreview(segments)).toContain('今日（きょう）');
    expect(rubyPreview(segments)).toContain('公園（こうえん）');
  });

  it('does not annotate trailing punctuation', () => {
    const segments = buildFurigana('猫がいました。', 'ねこがいました。');
    expect(segments).toEqual([
      { text: '猫', ruby: 'ねこ' },
      { text: 'がいました。' },
    ]);
  });
});
