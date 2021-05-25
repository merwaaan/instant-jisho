import { Box, Button, CircularProgress, Grid, Paper, Typography } from '@material-ui/core';
import ScopedCssBaseline from '@material-ui/core/ScopedCssBaseline';
import { ArrowLeft, ArrowRight } from '@material-ui/icons';
import { createPopper } from '@popperjs/core';
import { FuriganaMatch } from 'furigana';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import root from 'react-shadow/material-ui';
// @ts-ignore (no type definitions)
import TinySegmenter from 'tiny-segmenter';
import { isJapanese } from 'wanakana';

import { entryToFurigana, entryToRomaji, JishoApiEntry } from './jisho';
import { Message, postMessageToPort } from './messages';

// App state

type WordStateLoading = { type: 'loading' };
type WordStateCompleted = { type: 'completed'; entry: JishoApiEntry | null };

type Word = {
  value: string;
  characterRanges: Range[];
  state: WordStateLoading | WordStateCompleted;
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

// Establish a connection with the background script

const port = chrome.runtime.connect();

port.onMessage.addListener((message: Message) => {
  if (message.type === 'translate-response') {
    // Do nothing if there's no active search anymore
    if (!currentSearch) {
      return;
    }

    // Update the state of the translate word (can have multiple instances)
    for (let word of currentSearch.words) {
      if (word.value === message.word) {
        word.state = { type: 'completed', entry: message.entry };
      }
    }

    render(currentSearch);
  }
});

// Selection changed? Extract the words to translate and send them to the background script
document.addEventListener('mouseup', async () => {
  const selection = window.getSelection();

  // No selection: reset the state

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

  // Split the selection into individual words

  const selectedText = selection.toString();

  const segments = segmenter.segment(selectedText) as string[];

  let words = segments
    .map((segment) =>
      segment.replace(
        /[\s、，;。…‥:：！!?？「」（）()〔〕［］[\]｛｝{}｟｠〈〉《》【】〖〗〘〙〚〛]/g,
        ''
      )
    ) // Remove spaces, punctuation
    .filter((segment) => isJapanese(segment)) // Remove words with non-japanese characters
    .filter((segment) => segment.length > 0);

  // Do nothing more if the selection has not changed since last time

  if (currentSearch && words.join() === currentSearch.words.map((w) => w.value).join()) {
    return;
  }

  // Compute the range of each character of each word to later generate bounding boxes and draw underlines

  const computeCharacterRanges = (): Range[][] => {
    // Collect the nodes that contain the selected text

    const range = selection.getRangeAt(0);

    const nodeIterator = document.createNodeIterator(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT
    );

    const rangeNodes = [];

    while (nodeIterator.nextNode()) {
      // Ignore nodes that precede the selection
      if (rangeNodes.length === 0 && nodeIterator.referenceNode !== range.startContainer) {
        continue;
      }

      rangeNodes.push(nodeIterator.referenceNode);

      // Ignore nodes that follow the selection
      if (nodeIterator.referenceNode === range.endContainer) {
        break;
      }
    }

    // Traverse the nodes and look for the characters that make up our words.
    // For each character, create a range.

    const ranges: Range[][] = [];
    words.forEach(() => ranges.push([]));

    const wordQueue = [...words];
    let wordIndex = 0;

    for (let nodeIndex = 0; nodeIndex < rangeNodes.length; ++nodeIndex) {
      const node = rangeNodes[nodeIndex];

      const nodeText = node.nodeValue;
      if (!nodeText) {
        continue;
      }

      const charStart = nodeIndex === 0 ? range.startOffset : 0;

      for (let charIndex = charStart; charIndex < nodeText.length; ++charIndex) {
        // Found the next character?
        if (nodeText[charIndex] === wordQueue[0][0]) {
          const charRange = new Range();
          charRange.setStart(node, charIndex);
          charRange.setEnd(node, charIndex + 1);
          ranges[wordIndex].push(charRange);

          wordQueue[0] = wordQueue[0].substring(1);
        }

        // Completed the current word?
        if (wordQueue[0].length === 0) {
          wordQueue.splice(0, 1);
          ++wordIndex;
        }

        // Completed all the words?
        if (wordQueue.length === 0) {
          return ranges;
        }
      }
    }

    return ranges;
  };

  const wordsRanges = computeCharacterRanges();

  // Save the new state

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

  postMessageToPort(
    {
      type: 'translate-request',
      words
    },
    port
  );
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
          //minWidth: '200px',
          //minHeight: '200px',
          //maxWidth: '350px',
          //maxHeight: '35px',
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

        <Grid container direction='column' spacing={1}>
          {/* Controls */}
          {wordCount > 1 && (
            <Grid item>
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
            </Grid>
          )}

          {/* Page contents */}
          <Grid item>
            <WordPage word={word} color={getColor(props.selectedWordIndex)} />
          </Grid>
        </Grid>
      </Paper>
    </>
  );
}

function WordPage(props: { word: Word; color: string }) {
  if (props.word.state.type === 'loading') {
    return (
      <Box m={6}>
        <Grid container direction='column' alignItems='center' spacing={3}>
          <Grid item>
            <Typography variant='body2' style={{ color: '#bbbbbb' }}>
              Translating <span style={{ fontWeight: 'bold' }}>{props.word.value}</span>
            </Typography>
          </Grid>
          <Grid item>
            <CircularProgress variant='indeterminate' style={{ color: '#bbbbbb' }} />
          </Grid>
        </Grid>
      </Box>
    );
  } else if (props.word.state.entry === null) {
    return (
      <Box m={4}>
        <Grid container direction='column' alignItems='center' spacing={3}>
          <Grid item>
            <Typography variant='body2' style={{ color: '#bbbbbb' }}>
              No results for <span style={{ fontWeight: 'bold' }}>{props.word.value}</span>
            </Typography>
          </Grid>
          <Grid item>
            <span style={{ color: '#bbbbbb', fontFamily: 'monospace' }}>
              {getKaomoji(props.word.value)}
            </span>
          </Grid>
        </Grid>
      </Box>
    );
  } else {
    const entry = props.word.state.entry;

    // Ignore "Wikipedia definition" entries that are often redundant

    const meanings = entry.senses.filter(
      (m) => !m.parts_of_speech.some((p) => p.toLowerCase().includes('wikipedia'))
    );

    // TODO ignore duplicates?

    const furigana = entryToFurigana(entry);
    const romaji = entryToRomaji(entry);

    return (
      <Box m={1}>
        <Grid container direction='column' spacing={2}>
          <Grid
            item
            container
            direction='row'
            justify='space-around'
            alignItems='baseline'
            spacing={4}
          >
            {/* Furigana */}
            <Grid item>
              <Furigana readings={furigana} />
            </Grid>

            {/* Romaji */}
            {romaji && (
              <Grid item>
                <Typography variant='h6' color='textSecondary'>
                  {romaji}
                </Typography>
              </Grid>
            )}
          </Grid>

          <Grid item container direction='column'>
            {meanings.map((m, i) => (
              <Grid item container direction='row' alignItems='baseline' spacing={1} wrap='nowrap'>
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
            <Typography variant='subtitle1' style={{ wordBreak: 'keep-all' }}>
              {match.r}
            </Typography>
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
        const heightMultiplier = props.selected ? 3 : 1.0;

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
          ></div>
        );
      })}
    </>
  );
}

// Colors

const colors = ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'];

function getColor(n: number, limit: number | undefined = undefined) {
  return colors[mod(n, limit === undefined ? colors.length : Math.min(limit, colors.length))];
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

// Kaomojis

const kaomojis = [
  '●︿●',
  'ಠ_ಠ',
  'ಠ▃ಠ',
  '(˵¯͒⌢͗¯͒˵)',
  '(;﹏;)',
  '( ب_ب )',
  '(⁎˃ᆺ˂)',
  '.·´¯`(>▂<)´¯`·.'
];

function getKaomoji(word: string) {
  const hash = Array.from(word).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return kaomojis[hash % kaomojis.length];
}

console.debug('Instant Jisho loaded');

export {};
