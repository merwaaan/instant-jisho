import { Paper, Grid, Box, Button, Link, Typography, CircularProgress } from '@material-ui/core';
import { ArrowBack, ArrowForward, MenuBookRounded } from '@material-ui/icons';
import { createPopper } from '@popperjs/core';
import { FuriganaMatch } from 'furigana';
import _ from 'lodash';
import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore (no type definitions)
import TinySegmenter from 'tiny-segmenter';
import { isJapanese } from 'wanakana';

import { entryToFurigana, entryToRomaji } from './jisho';
import { Message, postMessageToPort } from './messages';
import { State, Word } from './state';

// Main component
export function App(props: { port: chrome.runtime.Port }) {
  // Current search
  const [currentSearch, setCurrentSearch] = useState<State | undefined>(undefined);

  // Currently displayed word
  const [selectedWordIndex, setSelectedWordIndex] = useState(0);

  // Currently hovered word
  const [hoveredWordIndex, setHoveredWordIndex] = useState<number | undefined>();

  // Update when the selection changes

  useEffect(() => {
    // Selection changed: extract the words to translate and send them to the background script
    const onMouseUp = () => {
      const selection = window.getSelection();

      // No selection

      if (!selection || selection.type !== 'Range') {
        if (!currentSearch) {
          return;
        }

        // Cancel the previous selection

        postMessageToPort(
          { type: 'translate-cancel', words: currentSearch.words.map((word) => word.value) },
          props.port
        );

        setCurrentSearch(undefined);

        return;
      }

      // Active selection
      // Split the selection into individual words

      const selectedText = selection.toString();

      const segmenter = new TinySegmenter();
      const segments = segmenter.segment(selectedText) as string[];

      let words = segments
        // Remove spaces, punctuation
        .map((segment) =>
          segment.replace(
            /[\s、，;。…‥:：！!?？「」（）()〔〕［］[\]｛｝{}｟｠〈〉《》【】〖〗〘〙〚〛『』]/g,
            ''
          )
        )
        // Remove words with non-japanese characters
        .filter((segment) => isJapanese(segment))
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

      setCurrentSearch({
        words: words.map((word, i) => ({
          value: word,
          characterRanges: wordsRanges[i],
          state: { type: 'loading' }
        })),
        selection
      });

      setSelectedWordIndex(0);

      // Send to the background script

      postMessageToPort(
        {
          type: 'translate-request',
          words
        },
        props.port
      );
    };

    const onMessage = (message: Message) => {
      console.log(message);
      if (message.type === 'translate-response') {
        setCurrentSearch((prevSearch) => {
          // Do nothing if there's no active search anymore

          if (!prevSearch) {
            return prevSearch;
          }

          // Update the translated word's state
          // (can have multiple instances)

          const newSearch: State = _.cloneDeep(prevSearch);

          newSearch.words = newSearch.words.map((word) =>
            word.value === message.word
              ? { ...word, state: { type: 'completed', entry: message.entry } }
              : word
          );

          return newSearch;
        });
      }
    };

    document.addEventListener('mouseup', onMouseUp);
    props.port.onMessage.addListener(onMessage);

    // Clean up listeners
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      props.port.onMessage.removeListener(onMessage);
    };
  }, [currentSearch, props.port]);

  // Render

  return currentSearch === undefined ? null : (
    <>
      <Tooltip
        search={currentSearch}
        selectedWordIndex={selectedWordIndex}
        onChangeWord={(wordIndex) => setSelectedWordIndex(wordIndex)}
        onHoverWord={(wordIndex) => setHoveredWordIndex(wordIndex)}
      />
      <Underline
        words={currentSearch.words}
        selectedWordIndex={selectedWordIndex}
        hoveredWordIndex={hoveredWordIndex}
      />
    </>
  );
}

// Tooltip showing the dictionary info next to the selected text
function Tooltip(props: {
  search: State;
  selectedWordIndex: number;
  onChangeWord: (wordIndex: number) => void;
  onHoverWord: (wordIndex: number | undefined) => void;
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

  //

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
          zIndex: 2147483647,
          overflow: 'hidden' // hides the colored line corners overflowing
        }}
        elevation={4}
        onMouseUp={(event) => {
          // Intercept the event so that clicks in the tooltip do not cancel/trigger selections
          event.stopPropagation();
        }}
      >
        {/* Colored line (same as the corresponding underline) */}
        <div
          style={{
            backgroundColor: getColor(props.selectedWordIndex),
            width: '100%',
            height: '10px'
          }}
        />

        <Grid container direction='column' spacing={1} wrap='nowrap'>
          {/* Controls */}
          {wordCount > 1 && (
            <Grid item>
              <Box m={1}>
                <Grid container direction='row' alignItems='baseline' spacing={1}>
                  <Grid item xs={6}>
                    {props.selectedWordIndex > 0 && (
                      <Button
                        fullWidth
                        variant='outlined'
                        disableElevation
                        size='small'
                        startIcon={<ArrowBack />}
                        onMouseEnter={() => props.onHoverWord(props.selectedWordIndex - 1)}
                        onMouseLeave={() => props.onHoverWord(undefined)}
                        style={{
                          justifyContent: 'flex-start',
                          fontWeight: 'bold',
                          color: getColor(props.selectedWordIndex - 1, wordCount),
                          border: '1px solid'
                        }}
                        onClick={() => props.onChangeWord(props.selectedWordIndex - 1)}
                      >
                        {prevWord.value}
                      </Button>
                    )}
                  </Grid>
                  <Grid item xs={6}>
                    {props.selectedWordIndex < wordCount - 1 && (
                      <Button
                        fullWidth
                        variant='outlined'
                        disableElevation
                        size='small'
                        endIcon={<ArrowForward />}
                        onMouseEnter={() => props.onHoverWord(props.selectedWordIndex + 1)}
                        onMouseLeave={() => props.onHoverWord(undefined)}
                        style={{
                          justifyContent: 'flex-end',
                          fontWeight: 'bold',
                          color: getColor(props.selectedWordIndex + 1, wordCount),
                          border: '1px solid'
                        }}
                        onClick={() => props.onChangeWord(props.selectedWordIndex + 1)}
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

// Definition for a single word
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
        <Grid container direction='column' spacing={3}>
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

          {/* Meanings */}
          <Grid item container direction='column'>
            {meanings.map((m, i) => (
              <Grid item container direction='row' alignItems='baseline' spacing={1} wrap='nowrap'>
                <Grid item>
                  <Typography variant='body2' style={{ color: 'grey' }}>
                    {i + 1}.
                  </Typography>
                </Grid>

                {m.parts_of_speech.length > 0 && (
                  <Grid item>
                    <span
                      style={{
                        textTransform: 'uppercase',
                        fontSize: '0.65rem',
                        color: 'limegreen',
                        border: '1px solid limegreen',
                        borderRadius: '2px',
                        padding: '0.05rem 0.2rem'
                      }}
                    >
                      {m.parts_of_speech[0]}
                    </span>
                  </Grid>
                )}

                <Grid item>
                  <Typography variant='body2' style={{ fontFamily: '"Roboto Slab", serif' }}>
                    {m.english_definitions
                      // Capitalize the first word
                      .map((def, i) =>
                        i === 0 ? def.charAt(0).toUpperCase() + def.substring(1) : def
                      )
                      .join('; ')}
                  </Typography>
                </Grid>
              </Grid>
            ))}
          </Grid>

          {/* Jisho link */}
          <Grid item style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
            <Link
              href={`https://jisho.org/word/${entry.slug}`}
              target='_blank'
              rel='noreferrer'
              color='textSecondary'
              style={{ display: 'flex', flexWrap: 'nowrap' }}
            >
              <MenuBookRounded fontSize='small' style={{ marginRight: '0.5rem' }} />
              <Typography variant='body2' style={{ fontSize: '0.8rem' }}>
                jisho.org page
              </Typography>
            </Link>
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
            <Typography variant='h4' style={{ wordBreak: 'keep-all' }}>
              {match.w}
            </Typography>
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

// Underline effect for all the words
function Underline(props: {
  words: Word[];
  selectedWordIndex: number;
  hoveredWordIndex: number | undefined;
}) {
  return (
    <>
      {props.words.map((word, i) => (
        <WordUnderline
          ranges={word.characterRanges}
          color={getColor(i)}
          thickness={2}
          offset={6}
          selected={i === props.selectedWordIndex}
          hovered={i === props.hoveredWordIndex}
        />
      ))}
    </>
  );
}

// Underline effect for a single word
function WordUnderline(props: {
  ranges: Range[];
  color: string;
  thickness: number;
  offset: number;
  selected: boolean;
  hovered: boolean;
}) {
  return (
    <>
      {props.ranges.map((range, i) => {
        const rect = range.getBoundingClientRect();

        // Shorten lines at the boundary to prevent neighboring words touching

        const left = window.scrollX + rect.left + (i === 0 ? 1 : 0);
        let width = rect.width - (i === props.ranges.length - 1 ? 2 : 0);

        const top = window.scrollY + rect.bottom + props.offset;
        const heightMultiplier = props.selected ? 3 : props.hovered ? 2.0 : 1.0;

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

// Utils

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}
