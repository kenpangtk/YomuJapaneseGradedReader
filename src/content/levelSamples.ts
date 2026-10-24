import { LEVEL_SAMPLES } from './levelLists';
import { ZH_LEVEL_SAMPLES } from './zh/levelLists';
import type { Language } from '../types';

export interface LevelSample {
  level: number;
  code: string;
  label: string;
  text: string;
  ruby?: string;
  pinyin?: string;
  english: string;
}

const JA_LABELS = ['Beginner', 'Elementary', 'Intermediate', 'Advanced', 'Fluent'];

const JA_LEVEL_SAMPLES: LevelSample[] = LEVEL_SAMPLES.map((sample) => ({
  level: sample.level,
  code: `N${6 - sample.level}`,
  label: JA_LABELS[sample.level - 1] ?? 'Intermediate',
  text: sample.sampleJa,
  ruby: sample.sampleRuby,
  english: sample.sampleEn,
}));

export function levelSamples(language: Language): LevelSample[] {
  return language === 'zh' ? ZH_LEVEL_SAMPLES : JA_LEVEL_SAMPLES;
}

export { JA_LEVEL_SAMPLES };
