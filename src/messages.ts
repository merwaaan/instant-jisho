import { JishoApiEntry } from './jisho';

// A toggle message to the background script is an order.
// A toggle message from the background script is an information to the UI scripts.
export type Toggle = {
  type: 'toggle';
  value: boolean;
};

export type TranslateRequest = {
  type: 'translate-request';
  words: string[];
};

export type TranslateCancellation = {
  type: 'translate-cancel';
  words: string[];
};

export type TranslateResponse = {
  type: 'translate-response';
  word: string;
  entry: JishoApiEntry | null; // null means no result
};

export type Message = Toggle | TranslateRequest | TranslateCancellation | TranslateResponse;

export function postMessageToPort(message: Message, port: chrome.runtime.Port) {
  port.postMessage(message);
}
