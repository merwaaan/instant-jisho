import { FormControlLabel, FormGroup, Switch } from '@material-ui/core';
import React from 'react';
import ReactDOM from 'react-dom';

import { Message, postMessageToPort } from './messages';

const port = chrome.runtime.connect();

let TOGGLE = true;

port.onMessage.addListener((message: Message) => {
  if (message.type === 'toggle') {
    TOGGLE = message.value;
    render();
  }
});

function render() {
  ReactDOM.render(
    <React.StrictMode>
      <FormGroup>
        <FormControlLabel
          control={
            <Switch
              checked={TOGGLE}
              onChange={(event, checked) => {
                postMessageToPort({ type: 'toggle', value: !TOGGLE }, port);
              }}
            />
          }
          label='On'
        />
      </FormGroup>
    </React.StrictMode>,
    document.getElementById('root')
  );
}

render();
