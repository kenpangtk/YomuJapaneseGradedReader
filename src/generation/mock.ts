import { buildOfflineStory, streamText } from './offline';
import type { GenerationRequest, Provider } from './types';
import { abortError } from './types';

export class MockProvider implements Provider {
  kind = 'mock' as const;

  async generate(
    request: GenerationRequest,
    onText: (chunk: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) throw abortError();
    const result = await buildOfflineStory({
      language: request.language,
      level: request.level,
      topic: request.topic,
      interests: request.interests,
      seed: request.seed,
      reviewWords: request.reviewWords,
      recentStoryIds: request.recentStoryIds,
      withReviewWords: request.reviewWords.length > 0,
    });
    if (signal.aborted) throw abortError();
    const json = JSON.stringify(result.contract);
    await streamText(json, onText, signal);
    return json;
  }
}

export function createMockProvider(): Provider {
  return new MockProvider();
}
