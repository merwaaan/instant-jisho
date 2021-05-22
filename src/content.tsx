import { Box, Grid, Paper, Typography } from '@material-ui/core';
import React from 'react';
import ReactDOM from 'react-dom';
import { JishoApiEntry } from './jisho';

console.log('Instant Jisho loaded');

const container = document.createElement('div');
container.id = 'instant-jisho';
document.body.appendChild(container);

document.addEventListener('mouseup', async () => {
  const selection = window.getSelection()?.toString();

  if (!selection) {
    return;
  }

  chrome.runtime.sendMessage({ text: selection }, (response) => {
    console.log(response);
    ReactDOM.render(<Main data={response.data.data} />, container);
  });
});

type Props = {
  data: JishoApiEntry[];
};

function Main(props: Props) {
  const entry = props.data[0];

  // We only list readings for the current slug
  const readings = entry.japanese
    .filter((j) => j.word && j.word === entry.slug)
    .map((j) => j.reading);

  // Ignore "Wikipedia definition" entries that are often redundant
  const meanings = entry.senses.filter(
    (m) => !m.parts_of_speech.map((p) => p.toLowerCase()).includes('wikipedia')
  );

  return (
    <Paper
      style={{
        position: 'fixed',
        top: '50px',
        right: '50px',
        zIndex: 2147483647
      }}
      elevation={4}
    >
      <Box m={1}>
        <Grid container direction='column' spacing={1}>
          <Grid item>
            <Typography variant='h3'>{entry.slug}</Typography>
          </Grid>

          <Grid item>
            {readings.map((r) => (
              <Typography variant='h6'>{r}</Typography>
            ))}
          </Grid>

          {meanings.map((m, i) => (
            <Grid item container direction='row' spacing={1}>
              {/*sense.parts_of_speech.map((part) => (
                <Chip label={part} size='small' />
              ))*/}

              <Grid item>
                <span style={{ color: 'grey' }}>{i}.</span>
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

export {};
