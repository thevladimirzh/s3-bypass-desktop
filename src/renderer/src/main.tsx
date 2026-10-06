import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

// Boot marker: proves the bundle executed under the active CSP (M0-19 / S3-3).
console.info('[s3-bypass-desktop] renderer boot');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
