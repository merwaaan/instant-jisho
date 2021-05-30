import {
  Divider,
  FormControlLabel,
  FormGroup,
  Grid,
  Link,
  Switch,
  ThemeProvider,
  Typography
} from '@material-ui/core';
import React from 'react';
import ReactDOM from 'react-dom';

import { Message, postMessageToPort } from './messages';
import theme from './theme';

const port = chrome.runtime.connect();

let toggled = true;

port.onMessage.addListener((message: Message) => {
  if (message.type === 'toggle') {
    toggled = message.value;
    render();
  }
});

function render() {
  ReactDOM.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <Grid direction='column'>
          <Grid item>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    color='primary'
                    checked={toggled}
                    onChange={(event, checked) => {
                      postMessageToPort({ type: 'toggle', value: !toggled }, port);
                    }}
                  />
                }
                label={toggled ? 'On' : 'Off'}
              />
            </FormGroup>
          </Grid>

          <Grid item>
            <Divider />
          </Grid>

          <Grid item>
            <Typography noWrap variant='caption'>
              Data from{' '}
              <Link href='https://jisho.org/' target='_blank' rel='noreferrer'>
                jisho.org
              </Link>
            </Typography>
          </Grid>
        </Grid>
      </ThemeProvider>
    </React.StrictMode>,
    document.getElementById('root')
  );
}

render();
