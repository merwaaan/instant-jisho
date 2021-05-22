import { JishoApiResponseSchema } from './jisho';

chrome.runtime.onInstalled.addListener(async () => {});

async function work(
  request: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const response = await fetch(`https://jisho.org/api/v1/search/words?keyword=${request.text}`);
  const json = await response.json();
  console.log(json);
  const validation = JishoApiResponseSchema.safeParse(json);

  if (!validation.success) {
    console.error('Validation error', json, validation.error);
  } else {
    sendResponse({ data: validation.data });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  work(request, sender, sendResponse);
  return true;
});

export {};
