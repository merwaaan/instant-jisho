import ScopedCssBaseline from '@material-ui/core/ScopedCssBaseline';
import React from 'react';
import ReactDOM from 'react-dom';
import root from 'react-shadow/material-ui';

import { App } from './App';

// TEST load a font
// TODO how to pack it in the app instead?

const style = document.createElement('style');
style.innerHTML =
  "@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab&display=swap')";
document.head.appendChild(style);

// Establish a connection with the background script

const port = chrome.runtime.connect();

// Render the app

const rootContainer = document.createElement('div');
rootContainer.id = 'instant-jisho-root-container';
document.body.appendChild(rootContainer);

ReactDOM.render(
  // Put the UI container in a shadow root to prevent styles
  // from host webpages interfering with our own styling rules
  <root.div mode='closed'>
    <ScopedCssBaseline>
      <App port={port} />
    </ScopedCssBaseline>
  </root.div>,
  rootContainer
);

export {};
