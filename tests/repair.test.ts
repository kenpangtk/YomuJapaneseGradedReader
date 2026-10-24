import { describe, expect, it } from 'vitest';
import type { ContractStory } from '../src/generation/contract';
import { applyRepairPatch, parseRepairResponse } from '../src/generation/contract';
import { buildEditSystemPrompt, buildUserPrompt } from '../src/generation/prompt';
import type { GenerationRequest } from '../src/generation/types';

function story(): ContractStory {
  return {
    title_ja: '公園の猫',
    title_en: 'The Park Cat',
    level: 2,
    summary_en: 'A cat in the park.',
    text: '今日は公園へ行きました。ベンチに白い猫がいました。',
    sentences: [
      {
        text: '今日は公園へ行きました。',
        translation_en: 'Today I went to the park.',
        tokens: [
          {
            surface: '公園',
            dictionary: '公園',
            reading: 'こうえん',
            pos: 'noun',
            gloss: 'park',
            jlpt: 5,
            start: 4,
            end: 6,
          },
        ],
        phrases: [],
      },
      {
        text: 'ベンチに白い猫がいました。',
        translation_en: 'There was a white cat on the bench.',
        tokens: [],
        phrases: [],
      },
    ],
    target_words: [{ dictionary: '公園', reading: 'こうえん', gloss: 'park', occurrences: 1 }],
    grammar_points: ['past tense 〜ました'],
    content_notes: [],
  };
}

describe('repair patches', () => {
  it('replaces only the targeted sentence and leaves the previous story untouched', () => {
    const previous = story();
    const patched = applyRepairPatch(previous, {
      edits: [
        {
          sentence_index: 1,
          old_text: 'ベンチに白い猫がいました。',
          new_text: 'ベンチに白い猫がいました。',
          translation_en: 'A white cat was on the bench.',
          tokens: [
            {
              surface: '猫',
              dictionary: '猫',
              reading: 'ねこ',
              pos: 'noun',
              gloss: 'cat',
              start: 0,
              end: 0,
            },
          ],
        },
      ],
    });

    expect(patched.sentences[0]).toEqual(previous.sentences[0]);
    expect(patched.sentences[1].translation_en).toBe('A white cat was on the bench.');
    expect(patched.sentences[1].tokens[0]?.gloss).toBe('cat');
    expect(patched.text).toBe(previous.text);
    expect(previous.sentences[1].translation_en).toBe('There was a white cat on the bench.');
  });

  it('supports deleting a sentence without shifting later edit targets', () => {
    const previous = story();
    const patched = applyRepairPatch(previous, {
      edits: [
        {
          sentence_index: 0,
          old_text: '今日は公園へ行きました。',
          new_text: '',
        },
        {
          sentence_index: 1,
          old_text: 'ベンチに白い猫がいました。',
          new_text: 'ベンチに猫がいました。',
          translation_en: 'There was a cat on the bench.',
        },
      ],
    });

    expect(patched.sentences).toHaveLength(1);
    expect(patched.sentences[0]?.text).toBe('ベンチに猫がいました。');
    expect(patched.text).toBe('ベンチに猫がいました。');
  });

  it('finds a sentence by old_text when the index is absent', () => {
    const previous = story();
    const patched = applyRepairPatch(previous, {
      edits: [
        {
          old_text: 'ベンチに白い猫がいました。',
          new_text: 'ベンチに黒い猫がいました。',
          translation_en: 'There was a black cat on the bench.',
        },
      ],
    });

    expect(patched.sentences[1]?.text).toBe('ベンチに黒い猫がいました。');
  });

  it('rejects an edit whose target sentence does not exist', () => {
    expect(() =>
      applyRepairPatch(story(), {
        edits: [{ old_text: '存在しない文。', new_text: '別の文。' }],
      }),
    ).toThrow(/Edit target not found/);
  });

  it('accepts a full contract as a fallback repair response', () => {
    const previous = story();
    const parsed = parseRepairResponse(previous, previous);
    expect(parsed.text).toBe(previous.text);
    expect(parsed.sentences).toHaveLength(2);
  });

  it('asks the model to edit rather than rewrite on repair attempts', () => {
    const request: GenerationRequest = {
      language: 'ja',
      level: 2,
      newWordCap: 5,
      lengthPreference: 'short',
      targetChars: { min: 300, max: 600, target: 450 },
      topic: 'daily life',
      interests: [],
      seed: 1,
      reviewWords: [],
      knownWords: [],
      grammar: ['basic particles'],
      style: 'warm',
      recentTitles: [],
      recentStoryIds: [],
      repairNotes: ['Length is 200 characters; expected 210–780 for short.'],
      previousStory: {
        title_ja: '公園の猫',
        title_en: 'The Park Cat',
        summary_en: 'A cat in the park.',
        sentences: [
          { text: '今日は公園へ行きました。', translation_en: 'Today I went to the park.' },
        ],
      },
    };

    const prompt = buildUserPrompt(request);
    expect(prompt).toContain('EDIT the previous story');
    expect(prompt).toContain('VALIDATION ERRORS TO FIX');
    expect(prompt).toContain('今日は公園へ行きました。');
    expect(prompt).not.toContain('Rewrite the whole story');
    expect(buildEditSystemPrompt()).toContain('"edits"');
  });
});
