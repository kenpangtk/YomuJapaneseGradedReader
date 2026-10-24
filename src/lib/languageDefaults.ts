import type { Language, LanguageState, Profile } from '../types';

export function defaultLanguageState(language: Language): LanguageState {
  return language === 'zh'
    ? {
        level: 1,
        hardness: 0,
        newWordCap: 3,
        consecutiveHard: 0,
        consecutiveEasy: 0,
        furiganaMode: 'always',
      }
    : {
        level: 2,
        hardness: 0,
        newWordCap: 5,
        consecutiveHard: 0,
        consecutiveEasy: 0,
        furiganaMode: 'always',
      };
}

export function languageStateFromProfile(profile: Profile): LanguageState {
  return {
    level: profile.level,
    hardness: profile.hardness,
    newWordCap: profile.newWordCap,
    consecutiveHard: profile.consecutiveHard,
    consecutiveEasy: profile.consecutiveEasy,
    furiganaMode: profile.furiganaMode,
  };
}

export function normalizeSavedLevels(profile: Partial<Profile>): Record<Language, LanguageState> {
  return {
    ja:
      profile.savedLevels?.ja ??
      {
        level: profile.level ?? 2,
        hardness: profile.hardness ?? 0,
        newWordCap: profile.newWordCap ?? 5,
        consecutiveHard: profile.consecutiveHard ?? 0,
        consecutiveEasy: profile.consecutiveEasy ?? 0,
        furiganaMode: profile.furiganaMode ?? 'always',
      },
    zh: profile.savedLevels?.zh ?? defaultLanguageState('zh'),
  };
}

export function levelSystemLabel(language: Language): 'JLPT' | 'HSK' {
  return language === 'zh' ? 'HSK' : 'JLPT';
}

export function pronunciationLabel(language: Language): 'Furigana' | 'Pinyin' {
  return language === 'zh' ? 'Pinyin' : 'Furigana';
}

export function readingFieldLabel(language: Language): 'Reading' | 'Pinyin' {
  return language === 'zh' ? 'Pinyin' : 'Reading';
}
