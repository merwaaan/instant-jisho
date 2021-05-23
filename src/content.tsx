import { Box, Button, CircularProgress, Grid, Paper, Typography } from '@material-ui/core';
import ScopedCssBaseline from '@material-ui/core/ScopedCssBaseline';
import { ArrowLeft, ArrowRight, ErrorOutline } from '@material-ui/icons';
import { createPopper } from '@popperjs/core';
import { fit, FuriganaMatch } from 'furigana';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import root from 'react-shadow/material-ui';
// @ts-ignore (no type definitions)
import TinySegmenter from 'tiny-segmenter';

import { JishoApiEntry } from './jisho';

// App state

type WordStateLoading = { type: 'loading' };
type WordStateCompleted = { type: 'completed'; data: JishoApiEntry[] };
type WordStateFailed = { type: 'error'; message: string };

type Word = {
  value: string;
  characterRanges: Range[];
  state: WordStateLoading | WordStateCompleted | WordStateFailed;
};

type Search = {
  // DOM selection
  selection: Selection;

  // Individual words to translate
  words: Word[];
};

let currentSearch: Search | undefined = undefined;

// TEST load a font
// TODO how to pack it in the app instead?

const style = document.createElement('style');
style.innerHTML =
  "@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab&display=swap')";
document.head.appendChild(style);

// Create DOM elements for the extension

// Root container
const rootContainer = document.createElement('div');
rootContainer.id = 'instant-jisho-root-container';
document.body.appendChild(rootContainer);

// Invisible target covering the selected text
// to attach a tooltip onto

function render(search: Search | undefined) {
  ReactDOM.render(
    // Put the UI container in a shadow root to prevent styles
    // from host webpages interfering with our own styling rules
    <root.div mode='closed'>
      <ScopedCssBaseline>{search ? <App search={search} /> : null}</ScopedCssBaseline>
    </root.div>,
    rootContainer
  );
}

//

const segmenter = new TinySegmenter();

document.addEventListener('mouseup', async () => {
  // Retrieve the selected text

  const selection = window.getSelection();

  if (!selection || selection.type !== 'Range') {
    currentSearch = undefined;
    render(currentSearch);
    return;
  }

  // TODO disable selection in tooltip

  const selectedElement = selection.anchorNode?.parentElement;

  if (!selectedElement) {
    currentSearch = undefined;
    render(currentSearch);
    return;
  }

  // TODO check if japanese here

  const selectedText = selection.toString();

  // Split into individual words

  const words = segmenter.segment(selectedText) as string[];

  // TODO remove punctuation?

  // Do nothing if the selection did not change

  if (currentSearch && words.join() === currentSearch.words.map((w) => w.value).join()) {
    return;
  }

  // Compute ranges for each character to later generate bounding boxes and draw underlines

  const selectionRange = selection.getRangeAt(0);

  const wordsRanges: Range[][] = [];

  let charIndex = 0;

  for (let word of words) {
    const wordRanges: Range[] = [];

    for (let char of word) {
      const r = new Range();
      r.setStart(selectionRange.startContainer, selectionRange.startOffset + charIndex);
      r.setEnd(selectionRange.startContainer, selectionRange.startOffset + charIndex + 1);
      ++charIndex;

      wordRanges.push(r);
    }

    wordsRanges.push(wordRanges);
  }

  //

  currentSearch = {
    words: [],
    selection
  };

  for (let w = 0; w < words.length; ++w) {
    currentSearch.words.push({
      value: words[w],
      characterRanges: wordsRanges[w],
      state: { type: 'loading' }
    });
  }

  render(currentSearch);

  // Send to the background script

  chrome.runtime.sendMessage({ words }, (response) => {
    console.debug('response', response);

    // Do nothing if the search has been cancelled
    if (!currentSearch) {
      return;
    }

    // Update the state

    const allEntries = response.entries as Record<string, JishoApiEntry[]>;

    for (let [word, entries] of Object.entries(allEntries)) {
      const wordData = currentSearch?.words.find((t) => t.value === word);
      if (wordData) {
        wordData.state = { type: 'completed', data: entries };
      }
      // TODO handle error
    }

    render(currentSearch);
  });
});

// Root component

function App(props: { search: Search }) {
  // Currently displayed word
  const [wordIndex, setWordIndex] = useState(0);

  if (!currentSearch) {
    return null;
  }

  return (
    <>
      <Tooltip
        search={currentSearch}
        selectedWordIndex={wordIndex}
        onPrevWord={() => setWordIndex(mod(wordIndex - 1, props.search.words.length))}
        onNextWord={() => setWordIndex(mod(wordIndex + 1, props.search.words.length))}
      />
      <Underline search={currentSearch} selectedWordIndex={wordIndex} />
    </>
  );
}

// Tooltip showing the dictionary data
function Tooltip(props: {
  search: Search;
  selectedWordIndex: number;
  onPrevWord: () => void;
  onNextWord: () => void;
}) {
  // Position the tooltip next to the target

  const targetRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (targetRef.current && tooltipRef.current) {
      createPopper(targetRef.current, tooltipRef.current, {
        placement: 'bottom-start',
        modifiers: [
          {
            name: 'offset',
            options: { offset: [0, 30] }
          },
          {
            name: 'preventOverflow',
            options: { padding: 8 }
          }
        ]
      });
    }
  });

  const wordCount = props.search.words.length;

  const word = props.search.words[props.selectedWordIndex];
  const prevWord = props.search.words[mod(props.selectedWordIndex - 1, wordCount)];
  const nextWord = props.search.words[mod(props.selectedWordIndex + 1, wordCount)];

  // Render

  const targetRect = props.search.selection.getRangeAt(0).getBoundingClientRect();

  return (
    <>
      {/* Tooltip target */}
      <div
        ref={targetRef}
        className='instant-jisho-tooltip-target'
        style={{
          position: 'absolute',
          top: `${window.scrollY + targetRect.top}px`,
          height: `${targetRect.height}px`,
          left: `${window.scrollX + targetRect.left}px`,
          width: `${targetRect.width}px`,
          pointerEvents: 'none' // Prevents the invisible target blocking the user's selection
          //background: 'rgba(255, 0, 0, 0.1)' // TODO debug only
        }}
      />

      {/* Tooltip */}
      <Paper
        ref={tooltipRef}
        style={{
          maxWidth: '400px',
          maxHeight: '400px',
          zIndex: 2147483647,
          overflow: 'hidden' // hides the colored line corners overflowing
        }}
        elevation={4}
      >
        {/* Colored line (same as the corresponding underline) */}
        <div
          style={{
            backgroundColor: getColor(props.selectedWordIndex),
            width: '100%',
            height: '10px'
          }}
        />

        {/* Controls */}
        {wordCount > 1 && (
          <Box m={1}>
            <Grid
              container
              direction='row'
              wrap='nowrap'
              justify='space-between'
              alignItems='baseline'
              spacing={1}
            >
              <Grid item>
                {props.selectedWordIndex > 0 && (
                  <Button
                    variant='outlined'
                    disableElevation
                    size='small'
                    startIcon={<ArrowLeft />}
                    style={{
                      //color: 'white',
                      fontWeight: 'bold',
                      color: getColor(props.selectedWordIndex - 1, wordCount),
                      border: '1px solid'
                    }}
                    onClick={props.onPrevWord}
                  >
                    {prevWord.value}
                  </Button>
                )}
              </Grid>
              <Grid item>
                {props.selectedWordIndex < wordCount - 1 && (
                  <Button
                    variant='outlined'
                    disableElevation
                    size='small'
                    endIcon={<ArrowRight />}
                    style={{
                      //color: 'white',
                      fontWeight: 'bold',
                      color: getColor(props.selectedWordIndex + 1, wordCount),
                      border: '1px solid'
                    }}
                    onClick={props.onNextWord}
                  >
                    {nextWord.value}
                  </Button>
                )}
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Page contents */}
        <WordPage word={word} color={getColor(props.selectedWordIndex)} />
      </Paper>
    </>
  );
}

function WordPage(props: { word: Word; color: string }) {
  if (props.word.state.type === 'loading') {
    return (
      <Box m={4}>
        <CircularProgress variant='indeterminate' style={{ color: props.color }} />
      </Box>
    );
  } else if (props.word.state.type === 'error') {
    return (
      <Box m={4}>
        <ErrorOutline />
      </Box>
    );
  } else if (props.word.state.data.length === 0) {
    return (
      <Box m={4}>
        <Typography variant='body1'>No results</Typography>
      </Box>
    );
  } else {
    const entry = props.word.state.data[0];

    // Generate furiganas

    const readingsWritings = entry.japanese.filter(
      (j) => j.word && j.reading && j.word === entry.slug
    );

    const furiganas = readingsWritings
      .map((rw) => fit(rw.word!, rw.reading!, { type: 'object', kanaReading: false }))
      .filter((furi): furi is FuriganaMatch[] => furi !== null); // Filter out failures

    // Ignore "Wikipedia definition" entries that are often redundant

    const meanings = entry.senses.filter(
      (m) => !m.parts_of_speech.some((p) => p.toLowerCase().includes('wikipedia'))
    );

    return (
      <Box m={1}>
        <Grid container direction='column' spacing={1}>
          <Grid item>
            <Furigana readings={furiganas.length > 0 ? furiganas[0] : [{ w: entry.slug }]} />
          </Grid>

          {meanings.map((m, i) => (
            <Grid item container direction='row' wrap='nowrap' spacing={1}>
              {/*sense.parts_of_speech.map((part) => (
                  <Chip label={part} size='small' />
                ))*/}

              <Grid item>
                <Typography variant='body2' style={{ color: 'grey' }}>
                  {i + 1}.
                </Typography>
              </Grid>

              <Grid item>
                <Typography variant='body2' style={{ fontFamily: '"Roboto Slab", serif' }}>
                  {m.english_definitions.join(', ')}
                </Typography>
              </Grid>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }
}

// Japanese words possibly containing kanjis decorated with their hiragana readings
function Furigana(props: { readings: FuriganaMatch[] }) {
  return (
    <Grid container direction='row' wrap='nowrap' justify='space-around'>
      {props.readings.map((match) => (
        <Grid item container direction='column' alignItems='center'>
          <Grid item>
            <Typography variant='h4'>{match.w}</Typography>
          </Grid>
          <Grid item>
            <Typography variant='subtitle1'>{match.r}</Typography>
          </Grid>
        </Grid>
      ))}
    </Grid>
  );
}

function Underline(props: { search: Search; selectedWordIndex: number }) {
  return (
    <>
      {props.search.words.map((word, i) => (
        <WordUnderline
          ranges={word.characterRanges}
          color={getColor(i)}
          thickness={2}
          offset={6}
          selected={i === props.selectedWordIndex}
        />
      ))}
    </>
  );
}

function WordUnderline(props: {
  ranges: Range[];
  color: string;
  thickness: number;
  offset: number;
  selected: boolean;
}) {
  return (
    <>
      {props.ranges.map((range, i) => {
        const rect = range.getBoundingClientRect();

        // Shorten lines at the boundary to prevent neighboring words touching

        const left = window.scrollX + rect.left + (i === 0 ? 1 : 0);
        let width = rect.width - (i === props.ranges.length - 1 ? 2 : 0);

        const top = window.scrollY + rect.bottom + props.offset;
        const heightMultiplier = props.selected ? 2.5 : 1.0;

        return (
          <div
            className='instant-jisho-underline'
            style={{
              backgroundColor: props.color,
              position: 'absolute',
              left: `${left}px`,
              width: `${width}px`,
              top: `${top}px`,
              height: `${props.thickness}px`,
              transform: `scaleY(${heightMultiplier})`,
              transition: 'transform 0.1s ease-out'
            }}
          />
        );
      })}
    </>
  );
}

const colors = ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'];

function getColor(n: number, limit: number | undefined = undefined) {
  return colors[mod(n, limit === undefined ? colors.length : Math.min(limit, colors.length))];
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

console.debug('Instant Jisho loaded');

export {};
