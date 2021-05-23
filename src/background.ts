import sleep from 'sleep-promise';
import { fetchWord, JishoApiEntry } from './jisho';
import LRUCache from 'lru-cache';

// Cache for past fetches
const entriesCache = new LRUCache<string, JishoApiEntry | null>({
  max: 500
});

async function work(request: any, sendResponse: (response?: any) => void) {
  const words = request.words as string[];

  console.log('Received words', words);

  let entries: Record<string, JishoApiEntry | null> = {};

  for (let word of words) {
    console.log(`Fetching word "${word}"`);

    // Check the cache

    const cached = entriesCache.get(word);

    if (cached) {
      console.log('Already in cache', cached);
      entries[word] = cached;
    }

    // Otherwise fetch from Jisho
    else {
      try {
        const result = await fetchWord(word);
        console.log('Received', result);
        entries[word] = result;

        // Cache
        entriesCache.set(word, result);
      } catch (error) {
        console.error(`Cannot fetch word "${word}"`, error);
      }

      await sleep(1000); // TODO not last one!
    }
  }

  sendResponse({ entries });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  work(request, sendResponse);
  return true;
});

export {};
