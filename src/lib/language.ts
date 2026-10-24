import { ensureProfile, patchProfile } from '../db';
import { languageStateFromProfile } from './languageDefaults';
import type { Language, Profile } from '../types';

export async function switchLanguage(language: Language): Promise<Profile> {
  const profile = await ensureProfile();
  if (profile.language === language) return profile;

  const savedLevels = { ...profile.savedLevels };
  savedLevels[profile.language] = languageStateFromProfile(profile);
  const target = savedLevels[language];

  return patchProfile({
    language,
    level: target.level,
    hardness: target.hardness,
    newWordCap: target.newWordCap,
    consecutiveHard: target.consecutiveHard,
    consecutiveEasy: target.consecutiveEasy,
    furiganaMode: target.furiganaMode,
    savedLevels,
  });
}
