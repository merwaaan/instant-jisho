import sleep from 'sleep-promise';
import { fetchWord, JishoApiEntry } from './jisho';

// Cache for past fetches
const entriesCache: Record<string, JishoApiEntry[]> = {};

async function work(request: any, sendResponse: (response?: any) => void) {
  const words = request.words as string[];

  console.log('Received words', words);

  // Each word has multiple Jisho entries
  let entries: Record<string, JishoApiEntry[]> = {};

  for (let word of words) {
    console.log(`Fetching word "${word}"`);

    // Check the cache

    const cached = entriesCache[word];

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
        entriesCache[word] = result;
      } catch (error) {
        console.error(`Cannot fetch word "${word}"`, error);
      }

      await sleep(1000); // TODO not last one!
    }
  }

  sendResponse({ entries });
  sendResponse({ entries });
  sendResponse({ entries });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  work(request, sendResponse);
  return true;
});

export {};
