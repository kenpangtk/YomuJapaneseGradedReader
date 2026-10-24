import type { FuriganaMode, Language, StoryLength } from '../types';

export interface LevelBand {
  code: string;
  sub: 'lower' | 'mid' | 'upper';
  label: string;
  min: number;
  max: number;
  charMin: number;
  charMax: number;
  newWordCapBase: number;
  lookupBaseline: number;
  grammar: string[];
}

const JA_BANDS: Omit<LevelBand, 'sub' | 'label'>[] = [
  {
    code: 'N5',
    min: 1,
    max: 1.99,
    charMin: 150,
    charMax: 300,
    newWordCapBase: 4,
    lookupBaseline: 8,
    grammar: ['です/ます', 'basic particles', 'past tense', 'て-form', 'common daily vocabulary'],
  },
  {
    code: 'N4',
    min: 2,
    max: 2.99,
    charMin: 300,
    charMax: 600,
    newWordCapBase: 5,
    lookupBaseline: 6,
    grammar: ['potential', 'volitional', 'basic conditionals', 'common connectors', 'everyday topics'],
  },
  {
    code: 'N3',
    min: 3,
    max: 3.99,
    charMin: 600,
    charMax: 1000,
    newWordCapBase: 7,
    lookupBaseline: 4,
    grammar: ['passive', 'causative', 'keigo basics', 'nuanced conjunctions', 'abstract topics'],
  },
  {
    code: 'N2',
    min: 4,
    max: 4.99,
    charMin: 1000,
    charMax: 1600,
    newWordCapBase: 9,
    lookupBaseline: 2.5,
    grammar: ['complex clauses', 'formal register', 'idioms', 'news-adjacent topics'],
  },
  {
    code: 'N1',
    min: 5,
    max: 5,
    charMin: 1600,
    charMax: 2500,
    newWordCapBase: 12,
    lookupBaseline: 1.5,
    grammar: ['literary styles', 'formal styles', 'rare kanji', 'nuanced register'],
  },
];

const ZH_BANDS: Omit<LevelBand, 'sub' | 'label'>[] = [
  {
    code: 'HSK1',
    min: 1,
    max: 1.799,
    charMin: 80,
    charMax: 200,
    newWordCapBase: 4,
    lookupBaseline: 8,
    grammar: ['basic SVO word order', '是 sentences', 'questions with 吗', '了 for completed actions', 'measure words', 'common greetings'],
  },
  {
    code: 'HSK2',
    min: 1.8,
    max: 2.599,
    charMin: 120,
    charMax: 280,
    newWordCapBase: 6,
    lookupBaseline: 6,
    grammar: ['过 for experience', '在/正在 for ongoing actions', '得 complements', '因为…所以…', '比 comparisons', 'basic result complements'],
  },
  {
    code: 'HSK3',
    min: 2.6,
    max: 3.399,
    charMin: 180,
    charMax: 380,
    newWordCapBase: 8,
    lookupBaseline: 4,
    grammar: ['把 sentences', '被 sentences', '越来越', '一边…一边…', '除了…以外', 'topic-comment structures'],
  },
  {
    code: 'HSK4',
    min: 3.4,
    max: 4.199,
    charMin: 240,
    charMax: 500,
    newWordCapBase: 10,
    lookupBaseline: 2.8,
    grammar: ['虽然…但是…', '不仅…而且…', '无论…都…', '即使…也…', 'cause-effect connectors', 'formal connectors'],
  },
  {
    code: 'HSK5',
    min: 4.2,
    max: 4.799,
    charMin: 320,
    charMax: 650,
    newWordCapBase: 12,
    lookupBaseline: 1.8,
    grammar: ['complex complements', 'passive and causative nuance', 'idiomatic connectors', 'formal written register', 'rhetorical questions'],
  },
  {
    code: 'HSK6',
    min: 4.8,
    max: 5,
    charMin: 400,
    charMax: 800,
    newWordCapBase: 14,
    lookupBaseline: 1.2,
    grammar: ['literary and formal structures', 'idioms (成语)', 'nuanced concession', 'parallel structures', 'advanced discourse markers'],
  },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampLevel(level: number): number {
  return Math.round(clamp(level, 1, 5) * 1000) / 1000;
}

export function bandsFor(language: Language): Omit<LevelBand, 'sub' | 'label'>[] {
  return language === 'zh' ? ZH_BANDS : JA_BANDS;
}

export function bandForLevel(level: number, language: Language = 'ja'): LevelBand {
  const bands = bandsFor(language);
  const safe = clamp(level, 1, 5);
  const band = bands.find((candidate) => safe < candidate.max + 0.001) ?? bands[bands.length - 1];
  const span = band.max - band.min;
  const fraction = span === 0 ? 0 : (safe - band.min) / span;
  const sub = fraction < 0.34 ? 'lower' : fraction < 0.67 ? 'mid' : 'upper';
  return {
    ...band,
    sub,
    label: `${band.code} ${sub}`,
  };
}

export function bandCode(level: number, language: Language = 'ja'): string {
  return bandForLevel(level, language).code;
}

export function bandNumber(level: number, language: Language = 'ja'): number {
  return bandsFor(language).findIndex((band) => band.code === bandCode(level, language)) + 1;
}

export function levelTagToScore(tag: number | null | undefined, language: Language = 'ja'): number | null {
  if (!tag || tag < 1) return null;
  if (language === 'zh') {
    if (tag > 6) return null;
    return 1 + (tag - 1) * 0.8;
  }
  if (tag > 5) return null;
  return 6 - tag;
}

export function jlptToScore(jlpt: number | null | undefined): number | null {
  return levelTagToScore(jlpt, 'ja');
}

export function isAboveLevel(
  tag: number | null | undefined,
  level: number,
  language: Language = 'ja',
): boolean {
  const score = levelTagToScore(tag, language);
  return score !== null && score > level + 0.45;
}

export function lengthRange(
  level: number,
  preference: StoryLength,
  language: Language = 'ja',
): { min: number; max: number; target: number } {
  const band = bandForLevel(level, language);
  const span = band.charMax - band.charMin;
  let min = band.charMin;
  let max = band.charMax;
  if (preference === 'short') {
    max = Math.round(band.charMin + span * 0.58);
  } else if (preference === 'medium') {
    min = Math.round(band.charMin + span * 0.3);
    max = Math.round(band.charMin + span * 0.83);
  } else {
    min = Math.round(band.charMin + span * 0.58);
  }
  return { min, max, target: Math.round((min + max) / 2) };
}

export function baseNewWordCap(level: number, language: Language = 'ja'): number {
  return bandForLevel(level, language).newWordCapBase;
}

export function lookupBaseline(level: number, language: Language = 'ja'): number {
  if (language === 'zh') return bandForLevel(level, 'zh').lookupBaseline;
  const safe = clamp(level, 1, 5);
  const points = [
    { level: 1, value: 8 },
    { level: 2, value: 6 },
    { level: 3, value: 4 },
    { level: 4, value: 2.5 },
    { level: 5, value: 1.5 },
  ];
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (safe <= right.level) {
      const t = (safe - left.level) / (right.level - left.level);
      return left.value + (right.value - left.value) * t;
    }
  }
  return 1.5;
}

export function defaultFuriganaForLevel(level: number, language: Language = 'ja'): FuriganaMode {
  if (language === 'zh') {
    if (level < 2.6) return 'always';
    if (level < 4.2) return 'learn';
    return 'off';
  }
  if (level < 3) return 'always';
  if (level < 4) return 'learn';
  return 'off';
}

export function allowedGrammar(level: number, language: Language = 'ja'): string[] {
  return bandForLevel(level, language).grammar;
}

export function levelSummary(level: number, language: Language = 'ja'): string {
  const band = bandForLevel(level, language);
  return `${band.code} · ${band.sub}`;
}
