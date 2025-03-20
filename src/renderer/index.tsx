import React, {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';

import './styles.css';
import 'devextreme/dist/css/dx.light.css';

const container = document.getElementById('app');
const root = createRoot(container!);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
