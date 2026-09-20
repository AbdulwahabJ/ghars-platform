import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';
import './i18n';
import {
  recoverFromChunkLoadError,
  reportClientError,
} from './lib/runtime-errors';

document.addEventListener('vite:preloadError', (event) => {
  const error = (event as Event & { payload?: unknown }).payload;
  reportClientError(error);
  if (recoverFromChunkLoadError(error)) event.preventDefault();
});

createRoot(document.getElementById('root')!).render(<App />);
