// App state

import { JishoApiEntry } from './jisho';

type WordStateLoading = { type: 'loading' };
type WordStateCompleted = { type: 'completed'; entry: JishoApiEntry | null };

export type Word = {
  value: string;
  characterRanges: Range[];
  state: WordStateLoading | WordStateCompleted;
};

export type State = {
  // DOM selection
  selection: Selection;

  // Individual words to translate
  words: Word[];
};
