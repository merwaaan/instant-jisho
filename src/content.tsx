import { Box, Grid, Paper, Typography } from '@material-ui/core';
import ScopedCssBaseline from '@material-ui/core/ScopedCssBaseline';
import { createPopper } from '@popperjs/core';
import { fit, FuriganaMatch } from 'furigana';
import React from 'react';
import ReactDOM from 'react-dom';
import root from 'react-shadow/material-ui';

import { JishoApiEntry } from './jisho';

const container = document.createElement('div');
container.id = 'instant-jisho-container';
document.body.appendChild(container);

const target = document.createElement('div');
target.style.background = 'rgba(255, 0, 0, 0.25)';
target.style.position = 'absolute';
document.body.appendChild(target);

let done = false;

//

document.addEventListener('mouseup', async () => {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const selectedElement = selection.anchorNode?.parentElement;

  if (!selectedElement) {
    return;
  }
  console.log(selectedElement, selection.getRangeAt(0).getBoundingClientRect());

  const bbox = selection.getRangeAt(0).getBoundingClientRect();

  /*if (!done)*/ {
    target.style.top = window.scrollY + bbox.top + 'px';
    target.style.left = window.scrollX + bbox.left + 'px';
    target.style.height = bbox.height + 'px';
    target.style.width = bbox.width + 'px';
    done = true;
  }

  chrome.runtime.sendMessage({ text: selection.toString() }, (response) => {
    console.log(response);
    ReactDOM.render(
      // Put the UI container in a shadow root to prevent styles
      // from host webpages interfering with our own styling rules
      <root.div>
        <ScopedCssBaseline>
          <Main data={response.data.data} />
        </ScopedCssBaseline>
      </root.div>,
      container,
      () => createPopper(target, container)
    );
  });
});

function Main(props: { data: JishoApiEntry[] }) {
  const entry = props.data[0];

  // Generate furiganas

  const readingsWritings = entry.japanese.filter(
    (j) => j.word && j.reading && j.word === entry.slug
  ); // TODO type not undef, rem !

  const furiganas = readingsWritings
    .map((rw) => fit(rw.word!, rw.reading!, { type: 'object', kanaReading: false }))
    .filter((furi): furi is FuriganaMatch[] => furi !== null); // Filter out failures

  console.log(furiganas);

  // Ignore "Wikipedia definition" entries that are often redundant

  const meanings = entry.senses.filter(
    (m) => !m.parts_of_speech.some((p) => p.toLowerCase().includes('wikipedia'))
  );

  return (
    <Paper
      /*style={{
        zIndex: 2147483647
      }}*/
      elevation={4}
    >
      <Box m={1}>
        <Grid container direction='column' spacing={1}>
          <Grid item>
            <Furigana readings={furiganas.length > 0 ? furiganas[0] : [{ w: entry.slug }]} />
          </Grid>

          {meanings.map((m, i) => (
            <Grid item container direction='row' spacing={1}>
              {/*sense.parts_of_speech.map((part) => (
                <Chip label={part} size='small' />
              ))*/}

              <Grid item>
                <span style={{ color: 'grey' }}>{i + 1}.</span>
              </Grid>

              <Grid item>
                <Typography variant='body1'>{m.english_definitions.join(', ')}</Typography>
              </Grid>
              {/*m.english_definitions.map((def) => (
                  <Typography variant='body1'>{def}</Typography>
                ))*/}
            </Grid>
          ))}
        </Grid>
      </Box>
    </Paper>
  );
}

function Furigana(props: { readings: FuriganaMatch[] }) {
  return (
    <Grid container direction='row' wrap='nowrap'>
      {props.readings.map((match) => (
        <Grid item container direction='column' alignItems='center'>
          <Grid item>
            <Typography variant='h3'>{match.w}</Typography>
          </Grid>
          <Grid item>
            <Typography variant='subtitle1'>{match.r}</Typography>
          </Grid>
        </Grid>
      ))}
    </Grid>
  );
}

console.log('Instant Jisho loaded');

export {};
