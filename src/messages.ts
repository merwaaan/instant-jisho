import { JishoApiEntry } from './jisho';

// TODO cancel translate?

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

export type Message = TranslateRequest | TranslateCancellation | TranslateResponse;

export function postMessageToPort(message: Message, port: chrome.runtime.Port) {
  port.postMessage(message);
}
