import ScopedCssBaseline from '@material-ui/core/ScopedCssBaseline';
import { ThemeProvider } from '@material-ui/styles';
import React from 'react';
import ReactDOM from 'react-dom';
import root from 'react-shadow/material-ui';

import { App } from './App';
import { Message } from './messages';
import theme from './theme';

// TEST load a font
// TODO how to pack it in the app instead?

const style = document.createElement('style');
style.innerHTML =
  "@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab&display=swap')";
document.head.appendChild(style);

// Establish a connection with the background script

const port = chrome.runtime.connect();

port.onMessage.addListener((message: Message) => {
  if (message.type === 'toggle') {
    render(message.value);
  }
});

// Render the app

const CONTAINER_ID = 'instant-jisho-root-container';

function render(on: boolean) {
  let rootContainer = document.getElementById(CONTAINER_ID);

  if (on) {
    // Create a container if needed
    if (!rootContainer) {
      rootContainer = document.createElement('div');
      rootContainer.id = CONTAINER_ID;
      document.body.appendChild(rootContainer);
    }

    ReactDOM.render(
      // Put the UI container in a shadow root to prevent styles
      // from host webpages interfering with our own styling rules
      <root.div mode='closed'>
        <ScopedCssBaseline>
          <ThemeProvider theme={theme}>
            <App port={port} />
          </ThemeProvider>
        </ScopedCssBaseline>
      </root.div>,
      rootContainer
    );
  } else if (rootContainer) {
    ReactDOM.unmountComponentAtNode(rootContainer);
  }
}

export {};
