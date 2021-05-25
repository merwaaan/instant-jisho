import LRUCache from 'lru-cache';

import { fetchWord, JishoApiEntry } from './jisho';
import { Message, postMessageToPort } from './messages';

// Cache for past fetches

const cache = new LRUCache<string, JishoApiEntry | null>({
  max: 500
});

// Queued words to translate

type QueueItem = {
  word: string;

  // Ports to send the response to
  // (array to support multiple tabs requesting the same word)
  receivers: Set<chrome.runtime.Port>;
};

let queue: QueueItem[] = [];

// Translate queued words at a fixed interval

const THROTTLE_INTERVAL = 5_000;

setInterval(async () => {
  const item = queue.shift();

  if (item === undefined) {
    return;
  }

  try {
    console.log(`Dequeuing ${item.word}`);

    const entry = await fetchWord(item.word);
    cache.set(item.word, entry);

    item.receivers.forEach((port) =>
      postMessageToPort({ type: 'translate-response', word: item.word, entry }, port)
    );
  } catch (error) {
    console.error(`Cannot fetch ${item.word}`, error);
  }
}, THROTTLE_INTERVAL);

// Establish connections with tabs

chrome.runtime.onConnect.addListener((port) => {
  console.log('Connected', port.sender?.url);

  // Handle incoming messages
  port.onMessage.addListener((message: Message) => {
    if (message.type === 'translate-request') {
      console.log('Translation request', message.words);

      for (let word of message.words) {
        // Word already in cache? Send the answer immediately
        const cached = cache.get(word);
        if (cached) {
          console.log(`${cached} already in cache`);
          postMessageToPort({ type: 'translate-response', word, entry: cached }, port);
        }

        // Otherwise queue for translation
        // (if not already queued)
        else {
          console.log(`Queuing ${word}`);

          const queued = queue.find((item) => item.word === word);
          if (queued) {
            queued.receivers.add(port);
          } else {
            queue.push({ word, receivers: new Set([port]) });
          }
        }
      }
    }

    // TODO cancellation?
  });

  // Handle disconnections
  port.onDisconnect.addListener((port) => {
    console.log('Disconnected', port.sender?.url);

    queue.forEach((item) => item.receivers.delete(port));

    // Remove queued items with no receivers left
    queue = queue.filter((item) => item.receivers.size > 0);
  });
});

export {};
