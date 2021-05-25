import LRUCache from 'lru-cache';

import { fetchWord, JishoApiEntry } from './jisho';
import { Message, postMessageToPort } from './messages';

const THROTTLE_INTERVAL = 1_000;

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

setInterval(async () => {
  const item = queue.shift();

  if (item === undefined) {
    return;
  }

  try {
    console.log(`Dequeuing ${item.word}`);

    const entry = await fetchWord(item.word);
    console.log(item.word, entry);

    cache.set(item.word, entry);

    item.receivers.forEach((port) =>
      postMessageToPort({ type: 'translate-response', word: item.word, entry }, port)
    );
  } catch (error) {
    console.error(`Cannot fetch ${item.word}`, error);
  }
}, THROTTLE_INTERVAL);

// Establish connections with other scripts

const allPorts: Set<chrome.runtime.Port> = new Set();

chrome.runtime.onConnect.addListener((port) => {
  console.log('Connected', port.sender?.url);

  allPorts.add(port);

  // Send the toggle state
  chrome.storage.sync.get({ toggle: true }, (data) => {
    postMessageToPort({ type: 'toggle', value: data.toggle }, port);
  });

  // Handle incoming messages
  port.onMessage.addListener((message: Message) => {
    // Toggle on/off
    if (message.type === 'toggle') {
      console.log('Toggle', message.value);

      // Store the new state
      chrome.storage.sync.set({ toggle: message.value });

      // Forward to the connected receivers
      allPorts.forEach((port) => postMessageToPort(message, port));
    }

    // Translate request
    else if (message.type === 'translate-request') {
      console.log('Translation request', message.words);

      for (let word of message.words) {
        // Word already in cache? Send the answer immediately
        const cached = cache.get(word);
        if (cached) {
          console.log(`${word} already in cache`);
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

    // Translate cancellation
    else if (message.type === 'translate-cancel') {
      message.words.forEach((word) => {
        console.log(`Cancelling ${word}`);

        const queued = queue.find((item) => item.word === word);

        if (queued) {
          queued.receivers.delete(port);
        }
      });

      // Remove queued items with no receivers left
      queue = queue.filter((item) => item.receivers.size > 0);
    }
  });

  // Handle disconnections
  port.onDisconnect.addListener((port) => {
    console.log('Disconnected', port.sender?.url);

    allPorts.delete(port);

    // Unqueue items for the disconnected receiver
    queue.forEach((item) => item.receivers.delete(port));
    queue = queue.filter((item) => item.receivers.size > 0);
  });
});

export {};
