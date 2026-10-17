import type { FuriganaMode, StoryLength } from '../types';

export interface LevelBand {
  code: 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
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

const BANDS: Omit<LevelBand, 'sub' | 'label'>[] = [
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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampLevel(level: number): number {
  return Math.round(clamp(level, 1, 5) * 1000) / 1000;
}

export function bandForLevel(level: number): LevelBand {
  const safe = clamp(level, 1, 5);
  const band = BANDS.find((candidate) => safe < candidate.max + 0.001) ?? BANDS[BANDS.length - 1];
  const span = band.max - band.min;
  const fraction = span === 0 ? 0 : (safe - band.min) / span;
  const sub = fraction < 0.34 ? 'lower' : fraction < 0.67 ? 'mid' : 'upper';
  return {
    ...band,
    sub,
    label: `${band.code} ${sub}`,
  };
}

export function bandCode(level: number): string {
  return bandForLevel(level).code;
}

export function jlptToScore(jlpt: number | null | undefined): number | null {
  if (!jlpt || jlpt < 1 || jlpt > 5) return null;
  return 6 - jlpt;
}

export function isAboveLevel(jlpt: number | null | undefined, level: number): boolean {
  const score = jlptToScore(jlpt);
  return score !== null && score > level + 0.45;
}

export function lengthRange(level: number, preference: StoryLength): { min: number; max: number; target: number } {
  const band = bandForLevel(level);
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

export function baseNewWordCap(level: number): number {
  return bandForLevel(level).newWordCapBase;
}

export function lookupBaseline(level: number): number {
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

export function defaultFuriganaForLevel(level: number): FuriganaMode {
  if (level < 3) return 'always';
  if (level < 4) return 'learn';
  return 'off';
}

export function allowedGrammar(level: number): string[] {
  const band = bandForLevel(level);
  return band.grammar;
}

export function levelSummary(level: number): string {
  const band = bandForLevel(level);
  return `${band.code} · ${band.sub}`;
}
